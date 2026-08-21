import React, { useEffect, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  AuditLog,
  SystemMetrics,
  UserProfile,
  WithdrawalRequest,
} from '@shared/types';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminLoginModal } from './components/AdminLoginModal';
import { apiUrl, getSocketUrl } from '@shared/apiConfig';
import { ShieldCheck, ShieldAlert, Lock, Mail, KeyRound, AlertCircle, CheckCircle2, RefreshCw, ArrowRight } from 'lucide-react';

export default function AdminApp() {
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    return Boolean(sessionStorage.getItem('ahun_admin_token') || localStorage.getItem('ahun_admin_token'));
  });
  const [adminProfile, setAdminProfile] = useState<any>(() => {
    const saved = sessionStorage.getItem('ahun_admin_profile') || localStorage.getItem('ahun_admin_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  });

  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [socket, setSocket] = useState<Socket | null>(null);

  // Standalone Login Form State
  const FIXED_EMAIL = 'dawitsolomon1823@gmail.com';
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccess, setLoginSuccess] = useState<string | null>(null);
  const [showForgotModal, setShowForgotModal] = useState(false);

  // Socket.IO for real-time admin sync
  useEffect(() => {
    if (!isAdminAuthenticated) return;

    const socketUrl = getSocketUrl();
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    newSocket.on('connect', () => {
      console.log('Admin connected to backend Socket.IO');
    });

    newSocket.on('metrics:updated', (data: SystemMetrics) => {
      if (data) setMetrics(data);
    });

    newSocket.on('withdrawals:pending', (data: { requests: WithdrawalRequest[] }) => {
      if (data && data.requests) setPendingWithdrawals(data.requests);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [isAdminAuthenticated]);

  // Fetch admin data on auth
  const fetchAdminData = useCallback(async () => {
    const token = sessionStorage.getItem('ahun_admin_token') || localStorage.getItem('ahun_admin_token');
    if (!token) return;

    try {
      // 1. Fetch Metrics
      const resMetrics = await fetch(apiUrl('/api/admin/metrics'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-admin-token': token,
        },
      });
      if (resMetrics.ok) {
        const data = await resMetrics.json();
        setMetrics(data);
      }

      // 2. Fetch Pending Withdrawals
      const resWithdrawals = await fetch(apiUrl('/api/admin/withdrawals/pending'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-admin-token': token,
        },
      });
      if (resWithdrawals.ok) {
        const data = await resWithdrawals.json();
        setPendingWithdrawals(data.requests || []);
      }

      // 3. Fetch Audit Logs
      const resLogs = await fetch(apiUrl('/api/admin/audit-logs'), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-admin-token': token,
        },
      });
      if (resLogs.ok) {
        const data = await resLogs.json();
        setAuditLogs(data.logs || []);
      }
    } catch (err) {
      console.error('Error fetching admin data:', err);
    }
  }, []);

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchAdminData();
      const interval = setInterval(fetchAdminData, 10000);
      return () => clearInterval(interval);
    }
  }, [isAdminAuthenticated, fetchAdminData]);

  // Direct login submit handler
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setLoginSuccess(null);

    if (!password) {
      setLoginError('Please enter administrator password.');
      return;
    }

    setLoginLoading(true);

    try {
      const res = await fetch(apiUrl('/api/admin/auth/login-step1'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: FIXED_EMAIL, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.error || 'Authentication failed');
      }

      setLoginSuccess('Authentication successful! Loading dashboard...');
      sessionStorage.setItem('ahun_admin_token', data.token);
      localStorage.setItem('ahun_admin_token', data.token);
      if (data.admin) {
        sessionStorage.setItem('ahun_admin_profile', JSON.stringify(data.admin));
        setAdminProfile(data.admin);
      }

      setTimeout(() => {
        setIsAdminAuthenticated(true);
        setLoginLoading(false);
      }, 600);
    } catch (err: any) {
      setLoginLoading(false);
      setLoginError(err.message || 'Incorrect password or server error');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('ahun_admin_token');
    sessionStorage.removeItem('ahun_admin_profile');
    localStorage.removeItem('ahun_admin_token');
    localStorage.removeItem('ahun_admin_profile');
    setIsAdminAuthenticated(false);
    setAdminProfile(null);
  };

  const handleProcessWithdrawal = async (id: string, approve: boolean) => {
    const token = sessionStorage.getItem('ahun_admin_token') || localStorage.getItem('ahun_admin_token') || '';
    const endpoint = approve
      ? `/api/admin/withdrawals/${id}/approve`
      : `/api/admin/withdrawals/${id}/reject`;

    const res = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-admin-token': token,
      },
      body: JSON.stringify({
        adminNotes: approve ? 'Approved via SuperAdmin Web Portal' : 'Rejected by SuperAdmin',
      }),
    });

    if (res.ok) {
      fetchAdminData();
    }
  };

  const handleSearchUsers = async (q: string): Promise<UserProfile[]> => {
    const token = sessionStorage.getItem('ahun_admin_token') || localStorage.getItem('ahun_admin_token') || '';
    try {
      const res = await fetch(apiUrl(`/api/admin/users/search?q=${encodeURIComponent(q)}`), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-admin-token': token,
        },
      });
      if (res.ok) {
        const data = await res.json();
        return data.users || [];
      }
    } catch (err) {
      console.error(err);
    }
    return [];
  };

  const handleAdjustBalance = async (userId: string, amount: number, reason: string) => {
    const token = sessionStorage.getItem('ahun_admin_token') || localStorage.getItem('ahun_admin_token') || '';
    await fetch(apiUrl('/api/admin/wallet/adjust'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-admin-token': token,
      },
      body: JSON.stringify({ userId, amount, reason }),
    });
    fetchAdminData();
  };

  // If NOT authenticated, render standalone SuperAdmin Login Page
  if (!isAdminAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 selection:bg-amber-500 selection:text-slate-950">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 relative overflow-hidden">
          {/* Decorative Glow */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex flex-col items-center text-center space-y-2 mb-6">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-xl shadow-amber-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <ShieldCheck className="w-7 h-7 text-amber-400" />
              </div>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              Ahun Bingo SuperAdmin
            </h1>
            <p className="text-xs text-slate-400">
              Enterprise Control, Real-Time Rooms & Financial Settlement
            </p>
          </div>

          {/* Alerts */}
          {loginError && (
            <div className="mb-4 bg-red-500/10 border border-red-500/30 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{loginError}</span>
            </div>
          )}

          {loginSuccess && (
            <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-3 flex items-center gap-2.5 text-xs text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{loginSuccess}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                SuperAdmin Account
              </label>
              <div className="flex items-center bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs text-slate-300 gap-2">
                <Mail className="w-4 h-4 text-amber-400" />
                <span className="font-mono text-slate-300">{FIXED_EMAIL}</span>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password..."
                  required
                  autoFocus
                  className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl px-3 py-2.5 pl-9 text-xs text-white placeholder:text-slate-600 focus:outline-none transition"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              </div>
            </div>

            <button
              type="submit"
              disabled={loginLoading}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 transition cursor-pointer"
            >
              {loginLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Sign In to SuperAdmin</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Footer links */}
          <div className="mt-6 pt-4 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => setShowForgotModal(true)}
              className="hover:text-amber-400 transition"
            >
              Forgot Password?
            </button>
            <span className="font-mono">Ahun Bingo v2.5</span>
          </div>
        </div>

        {/* Forgot Password Modal */}
        <AdminLoginModal
          isOpen={showForgotModal}
          onClose={() => setShowForgotModal(false)}
          onAdminAuthSuccess={(token, admin) => {
            sessionStorage.setItem('ahun_admin_token', token);
            localStorage.setItem('ahun_admin_token', token);
            setAdminProfile(admin);
            setIsAdminAuthenticated(true);
            setShowForgotModal(false);
          }}
          language="en"
        />
      </div>
    );
  }

  // Authenticated: Render Full Administrative Suite
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <AdminDashboard
        metrics={metrics}
        pendingWithdrawals={pendingWithdrawals}
        onProcessWithdrawal={handleProcessWithdrawal}
        onSearchUsers={handleSearchUsers}
        onAdjustBalance={handleAdjustBalance}
        auditLogs={auditLogs}
        onLogout={handleLogout}
        socket={socket}
      />
    </div>
  );
}
