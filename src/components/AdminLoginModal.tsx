import React, { useState } from 'react';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import { logger } from '../lib/logger';
import {
  ShieldCheck,
  Lock,
  Mail,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  ArrowRight,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdminAuthSuccess: (token: string, adminProfile: any) => void;
  language: 'en' | 'am';
}

type AdminAuthView = 'password_step' | 'forgot_request' | 'forgot_reset';

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onAdminAuthSuccess,
  language,
}) => {
  const FIXED_EMAIL = 'dawitsolomon1823@gmail.com';
  const FIXED_PHONE = '0918230227';

  const [view, setView] = useState<AdminAuthView>('password_step');

  // Form inputs
  const [password, setPassword] = useState('');

  // Password Reset state
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  // Feedback states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetFormState = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(false);
  };

  // Handle Password Submit (Direct Login)
  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();

    if (!password) {
      setErrorMsg(language === 'am' ? 'እባክዎን የይለፍ ቃል ያስገቡ' : 'Please enter administrator password.');
      return;
    }

    setLoading(true);

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

      triggerHaptic('heavy');
      setSuccessMsg(
        language === 'am'
          ? '🎉 እንኳን ደህና መጡ! ወደ ዳሽቦርድ በመግባት ላይ...'
          : '🎉 SuperAdmin Authenticated! Launching Dashboard...'
      );

      sessionStorage.setItem('ahun_admin_token', data.token);

      setTimeout(() => {
        onAdminAuthSuccess(data.token, data.admin);
        onClose();
      }, 1000);
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle Password Reset Request
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      // Dispatch Backend API password reset request
      const res = await fetch(apiUrl('/api/admin/auth/forgot-password/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');

      triggerHaptic('heavy');
      setSuccessMsg(
        language === 'am'
          ? `የይለፍ ቃል መቀየሪያ ኢሜይል እና ኮድ ወደ ${FIXED_EMAIL} ተልኳል!`
          : `Password reset email & verification code sent to ${FIXED_EMAIL}!`
      );
      setView('forgot_reset');
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Reset request failed');
    } finally {
      setLoading(false);
    }
  };

  // Handle Password Reset Confirm
  const handleForgotConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();

    if (newPassword !== confirmNewPassword) {
      setErrorMsg(language === 'am' ? 'የይለፍ ቃሎቹ አይመሳሰሉም' : 'Passwords do not match');
      return;
    }

    if (newPassword.length < 8) {
      setErrorMsg(language === 'am' ? 'የይለፍ ቃል ቢያንስ 8 አሃዝ መሆን አለበት' : 'Password must be at least 8 characters.');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/admin/auth/forgot-password/confirm'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetCode, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password reset failed');

      triggerHaptic('heavy');
      setSuccessMsg(language === 'am' ? 'የይለፍ ቃል በተሳካ ሁኔታ ተቀይሯል። እባክዎን አዲሱን የይለፍ ቃል በመጠቀም ይግቡ።' : 'Password reset successfully! Please log in with your new password.');
      setPassword('');
      setView('password_step');
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Reset confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/50 rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative overflow-hidden space-y-4 sm:space-y-5 max-h-[90vh] overflow-y-auto my-auto">
        <div className="absolute top-0 right-0 w-36 h-36 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Icon & Title */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-lg font-black text-amber-300 tracking-wide uppercase">
              {language === 'am' ? 'የሱፐር አድሚን መግቢያ' : 'SuperAdministrator Verification'}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === 'am'
                ? 'ለአንድ አድሚኒስትሬተር ብቻ የተፈቀደ የተጠበቀ ሲስተም'
                : 'Secure Single-Administrator Access Gateway'}
            </p>
          </div>
        </div>

        {/* Error / Success Alerts */}
        {errorMsg && (
          <div className="p-3 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-start gap-2.5 text-xs text-rose-200">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-start gap-2.5 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* VIEW 1: PASSWORD STEP */}
        {view === 'password_step' && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            {/* Fixed Read-Only Email */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>{language === 'am' ? 'የአድሚን ኢሜይል' : 'Administrator Email'}</span>
                <span className="text-[10px] text-amber-400 font-normal">Fixed (Read-Only)</span>
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-3 w-4 h-4 text-amber-400/70" />
                <input
                  type="email"
                  value={FIXED_EMAIL}
                  readOnly
                  disabled
                  className="w-full bg-slate-950/80 border border-amber-500/30 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-mono font-bold text-amber-200 cursor-not-allowed opacity-90 shadow-inner"
                />
              </div>
            </div>

            {/* Fixed Phone Indicator */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>{language === 'am' ? 'የአድሚን ስልክ ቁጥር' : 'Registered Phone'}</span>
                <span className="text-[10px] text-emerald-400 font-normal">Fixed Identifier</span>
              </label>
              <div className="relative">
                <Smartphone className="absolute left-3.5 top-3 w-4 h-4 text-emerald-400/70" />
                <input
                  type="text"
                  value={FIXED_PHONE}
                  readOnly
                  disabled
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-2xl py-2.5 pl-10 pr-4 text-xs font-mono font-bold text-slate-300 cursor-not-allowed opacity-80"
                />
              </div>
            </div>

            {/* Administrator Password */}
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {language === 'am' ? 'የአድሚን የይለፍ ቃል' : 'SuperAdmin Password'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-3 w-4 h-4 text-amber-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter administrator password..."
                  required
                  className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl py-2.5 pl-10 pr-4 text-xs text-slate-100 placeholder-slate-500 outline-none transition"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg(null);
                  setSuccessMsg(null);
                  setView('forgot_request');
                }}
                className="text-[11px] text-amber-400 hover:underline"
              >
                {language === 'am' ? 'የይለፍ ቃል ረስተዋል?' : 'Forgot Administrator Password?'}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{language === 'am' ? 'በማጣራት ላይ...' : 'Verifying Password...'}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>{language === 'am' ? 'ወደ አድሚን ዳሽቦርድ ግባ' : 'Access SuperAdmin Dashboard'}</span>
                </>
              )}
            </button>
          </form>
        )}

        {/* VIEW 2: FORGOT PASSWORD REQUEST */}
        {view === 'forgot_request' && (
          <form onSubmit={handleForgotRequest} className="space-y-4">
            <div className="p-3.5 rounded-2xl bg-slate-950 border border-slate-800 text-slate-300 text-xs leading-relaxed">
              {language === 'am'
                ? `የይለፍ ቃል መቀየሪያ መመሪያዎች ወደ ተመዘገበው ዋና ኢሜይል ብቻ (${FIXED_EMAIL}) ይላካሉ።`
                : `Password reset authorization will be sent exclusively to the permanently registered administrator email (${FIXED_EMAIL}).`}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Mail className="w-4 h-4" />
                  <span>{language === 'am' ? 'የመቀየሪያ ኮድ ወደ ኢሜይል ላክ' : 'Send Reset Code to dawitsolomon1823@gmail.com'}</span>
                </>
              )}
            </button>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setView('password_step')}
                className="text-[11px] text-slate-400 hover:text-white underline"
              >
                ← {language === 'am' ? 'ወደ መግቢያ ተመለስ' : 'Cancel & Back to Login'}
              </button>
            </div>
          </form>
        )}

        {/* VIEW 4: FORGOT PASSWORD CONFIRM RESET */}
        {view === 'forgot_reset' && (
          <form onSubmit={handleForgotConfirm} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {language === 'am' ? 'የኢሜይል መቀየሪያ ኮድ' : 'Email Confirmation Code'}
              </label>
              <input
                type="text"
                value={resetCode}
                onChange={(e) => setResetCode(e.target.value)}
                placeholder="Enter reset code from email..."
                required
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl py-2.5 px-3.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {language === 'am' ? 'አዲስ የአድሚን የይለፍ ቃል' : 'New SuperAdmin Password'}
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimum 8 characters..."
                required
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl py-2.5 px-3.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                {language === 'am' ? 'አዲሱን የይለፍ ቃል ያረጋግጡ' : 'Confirm New Password'}
              </label>
              <input
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                placeholder="Re-enter new password..."
                required
                className="w-full bg-slate-950 border border-slate-700 focus:border-amber-500 rounded-2xl py-2.5 px-3.5 text-xs text-slate-100 placeholder-slate-500 outline-none transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <span>{language === 'am' ? 'የይለፍ ቃል ቀይር' : 'Reset Administrator Password'}</span>
              )}
            </button>
          </form>
        )}

        {/* Security Footer Notice */}
        <div className="pt-2 border-t border-slate-800 text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-mono">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>Strict Single-Admin Protection Mode Active</span>
          </div>
          <p className="text-[9px] text-slate-500">
            {FIXED_EMAIL} • Role: SuperAdmin
          </p>
        </div>
      </div>
    </div>
  );
};
