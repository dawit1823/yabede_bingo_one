import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import {
  X,
  Wallet,
  Gift,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  User,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  isLoggedIn?: boolean;
  onAuthSuccess: (user: UserProfile, token: string) => void;
  onLogout?: () => void;
  onOpenPhoneVerification?: () => void;
  language?: 'en' | 'am';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isLoggedIn = false,
  onAuthSuccess,
  onLogout,
  onOpenPhoneVerification,
  language = 'am',
}) => {
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && !isLoggedIn) {
      // Auto-attempt Telegram authentication when modal opens if Telegram WebApp initData is present
      attemptTelegramAuth();
    }
  }, [isOpen, isLoggedIn]);

  const attemptTelegramAuth = async () => {
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!initData) {
      setAuthError(
        language === 'am'
          ? 'እባክዎ በቴሌግራም ቦት (@yabede_bingo_bot) በኩል ይክፈቱ'
          : 'Please open via the Telegram Bot (@yabede_bingo_bot) to authenticate.'
      );
      return;
    }

    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch(apiUrl('/api/auth/telegram'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        triggerHaptic('heavy');
        setAuthSuccess(true);
        localStorage.setItem('ahun_jwt_token', data.token);
        setTimeout(() => {
          onAuthSuccess(data.user, data.token);
          onClose();
        }, 600);
      } else {
        triggerHaptic('light');
        setAuthError(data.message || 'Telegram authentication failed.');
      }
    } catch (err: any) {
      triggerHaptic('light');
      setAuthError(err.message || 'Network error verifying Telegram session.');
    } finally {
      setAuthLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-white text-sm">
                {isLoggedIn
                  ? language === 'am'
                    ? 'የተጫዋች መረጃ'
                    : 'Player Profile'
                  : language === 'am'
                  ? 'የቴሌግራም ማረጋገጫ'
                  : 'Telegram Verification'}
              </h3>
              <p className="text-[10px] text-slate-400">Yabede Bingo Live</p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {isLoggedIn ? (
            /* Logged in on Telegram: Display ONLY Username and Balance */
            <div className="space-y-4">
              {/* User Identity */}
              <div className="flex items-center gap-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
                <div className="relative">
                  <img
                    src={currentUser.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser.id}`}
                    alt={currentUser.firstName}
                    className="w-12 h-12 rounded-full border-2 border-amber-400/80 object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-white truncate">
                    {currentUser.firstName} {currentUser.lastName || ''}
                  </div>
                  <div className="text-xs font-bold text-amber-400 truncate">
                    {currentUser.username
                      ? `@${currentUser.username}`
                      : currentUser.phone
                      ? currentUser.phone
                      : `ID: ${currentUser.telegramId || currentUser.id}`}
                  </div>
                </div>
              </div>

              {/* Balances */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                    <Wallet className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{language === 'am' ? 'የኪስ ሂሳብ' : 'Balance'}</span>
                  </div>
                  <div className="text-lg font-black text-emerald-400 truncate">
                    {(currentUser.walletBalance ?? 0).toLocaleString()} <span className="text-xs font-bold">Birr</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-800/60 border border-slate-700/60 space-y-1">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-slate-400">
                    <Gift className="w-3.5 h-3.5 text-amber-400" />
                    <span>{language === 'am' ? 'ቦነስ' : 'Bonus'}</span>
                  </div>
                  <div className="text-lg font-black text-amber-400 truncate">
                    {(currentUser.bonusBalance ?? 0).toLocaleString()} <span className="text-xs font-bold">Birr</span>
                  </div>
                </div>
              </div>

              {/* Phone Status & Verification Button */}
              {currentUser.phone ? (
                <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {language === 'am' ? 'የተረጋገጠ ስልክ ቁጥር' : 'Verified Phone Number'}
                      </div>
                      <div className="text-xs font-mono font-black text-emerald-300 truncate">
                        {currentUser.phone}
                      </div>
                    </div>
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/40 shrink-0">
                    {language === 'am' ? 'ተረጋግጧል' : 'Verified'}
                  </span>
                </div>
              ) : (
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                  <div className="flex items-start gap-2.5">
                    <Smartphone className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-black text-amber-300">
                        {language === 'am' ? 'ስልክ ቁጥር አልተረጋገጠም (Unverified)' : 'Phone Number Not Verified'}
                      </div>
                      <div className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                        {language === 'am'
                          ? 'ገንዘብ ወጪ ለማድረግ (Withdrawal) እና የኪስ ቦርሳዎን ደህንነት ለማረጋገጥ ስልክዎን ያረጋግጡ።'
                          : 'Link your Telegram phone number to enable instant withdrawals and bonus claims.'}
                      </div>
                    </div>
                  </div>
                  {onOpenPhoneVerification && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onClose();
                        onOpenPhoneVerification();
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition cursor-pointer"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>{language === 'am' ? '📱 የቴሌግራም ስልክ ቁጥር አረጋግጥ' : '📱 Verify Telegram Phone Number'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Close / Action button */}
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                }}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs transition shadow-lg shadow-amber-500/20"
              >
                {language === 'am' ? 'ዝጋ (ቀጥል)' : 'Close'}
              </button>
            </div>
          ) : (
            /* Not logged in: Telegram Authentication ONLY (NO Sign In or Register) */
            <div className="space-y-4 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <Send className="w-7 h-7" />
              </div>

              <div>
                <h4 className="text-base font-black text-white">
                  {language === 'am' ? 'በቴሌግራም ይግቡ' : 'Authenticate via Telegram'}
                </h4>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  {language === 'am'
                    ? 'ጨዋታውን ለመጫወት እና ገንዘብ ለማሸነፍ በቴሌግራም አካውንትዎ ብቻ ይረጋገጣል።'
                    : 'Yabede Bingo authenticates exclusively through Telegram.'}
                </p>
              </div>

              {authError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs text-left">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="leading-tight">{authError}</span>
                </div>
              )}

              {authSuccess && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 text-xs text-left">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{language === 'am' ? 'በተሳካ ሁኔታ ተረጋግጧል!' : 'Authenticated successfully!'}</span>
                </div>
              )}

              <div className="space-y-2 pt-1">
                <button
                  onClick={attemptTelegramAuth}
                  disabled={authLoading}
                  className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:brightness-110 text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/20 disabled:opacity-50"
                >
                  {authLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>
                    {authLoading
                      ? language === 'am'
                        ? 'በማረጋገጥ ላይ...'
                        : 'Authenticating...'
                      : language === 'am'
                      ? 'በቴሌግራም አረጋግጥ'
                      : 'Verify with Telegram'}
                  </span>
                </button>

                <a
                  href="https://t.me/yabede_bingo_bot"
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition border border-slate-700"
                >
                  {language === 'am' ? '🎮 ቴሌግራም ቦት ክፈት (@yabede_bingo_bot)' : '🎮 Open Telegram Bot'}
                </a>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
