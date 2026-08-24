import React from 'react';
import { UserProfile } from '@shared/types';
import { triggerHaptic } from '../lib/telegramSDK';
import { audioEngine } from '../lib/audioEngine';
import { Wallet, Volume2, VolumeX, PlusCircle, Award, Sunset, Moon, Sun, ChevronDown, Sparkles, Check, User, Smartphone } from 'lucide-react';

export type ThemeMode = 'dark' | 'golden' | 'light';

interface HeaderBarProps {
  user: UserProfile;
  isLoggedIn?: boolean;
  registrationBonusCredit?: number;
  onOpenDeposit: () => void;
  onOpenAuth?: () => void;
  onOpenPhoneVerification?: () => void;
  language: 'en' | 'am';
  theme?: ThemeMode;
  onSelectTheme?: (theme: ThemeMode) => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  user,
  isLoggedIn = true,
  registrationBonusCredit,
  onOpenDeposit,
  onOpenAuth,
  onOpenPhoneVerification,
  language,
  theme = 'dark',
  onSelectTheme,
}) => {
  const [soundOn, setSoundOn] = React.useState(audioEngine.isEnabled());
  const [showThemeDropdown, setShowThemeDropdown] = React.useState(false);
  const themeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setShowThemeDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleAudio = () => {
    const newState = audioEngine.toggleSound();
    setSoundOn(newState);
    triggerHaptic('light');
  };

  const themeOptions: { id: ThemeMode; labelEn: string; labelAm: string; icon: React.ReactNode; bgClass: string; descEn: string; descAm: string }[] = [
    {
      id: 'golden',
      labelEn: 'Golden Hour',
      labelAm: 'ወርቃማ ሰዓት (Golden)',
      icon: <Sunset className="w-4 h-4 text-amber-400" />,
      bgClass: 'bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-amber-600/20 border-amber-500/50',
      descEn: 'Warm sunset amber & mahogany palette',
      descAm: 'የሞቀ ፀሐይ ግባት ወርቃማ ገጽታ',
    },
    {
      id: 'dark',
      labelEn: 'Midnight Slate',
      labelAm: 'እኩለ ሌሊት (Midnight)',
      icon: <Moon className="w-4 h-4 text-indigo-400" />,
      bgClass: 'bg-slate-800/90 border-slate-700',
      descEn: 'Classic deep dark slate theme',
      descAm: 'መደበኛ ጥቁር ገጽታ',
    },
    {
      id: 'light',
      labelEn: 'Daylight',
      labelAm: 'ቀን (Light)',
      icon: <Sun className="w-4 h-4 text-amber-500" />,
      bgClass: 'bg-amber-100/90 border-amber-300',
      descEn: 'Bright clean light canvas',
      descAm: 'ብሩህ የብርሃን ገጽታ',
    },
  ];

  const currentThemeObj = themeOptions.find((t) => t.id === theme) || themeOptions[0];

  return (
    <header className="bg-slate-900 border-b border-slate-800 px-3 sm:px-4 py-2.5 sm:py-3 sticky top-0 z-40 shadow-md pt-safe">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-2 sm:gap-3">
        {/* Logo & Brand */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-slate-950 rounded-[9px] sm:rounded-[10px] flex items-center justify-center">
              <span className="text-base sm:text-xl font-black text-amber-400 tracking-wider">ያ</span>
            </div>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white font-display truncate">
                YABEDE <span className="text-amber-400">BINGO</span>
              </h1>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 leading-none mt-0.5 truncate hidden xs:block">
              {language === 'am' ? 'የኢትዮጵያ የቀጥታ ቢንጎ' : 'Ethiopia\'s Premier Live Game'}
            </p>
          </div>
        </div>

        {/* Right Action Cluster: Theme, Audio, Balance/Deposit, User Account */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* Theme Selector Dropdown */}
          <div className="relative" ref={themeRef}>
            <button
              id="header-theme-toggle"
              type="button"
              onClick={() => setShowThemeDropdown(!showThemeDropdown)}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 sm:px-2.5 py-1.5 rounded-xl border border-slate-700/60 transition shadow-xs text-xs"
              title="Change visual theme"
            >
              {currentThemeObj.icon}
              <span className="text-[11px] font-medium hidden sm:inline">{currentThemeObj.labelEn}</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {showThemeDropdown && (
              <div className="absolute right-0 mt-2 w-56 bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl z-50 p-2 space-y-1">
                <div className="px-2 py-1.5 border-b border-slate-800">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>{language === 'am' ? 'የገጽታ ቀለም' : 'Visual Theme'}</span>
                  </div>
                </div>
                {themeOptions.map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onSelectTheme?.(opt.id);
                      setShowThemeDropdown(false);
                      triggerHaptic('light');
                    }}
                    className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between text-xs transition ${
                      theme === opt.id
                        ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                        : 'hover:bg-slate-800 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {opt.icon}
                      <div>
                        <div className="font-semibold text-slate-200">
                          {language === 'am' ? opt.labelAm : opt.labelEn}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {language === 'am' ? opt.descAm : opt.descEn}
                        </div>
                      </div>
                    </div>
                    {theme === opt.id && <Check className="w-4 h-4 text-amber-400" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sound Mute/Unmute */}
          <button
            id="header-audio-toggle"
            type="button"
            onClick={toggleAudio}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition"
            title={soundOn ? 'Sound On' : 'Sound Muted'}
          >
            {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          {/* Phone Verification Warning / Action Button */}
          {isLoggedIn && !user?.phone && onOpenPhoneVerification && (
            <button
              id="header-phone-verify-btn"
              type="button"
              onClick={() => {
                onOpenPhoneVerification();
                triggerHaptic('medium');
              }}
              className="flex items-center gap-1 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 rounded-xl px-2 py-1.5 text-[11px] font-bold text-amber-300 shadow-sm transition animate-pulse cursor-pointer"
              title={language === 'am' ? 'የቴሌግራም ስልክ ቁጥርዎን ያረጋግጡ' : 'Verify Telegram Phone Number'}
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate hidden xs:inline">{language === 'am' ? 'ስልክ አረጋግጥ' : 'Verify Phone'}</span>
            </button>
          )}

          {/* Wallet Balance & Deposit CTA */}
          <div className="flex items-center bg-slate-950/80 border border-slate-800 rounded-xl p-1 pl-2 sm:pl-2.5 gap-1.5 sm:gap-2">
            <div className="flex flex-col">
              <span className="text-[9px] sm:text-[10px] font-semibold text-slate-400 leading-none">
                {language === 'am' ? 'ሒሳብ' : 'Balance'}
              </span>
              <div className="flex items-baseline gap-0.5">
                <span className="text-xs sm:text-sm font-black text-amber-400 font-mono">
                  {user.walletBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[9px] font-bold text-amber-400/80">ETB</span>
              </div>
            </div>

            <button
              id="header-deposit-btn"
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                onOpenDeposit();
              }}
              className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 px-2 sm:px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm transition"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{language === 'am' ? 'ገቢ' : 'Deposit'}</span>
            </button>
          </div>

          {/* User Profile / Auth Button */}
          {onOpenAuth && (
            <button
              id="header-user-btn"
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onOpenAuth();
              }}
              className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition flex items-center gap-1.5"
              title={isLoggedIn ? user.firstName || user.username : 'Log In'}
            >
              {user.photoUrl ? (
                <img
                  src={user.photoUrl}
                  alt={user.username}
                  className="w-5 h-5 rounded-full object-cover border border-amber-400/40"
                />
              ) : (
                <User className="w-4 h-4 text-amber-400" />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
