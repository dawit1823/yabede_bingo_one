import React from 'react';
import { UserProfile } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { audioEngine } from '../lib/audioEngine';
import { Wallet, Volume2, VolumeX, PlusCircle, Sunset, Moon, Sun, Globe, User, Smartphone, ShieldAlert } from 'lucide-react';

export type ThemeMode = 'dark' | 'golden' | 'light';

interface HeaderBarProps {
  user: UserProfile;
  isLoggedIn?: boolean;
  registrationBonusCredit?: number;
  onOpenDeposit: () => void;
  onOpenAuth?: () => void;
  onOpenPhoneVerification?: () => void;
  language: 'en' | 'am';
  onToggleLanguage?: () => void;
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
  onToggleLanguage,
  theme = 'dark',
  onSelectTheme,
}) => {
  const [soundOn, setSoundOn] = React.useState(audioEngine.isEnabled());

  const toggleAudio = () => {
    const newState = audioEngine.toggleSound();
    setSoundOn(newState);
    triggerHaptic('light');
  };

  const handleToggleTheme = () => {
    const nextTheme: ThemeMode = theme === 'golden' ? 'dark' : theme === 'dark' ? 'light' : 'golden';
    if (onSelectTheme) {
      onSelectTheme(nextTheme);
    }
    triggerHaptic('medium');
  };

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
          {/* Theme Selector Toggle (Direct Click - No Dropdown) */}
          <button
            onClick={handleToggleTheme}
            className={`flex items-center justify-center p-2 rounded-xl border text-xs font-bold transition shadow-sm min-h-[36px] min-w-[36px] ${
              theme === 'golden'
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300 hover:bg-amber-500/30'
                : theme === 'light'
                ? 'bg-amber-100/90 border-amber-300 text-amber-800 hover:bg-amber-200'
                : 'bg-slate-800/90 border-slate-700 text-indigo-300 hover:bg-slate-700'
            }`}
            title={
              theme === 'golden'
                ? 'Theme: Golden Hour (Click to change)'
                : theme === 'light'
                ? 'Theme: Daylight (Click to change)'
                : 'Theme: Midnight (Click to change)'
            }
          >
            {theme === 'golden' ? (
              <Sunset className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
            ) : theme === 'light' ? (
              <Sun className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <Moon className="w-4 h-4 text-indigo-400 shrink-0" />
            )}
          </button>

          {/* Phone Verification Warning / Action Button */}
          {isLoggedIn && !user?.phone && onOpenPhoneVerification && (
            <button
              onClick={() => {
                onOpenPhoneVerification();
                triggerHaptic('medium');
              }}
              className="flex items-center gap-1 sm:gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/50 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-bold text-amber-300 shadow-sm transition animate-pulse min-h-[36px] cursor-pointer"
              title={language === 'am' ? 'የቴሌግራም ስልክ ቁጥርዎን ያረጋግጡ' : 'Verify Telegram Phone Number'}
            >
              <Smartphone className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="truncate">{language === 'am' ? 'ስልክ አረጋግጥ' : 'Verify Phone'}</span>
            </button>
          )}

          {/* Wallet Balance Pill */}
          <div
            onClick={() => {
              if (isLoggedIn) {
                onOpenDeposit();
              } else if (onOpenAuth) {
                onOpenAuth();
              }
              triggerHaptic('light');
            }}
            className="flex items-center gap-1.5 sm:gap-2 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-500/50 rounded-full px-2 sm:px-3 py-1 sm:py-1.5 cursor-pointer transition shadow-sm group min-h-[36px]"
          >
            <div className="flex items-center gap-1 sm:gap-1.5">
              <Wallet className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${isLoggedIn ? 'text-emerald-400 group-hover:scale-110 transition-transform' : 'text-slate-500'}`} />
              <div className="text-right">
                {isLoggedIn ? (
                  <>
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
                  </>
                ) : (
                  <div className="text-[11px] sm:text-xs font-bold text-slate-500 tracking-wider">
                    <span>—</span>
                  </div>
                )}
              </div>
            </div>
            {isLoggedIn && (
              <PlusCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400 group-hover:rotate-90 transition-transform shrink-0" />
            )}
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
            title={isLoggedIn ? 'View Profile' : 'Authenticate via Telegram'}
          >
            {isLoggedIn ? (
              <div className="relative">
                <img
                  src={user.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${user.id}`}
                  alt={user.firstName || 'Player'}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-amber-400/80 object-cover group-hover:scale-105 transition-transform shrink-0"
                />
              </div>
            ) : (
              /* Blank avatar placeholder when not logged in */
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-slate-700 bg-slate-800/80 flex items-center justify-center text-slate-500 group-hover:border-amber-400/60 group-hover:text-amber-400 transition shrink-0">
                <User className="w-4 h-4" />
              </div>
            )}

            {isLoggedIn && (
              <div className="hidden lg:block min-w-0">
                <div className="text-xs font-bold text-slate-200 truncate">
                  {user.firstName}{user.lastName ? ' ' + user.lastName : ''}
                </div>
                <div className="text-[10px] text-amber-400 font-medium truncate">
                  {user.username ? `@${user.username}` : (user.phone ? user.phone : `ID: ${user.telegramId || user.id}`)}
                </div>
              </div>
            )}
          </div>

          {/* Language Toggle */}
          {onToggleLanguage && (
            <button
              onClick={() => {
                onToggleLanguage();
                triggerHaptic('light');
              }}
              className="px-2 py-1.5 min-h-[36px] flex items-center gap-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 font-bold text-xs text-slate-200 transition shrink-0"
              title="Toggle Language"
            >
              <Globe className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{language === 'am' ? '🇪🇹' : '🇬🇧'}</span>
            </button>
          )}

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
