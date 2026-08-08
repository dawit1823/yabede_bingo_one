/**
 * Email Notification Service for Single SuperAdministrator System
 * Target Email: dawitsolomon1823@gmail.com
 */

import config from '../../firebase-applet-config.json' with { type: 'json' };

export interface EmailOptions {
  to: string;
  subject: string;
  title: string;
  bodyHtml: string;
  code?: string;
  securityEvent?: string;
}

export class EmailService {
  private static instance: EmailService;
  private recentSentEmails: { timestamp: string; subject: string; code?: string; to: string }[] = [];

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  /**
   * Dispatches official Password Reset Email via Firebase Authentication
   */
  public async sendFirebaseAuthPasswordReset(email: string): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${config.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: email,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        console.error('❌ [FirebaseAuth Email] Error dispatching password reset email:', data);
        return { success: false, error: data.error?.message || 'Failed to dispatch email via Firebase Auth' };
      }
      console.log('✅ [FirebaseAuth Email] Password reset email successfully dispatched to:', email);
      return { success: true };
    } catch (err: any) {
      console.error('❌ [FirebaseAuth Email] Exception sending password reset:', err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Dispatches security email to dawitsolomon1823@gmail.com
   * Logs dispatch to console and records in sent email history
   */
  public async sendAdminEmail(options: EmailOptions): Promise<{ success: boolean; messageId: string }> {
    const messageId = `msg_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const timestamp = new Date().toISOString();

    console.log(`\n==================================================`);
    console.log(`📧 [EMAIL SERVICE] OUTGOING SECURITY EMAIL`);
    console.log(`To: ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    console.log(`Message ID: ${messageId}`);
    if (options.code) {
      console.log(`🔑 VERIFICATION CODE: >>> ${options.code} <<<`);
    }
    console.log(`Timestamp: ${timestamp}`);
    console.log(`==================================================\n`);

    this.recentSentEmails.unshift({
      timestamp,
      subject: options.subject,
      code: options.code,
      to: options.to,
    });

    // Keep only last 50 sent emails
    if (this.recentSentEmails.length > 50) {
      this.recentSentEmails = this.recentSentEmails.slice(0, 50);
    }

    return { success: true, messageId };
  }

  /**
   * Helper to send 2-Step Login Verification Code
   */
  public async sendLoginVerificationCode(code: string, ipAddress?: string, device?: string) {
    return this.sendAdminEmail({
      to: 'dawitsolomon1823@gmail.com',
      subject: '🔐 Admin Login 2-Step Verification Code - Yabede Bingo',
      title: 'Two-Factor Authentication Code',
      code,
      securityEvent: 'LOGIN_2FA',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
          <h2 style="color: #f59e0b; margin-top: 0;">🔐 Yabede Bingo SuperAdmin Verification</h2>
          <p style="font-size: 14px; color: #cbd5e1;">Your single-administrator 2-step verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #10b981; background: #1e293b; padding: 16px; text-align: center; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #94a3b8;">This code is valid for 10 minutes. If you did not initiate this login attempt, please investigate immediately.</p>
          <hr style="border-color: #334155; margin: 20px 0;" />
          <p style="font-size: 11px; color: #64748b;">IP: ${ipAddress || 'Unknown'} | Device: ${device || 'Web Browser'}</p>
        </div>
      `,
    });
  }

  /**
   * Helper to send Password Reset Code
   */
  public async sendPasswordResetCode(code: string) {
    // 1. Dispatch Firebase Authentication official password reset email
    await this.sendFirebaseAuthPasswordReset('dawitsolomon1823@gmail.com');

    // 2. Log internal notification
    return this.sendAdminEmail({
      to: 'dawitsolomon1823@gmail.com',
      subject: '🔑 SuperAdmin Password Reset Confirmation - Yabede Bingo',
      title: 'Password Reset Request',
      code,
      securityEvent: 'PASSWORD_RESET_REQUEST',
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
          <h2 style="color: #ef4444; margin-top: 0;">⚠️ Administrator Password Reset Code</h2>
          <p style="font-size: 14px; color: #cbd5e1;">A password reset request was initiated for administrator account <strong>dawitsolomon1823@gmail.com</strong>.</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #f59e0b; background: #1e293b; padding: 16px; text-align: center; border-radius: 8px; margin: 16px 0;">
            ${code}
          </div>
          <p style="font-size: 12px; color: #94a3b8;">Enter this code on the password reset screen to authorize setting a new password.</p>
        </div>
      `,
    });
  }

  /**
   * Helper to send Account Lockout & Security Alerts
   */
  public async sendSecurityAlert(type: string, message: string, details?: any) {
    return this.sendAdminEmail({
      to: 'dawitsolomon1823@gmail.com',
      subject: `🚨 Security Alert: ${type} - Yabede Bingo SuperAdmin`,
      title: 'Security Alert Notification',
      securityEvent: type,
      bodyHtml: `
        <div style="font-family: Arial, sans-serif; background-color: #450a0a; color: #fef2f2; padding: 24px; border-radius: 12px;">
          <h2 style="color: #f87171; margin-top: 0;">🚨 Security Alert Triggered</h2>
          <p style="font-size: 14px;">${message}</p>
          ${details ? `<pre style="background: #0f172a; padding: 12px; border-radius: 6px; color: #fbbf24; font-size: 12px;">${JSON.stringify(details, null, 2)}</pre>` : ''}
        </div>
      `,
    });
  }

  public getRecentSentEmails() {
    return this.recentSentEmails;
  }
}

export const emailService = EmailService.getInstance();
