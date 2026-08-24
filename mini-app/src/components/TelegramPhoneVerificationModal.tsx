import React, { useState } from 'react';
import { UserProfile } from '@shared/types';
import { triggerHaptic, triggerNotificationHaptic, getTelegramWebApp } from '../lib/telegramSDK';
import { apiUrl } from '@shared/apiConfig';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  Bot,
  ExternalLink,
  Lock,
  ArrowRight,
} from 'lucide-react';

interface TelegramPhoneVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  onVerificationSuccess: (updatedUser: UserProfile) => void;
  onOpenBotSimulator?: () => void;
  language?: 'en' | 'am';
}

export const TelegramPhoneVerificationModal: React.FC<TelegramPhoneVerificationModalProps> = ({
  isOpen,
  onClose,
  user,
  onVerificationSuccess,
  onOpenBotSimulator,
  language = 'am',
}) => {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<'telegram' | 'manual'>('telegram');

  if (!isOpen) return null;

  const isTgMiniApp = typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp?.initData);

  // 1. Native Telegram Contact Request (for Mini Apps)
  const handleRequestTelegramContact = () => {
    const tg = getTelegramWebApp();
    triggerHaptic('medium');

    if (tg && typeof (tg as any).requestContact === 'function') {
      try {
        (tg as any).requestContact((shared: boolean) => {
          if (shared) {
            triggerNotificationHaptic('success');
            setSuccessMsg(
              language === 'am'
                ? 'የስልክ ቁጥርዎ በቴሌግራም በኩል ተረጋግጧል!'
                : 'Phone contact shared via Telegram!'
            );
            const initData = tg.initData;
            fetch(apiUrl('/api/auth/telegram'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ initData }),
            })
              .then((res) => res.json())
              .then((data) => {
                if (data.success && data.user) {
                  onVerificationSuccess(data.user);
                  setTimeout(() => onClose(), 1200);
                }
              })
              .catch(console.error);
          } else {
            setErrorMsg(
              language === 'am'
                ? 'የስልክ ቁጥር ማጋራት አልተፈቀደም። እባክዎ በቦቱ በኩል ይሞክሩ።'
                : 'Contact sharing was declined. Please try via the bot.'
            );
          }
        });
        return;
      } catch (err) {
        console.warn('requestContact failed, falling back to bot link:', err);
      }
    }

    const botUrl = `https://t.me/yabede_bingo_bot?start=verify_phone`;
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(botUrl);
    } else {
      window.open(botUrl, '_blank');
    }
  };

  // 2. Direct Phone Submission (with format normalization on server)
  const handleManualPhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneNumber.trim()) {
      setErrorMsg(language === 'am' ? 'እባክዎ ትክክለኛ ስልክ ቁጥር ያስገቡ' : 'Please enter a valid phone number');
      triggerNotificationHaptic('error');
      return;
    }

    setLoading(true);
    setErrorMsg(null);

    try {
      const initData = window.Telegram?.WebApp?.initData || '';
      const res = await fetch(apiUrl('/api/auth/link-phone'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          phone: phoneNumber.trim(),
          initData,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.user) {
        triggerNotificationHaptic('success');
        setSuccessMsg(
          language === 'am'
            ? 'ስልክ ቁጥርዎ በተሳካ ሁኔታ ተረጋግጧል!'
            : 'Phone number verified and linked successfully!'
        );
        onVerificationSuccess(data.user);
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        triggerNotificationHaptic('error');
        setErrorMsg(data.error || data.message || 'Failed to verify phone number.');
      }
    } catch (err: any) {
      triggerNotificationHaptic('error');
      setErrorMsg(err.message || 'Network error verifying phone number.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-white text-sm">
                {language === 'am' ? 'የቴሌግራም ስልክ ማረጋገጫ' : 'Telegram Phone Verification'}
              </h3>
              <p className="text-[10px] text-slate-400">
                {language === 'am' ? 'የኢትዮጵያ ስልክ ቁጥር (+251)' : 'Ethiopian Phone Number (+251)'}
              </p>
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

        <div className="p-5 space-y-4">
          {user.phone ? (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <h4 className="text-xs font-bold text-white">
                  {language === 'am' ? 'ስልክዎ ተረጋግጧል' : 'Phone Number Verified'}
                </h4>
                <p className="text-xs font-mono font-bold text-emerald-300 mt-0.5">{user.phone}</p>
              </div>
            </div>
          ) : (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex items-start gap-2.5">
              <ShieldCheck className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-bold text-amber-300 block mb-0.5">
                  {language === 'am' ? 'ስልክ ቁጥር ማረጋገጥ ለምን አስፈለገ?' : 'Why verify your phone number?'}
                </span>
                {language === 'am'
                  ? 'ገንዘብ ወጪ ለማድረግ (Withdrawal) እና የኪስ ቦርሳዎን ደህንነት ለመጠበቅ ስልክዎን በቴሌግራም ያረጋግጡ።'
                  : 'Phone verification is required for instant withdrawals, security, and bonus attribution.'}
              </div>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2 text-emerald-300 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold">
            <button
              onClick={() => {
                setActiveMode('telegram');
                triggerHaptic('light');
              }}
              className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeMode === 'telegram'
                  ? 'bg-amber-500 text-slate-950 font-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Bot className="w-3.5 h-3.5" />
              <span>{language === 'am' ? 'በቴሌግራም አረጋግጥ' : 'Via Telegram'}</span>
            </button>
            <button
              onClick={() => {
                setActiveMode('manual');
                triggerHaptic('light');
              }}
              className={`flex-1 py-2 rounded-lg transition flex items-center justify-center gap-1.5 ${
                activeMode === 'manual'
                  ? 'bg-amber-500 text-slate-950 font-black shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{language === 'am' ? 'በስልክ ቁጥር' : 'Direct Number'}</span>
            </button>
          </div>

          {activeMode === 'telegram' ? (
            <div className="space-y-3 pt-1">
              <button
                onClick={handleRequestTelegramContact}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-600 hover:brightness-110 active:scale-[0.98] text-white font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/25 cursor-pointer"
              >
                <Bot className="w-4 h-4" />
                <span>
                  {language === 'am'
                    ? '📱 የቴሌግራም ስልክ ቁጥር አጋራ (Share Contact)'
                    : '📱 1-Tap Share Telegram Contact'}
                </span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>

              <a
                href="https://t.me/yabede_bingo_bot?start=verify_phone"
                target="_blank"
                rel="noreferrer"
                onClick={() => triggerHaptic('light')}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-2 transition border border-slate-700 cursor-pointer"
              >
                <span>{language === 'am' ? '🤖 በቴሌግራም ቦት ክፈት (@yabede_bingo_bot)' : '🤖 Open in Bot (@yabede_bingo_bot)'}</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>

              {!isTgMiniApp && onOpenBotSimulator && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onClose();
                    onOpenBotSimulator();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-slate-800/80 text-amber-400 font-bold text-[11px] flex items-center justify-center gap-1.5 transition border border-amber-500/30"
                >
                  <span>🛠️ {language === 'am' ? 'በቦት ሲሙሌተር ሞክር' : 'Test with Bot Simulator'}</span>
                </button>
              )}
            </div>
          ) : (
            <form onSubmit={handleManualPhoneSubmit} className="space-y-3 pt-1">
              <div>
                <label className="text-[11px] font-bold text-slate-300 block mb-1.5">
                  {language === 'am' ? 'የስልክ ቁጥርዎን ያስገቡ (ለምሳሌ 0911223344)' : 'Enter Ethiopian Phone Number (e.g. 0911223344):'}
                </label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-mono font-bold text-amber-400">
                    +251
                  </span>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="912345678 or 0912345678"
                    className="w-full bg-slate-950 border border-slate-800 focus:border-amber-500 rounded-xl pl-16 pr-3.5 py-2.5 text-xs text-white font-mono placeholder:text-slate-600 focus:outline-none transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>
                  {loading
                    ? language === 'am'
                      ? 'በማረጋገጥ ላይ...'
                      : 'Verifying...'
                    : language === 'am'
                    ? 'ስልክ ቁጥር አረጋግጥ እና መዝግብ'
                    : 'Verify & Link Phone Number'}
                </span>
              </button>
            </form>
          )}

          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            className="w-full py-2.5 text-center text-xs font-bold text-slate-400 hover:text-white transition"
          >
            {language === 'am' ? 'ዝጋ' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
