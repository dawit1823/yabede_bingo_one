import React, { useState } from 'react';
import { UserProfile } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import {
  X,
  Phone,
  Lock,
  User,
  ShieldCheck,
  Smartphone,
  LogOut,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  Gift,
  ArrowRight,
  RefreshCw,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  isLoggedIn?: boolean;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout: () => void;
}

type AuthTab = 'login' | 'register' | 'forgot' | 'account';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isLoggedIn = false,
  onAuthSuccess,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<AuthTab>(
    currentUser.phone ? 'account' : 'login'
  );

  // Form States
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [referralCode, setReferralCode] = useState('');

  // Forgot Password States
  const [resetStep, setResetStep] = useState<'request' | 'reset'>('request');
  const [otpCode, setOtpCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Feedback & Loading
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const resetFormState = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Login failed');
      }

      triggerHaptic('heavy');
      localStorage.setItem('ahun_jwt_token', data.token);
      setSuccessMsg('Login successful! Welcome back.');
      setTimeout(() => {
        onAuthSuccess(data.user, data.token);
        onClose();
      }, 800);
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/register'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName,
          lastName,
          username,
          phone,
          password,
          confirmPassword,
          referralCode,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Registration failed');
      }

      triggerHaptic('heavy');
      localStorage.setItem('ahun_jwt_token', data.token);
      setSuccessMsg('🎉 Account created successfully! 100 Birr welcome bonus credited!');
      setTimeout(() => {
        onAuthSuccess(data.user, data.token);
        onClose();
      }, 1000);
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password/request'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request password reset');

      triggerHaptic('medium');
      setSuccessMsg(data.message || 'OTP code generated');
      if (data.otp) {
        setOtpCode(data.otp);
      }
      setResetStep('reset');
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Failed to request reset');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetFormState();
    setLoading(true);

    try {
      const res = await fetch(apiUrl('/api/auth/forgot-password/reset'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp: otpCode, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      triggerHaptic('heavy');
      setSuccessMsg('Password reset successful! Please log in with your new password.');
      setTimeout(() => {
        setActiveTab('login');
        setResetStep('request');
      }, 1200);
    } catch (err: any) {
      triggerHaptic('light');
      setErrorMsg(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full shadow-2xl overflow-hidden relative my-auto">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-white text-base">Account & Security</h3>
              <p className="text-xs text-slate-400">Real-Time Ethiopian Bingo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/50 p-1">
          <button
            onClick={() => {
              setActiveTab('login');
              resetFormState();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'login'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            onClick={() => {
              setActiveTab('register');
              resetFormState();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'register'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Register
          </button>
          <button
            onClick={() => {
              setActiveTab('account');
              resetFormState();
            }}
            className={`flex-1 py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'account'
                ? 'bg-amber-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Profile
          </button>
        </div>

        {/* Banners */}
        {errorMsg && (
          <div className="mx-5 mt-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-300 text-xs font-medium">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mx-5 mt-4 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-emerald-300 text-xs font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* TAB 1: LOGIN */}
        {activeTab === 'login' && (
          <form onSubmit={handleLogin} className="p-5 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="0918230227 or +251918230227"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-slate-300">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('forgot');
                    resetFormState();
                  }}
                  className="text-xs text-amber-400 hover:underline font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <span>Sign In to Play</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* TAB 2: REGISTER */}
        {activeTab === 'register' && (
          <form onSubmit={handleRegister} className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  First Name *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    placeholder="Dawit"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  placeholder="Solomon"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Username (Optional)
              </label>
              <input
                type="text"
                placeholder="dawit_king"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1">
                Phone Number (Unique) *
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  required
                  placeholder="0918230227"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-2.5 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 chars"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repeat"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1 flex items-center gap-1">
                <Gift className="w-3.5 h-3.5 text-amber-400" />
                Referral Code (Optional)
              </label>
              <input
                type="text"
                placeholder="YABEDEVIP"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black rounded-xl shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <span>Register & Claim 100 Birr Bonus</span>
              )}
            </button>
          </form>
        )}

        {/* TAB 3: FORGOT PASSWORD */}
        {activeTab === 'forgot' && (
          <div className="p-5 space-y-4">
            {resetStep === 'request' ? (
              <form onSubmit={handleRequestReset} className="space-y-4">
                <p className="text-xs text-slate-400">
                  Enter your registered Ethiopian phone number to receive a 6-digit OTP verification code.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="0918230227"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-amber-500 text-slate-950 font-bold rounded-xl shadow transition"
                >
                  {loading ? 'Sending SMS OTP...' : 'Send OTP Verification Code'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    SMS OTP Code
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      placeholder="123456"
                      value={otpCode}
                      onChange={(e) => setOtpCode(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    required
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-emerald-500 text-slate-950 font-black rounded-xl shadow transition"
                >
                  {loading ? 'Updating Password...' : 'Confirm & Reset Password'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* TAB 4: ACCOUNT PROFILE */}
        {activeTab === 'account' && (
          <div className="p-5 space-y-4">
            {!isLoggedIn ? (
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 text-center space-y-4">
                <div className="w-12 h-12 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-500 mx-auto text-xl font-bold">
                  👤
                </div>
                <div>
                  <div className="font-extrabold text-white text-base">Profile: <span className="text-amber-400">none</span></div>
                  <p className="text-xs text-slate-400 mt-1">No active user account is logged in to the mini app.</p>
                </div>
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setActiveTab('login')}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs"
                  >
                    Log In
                  </button>
                  <button
                    onClick={() => setActiveTab('register')}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-200 border border-slate-700 font-black text-xs"
                  >
                    Register
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 bg-slate-950 p-3 rounded-xl border border-slate-800">
                  <img
                    src={currentUser.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`}
                    alt={currentUser.firstName}
                    className="w-12 h-12 rounded-full border-2 border-amber-400/80 object-cover"
                  />
                  <div>
                    <div className="font-bold text-white text-sm flex items-center gap-2">
                      <span>{currentUser.firstName} {currentUser.lastName || ''}</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded border border-amber-500/30">
                        {currentUser.role || 'USER'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400">
                      {currentUser.username ? `@${currentUser.username}` : `Telegram ID: ${currentUser.telegramId || currentUser.id}`}
                    </div>
                    <div className="text-[11px] text-emerald-400 font-mono mt-0.5">
                      Phone: {currentUser.phone || 'Telegram Session'}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      Wallet Balance
                    </div>
                    <div className="text-lg font-black text-emerald-400 mt-1">
                      {(currentUser?.walletBalance ?? 0).toLocaleString()} Birr
                    </div>
                  </div>
                  <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                      Bonus Balance
                    </div>
                    <div className="text-lg font-black text-amber-400 mt-1">
                      {(currentUser?.bonusBalance ?? 0).toLocaleString()} Birr
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      triggerHaptic('medium');
                      localStorage.removeItem('ahun_jwt_token');
                      onLogout();
                      onClose();
                    }}
                    className="w-full py-2.5 bg-rose-500/10 border border-rose-500/30 text-rose-300 font-bold rounded-xl hover:bg-rose-500/20 transition flex items-center justify-center gap-2 text-xs"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Log Out from All Devices</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
