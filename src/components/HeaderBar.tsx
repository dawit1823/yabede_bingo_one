import React from 'react';
import { UserProfile } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { audioEngine } from '../lib/audioEngine';
import { Wallet, Volume2, VolumeX, PlusCircle, Award, Sunset, Moon, Sun, ChevronDown, Sparkles, Check } from 'lucide-react';

export type ThemeMode = 'dark' | 'golden' | 'light';

interface HeaderBarProps {
  user: UserProfile;
  isLoggedIn?: boolean;
  registrationBonusCredit?: number;
  onOpenDeposit: () => void;
  onOpenAuth?: () => void;
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
              {language === 'am' ? 'ያበደ ቢንጎ - ተጫወቱ እና ያሸንፉ' : 'Live Multiplayer Bingo'}
            </p>
          </div>
        </div>

        {/* Right Info Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* Theme Selector Toggle */}
          <div className="relative" ref={themeRef}>
            <button
              onClick={() => {
                setShowThemeDropdown(!showThemeDropdown);
                triggerHaptic('light');
              }}
              className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl border text-xs font-bold transition shadow-sm min-h-[36px] ${currentThemeObj.bgClass}`}
              title="Select Theme Palette"
            >
              {theme === 'golden' ? (
                <div className="flex items-center gap-1">
                  <Sunset className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 animate-pulse shrink-0" />
                  <span className="hidden md:inline text-amber-300 font-black tracking-wide">Golden Hour</span>
                </div>
              ) : theme === 'light' ? (
                <div className="flex items-center gap-1">
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                  <span className="hidden md:inline text-amber-900 font-bold">Daylight</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-400 shrink-0" />
                  <span className="hidden md:inline text-slate-300 font-bold">Midnight</span>
                </div>
              )}
              <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
            </button>

            {/* Theme Dropdown Menu */}
            {showThemeDropdown && (
              <div className="absolute right-0 mt-2 w-52 sm:w-56 max-w-[calc(100vw-24px)] rounded-2xl bg-slate-900/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-1.5 border-b border-slate-800/80 flex items-center justify-between">
                  <span className="text-[10px] font-black tracking-wider uppercase text-slate-400 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" />
                    {language === 'am' ? 'የገጽታ ቀለም ምረጡ' : 'Theme Palette'}
                  </span>
                </div>
                <div className="p-1.5 space-y-1">
                  {themeOptions.map((opt) => {
                    const isSelected = theme === opt.id;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          if (onSelectTheme) onSelectTheme(opt.id);
                          setShowThemeDropdown(false);
                          triggerHaptic('medium');
                        }}
                        className={`w-full flex items-center justify-between p-2 rounded-xl transition text-left ${
                          isSelected
                            ? 'bg-amber-500/20 border border-amber-500/40 text-amber-300'
                            : 'hover:bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-slate-950/60 border border-slate-800 shrink-0">
                            {opt.icon}
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold leading-tight flex items-center gap-1 truncate">
                              <span className="truncate">{language === 'am' ? opt.labelAm : opt.labelEn}</span>
                              {opt.id === 'golden' && (
                                <span className="text-[8px] bg-amber-500/30 text-amber-300 px-1 rounded font-black border border-amber-500/40">
                                  HOT
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-slate-400 font-normal truncate">
                              {language === 'am' ? opt.descAm : opt.descEn}
                            </div>
                          </div>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-amber-400 shrink-0 ml-1" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Wallet Pills */}
          <div
            onClick={() => {
              onOpenDeposit();
              triggerHaptic('light');
            }}
            className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/50 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 cursor-pointer transition shadow-sm group min-h-[36px]"
          >
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400 group-hover:scale-110 transition-transform shrink-0" />
              <div className="text-right">
                <div className="text-[11px] sm:text-xs font-bold text-slate-100 flex items-center gap-0.5 sm:gap-1">
                  <span>{(user?.walletBalance ?? 0).toLocaleString()}</span>
                  <span className="text-[9px] sm:text-[10px] text-emerald-400 font-extrabold">Birr</span>
                </div>
                {(user?.bonusBalance !== undefined && user?.bonusBalance !== null
                  ? user.bonusBalance
                  : (registrationBonusCredit ?? 50)) > 0 && (
                  <div className="text-[8px] sm:text-[9px] text-amber-400 font-medium leading-none">
                    +{(user?.bonusBalance !== undefined && user?.bonusBalance !== null
                      ? user.bonusBalance
                      : (registrationBonusCredit ?? 50))} Bonus
                  </div>
                )}
              </div>
            </div>
            <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 group-hover:rotate-90 transition-transform shrink-0" />
          </div>

          {/* User Profile Avatar */}
          <div
            onClick={() => {
              if (onOpenAuth) {
                onOpenAuth();
                triggerHaptic('light');
              }
            }}
            className="flex items-center gap-1.5 sm:gap-2 border-l border-slate-800 pl-1.5 sm:pl-3 cursor-pointer hover:opacity-90 transition group"
            title="Account & Authentication"
          >
            <div className="relative">
              <img
                src={isLoggedIn ? (user.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`) : 'https://api.dicebear.com/7.x/bottts/svg?seed=none'}
                alt={isLoggedIn ? user.firstName : 'none'}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-amber-400/80 object-cover group-hover:scale-105 transition-transform shrink-0"
              />
              <span className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 text-[8px] sm:text-[9px] font-black px-0.5 sm:px-1 rounded-full border border-slate-950 flex items-center gap-0.5">
                <Award className="w-2 h-2 sm:w-2.5 sm:h-2.5" /> {isLoggedIn ? `L${user.vipLevel}` : 'none'}
              </span>
            </div>

            <div className="hidden lg:block min-w-0">
              <div className="text-xs font-bold text-slate-200 truncate">{isLoggedIn ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}` : 'Guest'}</div>
              <div className="text-[10px] text-amber-400 font-medium truncate">
                {isLoggedIn ? (user.username ? `@${user.username}` : (user.phone ? user.phone : `ID: ${user.telegramId || user.id}`)) : 'Not Authenticated'}
              </div>
            </div>
          </div>

          {/* Sound Toggle */}
          <button
            onClick={toggleAudio}
            className="p-1.5 sm:p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition shrink-0"
            title="Toggle Sound Effects"
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" /> : <VolumeX className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500" />}
          </button>
        </div>
      </div>
    </header>
  );
};

