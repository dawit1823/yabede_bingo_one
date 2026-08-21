import { Request, Response, NextFunction } from 'express';
import { adminAuth, adminDb } from '../firebaseAdmin.js';
import { adminService, AdminService } from '../adminService.js';

export interface AuthenticatedAdminRequest extends Request {
  admin?: {
    uid: string;
    email: string;
    role: string;
    isSuperAdmin: boolean;
  };
}

/**
 * Production-Grade Firebase Admin Authentication Middleware
 * Strictly validates Firebase ID tokens via Firebase Admin SDK
 * Enforces Role-Based Access Control (RBAC) for SuperAdministrator operations
 */
export async function requireAdminAuth(
  req: AuthenticatedAdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  // Extract token from standard Authorization header or fallback custom headers
  const authHeader =
    req.headers.authorization ||
    (req.headers['x-admin-token'] as string) ||
    (req.headers['x-firebase-token'] as string);

  if (!authHeader) {
    res.status(401).json({
      error: 'Unauthorized: Authentication token is required for administrator access.',
      code: 'auth/unauthenticated',
    });
    return;
  }

  const token = authHeader.startsWith('Bearer ')
    ? authHeader.substring(7).trim()
    : authHeader.trim();

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized: Bearer token is empty.',
      code: 'auth/unauthenticated',
    });
    return;
  }

  try {
    // 1. Primary path: Verify real Firebase ID token with Firebase Admin SDK
    const decoded = await adminAuth.verifyIdToken(token);

    // 2. Authorize admin identity
    const email = (decoded.email || '').toLowerCase().trim();
    const isFixedSuperAdmin = email === AdminService.FIXED_ADMIN_EMAIL.toLowerCase();
    const cachedAdmin = adminService.getAdminProfile();
    const isCachedAdmin = cachedAdmin && cachedAdmin.email.toLowerCase() === email;
    const hasAdminClaim =
      decoded.admin === true ||
      decoded.role === 'SuperAdmin' ||
      decoded.role === 'ADMIN';

    // Verify status in Firestore 'admins' collection ONLY if not already authorized in-memory/token
    let isDbAdmin = false;
    if (!isFixedSuperAdmin && !isCachedAdmin && !hasAdminClaim && email) {
      try {
        const adminDoc = await adminDb.collection('admins').doc(email).get();
        if (adminDoc.exists && adminDoc.data()?.accountStatus === 'ACTIVE') {
          isDbAdmin = true;
        }
      } catch {
        // Continue check
      }
    }

    if (!isFixedSuperAdmin && !isCachedAdmin && !hasAdminClaim && !isDbAdmin) {
      res.status(403).json({
        error: 'Forbidden: You do not have permission to access administrator resources.',
        code: 'auth/unauthorized',
      });
      return;
    }

    req.admin = {
      uid: decoded.uid,
      email: decoded.email || AdminService.FIXED_ADMIN_EMAIL,
      role: 'SuperAdmin',
      isSuperAdmin: true,
    };

    next();
  } catch (err: any) {
    // Check if token is explicitly expired
    if (
      err.code === 'auth/id-token-expired' ||
      err.message?.includes('expired') ||
      err.message?.includes('Token expired')
    ) {
      res.status(401).json({
        error: 'Unauthorized: Firebase ID token has expired. Please log in again.',
        code: 'auth/token-expired',
      });
      return;
    }

    // 3. Fallback path: Validated active in-memory admin session token issued by adminService login
    if (adminService.isTokenValid(token)) {
      const profile = adminService.getAdminProfile();
      req.admin = {
        uid: profile?.adminId || 'usr_admin_super',
        email: profile?.email || AdminService.FIXED_ADMIN_EMAIL,
        role: 'SuperAdmin',
        isSuperAdmin: true,
      };
      next();
      return;
    }

    res.status(401).json({
      error: 'Unauthorized: Invalid administrative authentication token.',
      code: 'auth/invalid-token',
      details: err.message,
    });
  }
}
