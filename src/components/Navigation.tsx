import React, { useState, useEffect } from 'react';
import { triggerHaptic } from '../lib/telegramSDK';
import {
  Home,
  Gamepad2,
  History,
  Wallet,
  Gift,
  Trophy,
  ShieldAlert,
  FileText,
  Menu,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export type TabType = 'home' | 'active_game' | 'history' | 'wallet' | 'bonuses' | 'leaderboard' | 'admin' | 'docs';

interface NavigationProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  hasActiveGameRoom?: boolean;
  isAdmin?: boolean;
  language: 'en' | 'am';
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onChangeTab,
  hasActiveGameRoom = false,
  isAdmin: _isAdmin = false,
  language,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const tabs = [
    {
      id: 'home' as TabType,
      label: language === 'am' ? 'መነሻ' : 'Home',
      description: language === 'am' ? 'ዋና ገጽ እና ክፍሎች' : 'Lobbies & Game Arenas',
      icon: Home,
    },
    {
      id: 'active_game' as TabType,
      label: language === 'am' ? 'የቀጥታ ጨዋታ' : 'Live Bingo',
      description: language === 'am' ? 'በቀጥታ የሚደረግ ጨዋታ' : 'Real-time 75-Ball Board',
      icon: Gamepad2,
      badge: hasActiveGameRoom ? 'LIVE' : undefined,
      badgeColor: 'bg-emerald-500',
    },
    {
      id: 'wallet' as TabType,
      label: language === 'am' ? 'ቦርሳ / ሒሳብ' : 'Wallet & Banking',
      description: language === 'am' ? 'ገቢ እና ወጪ (Telebirr/CBE)' : 'Deposits, Withdrawals & Ledger',
      icon: Wallet,
    },
    {
      id: 'bonuses' as TabType,
      label: language === 'am' ? 'ቦነስ & ሽልማት' : 'Rewards & Spin',
      description: language === 'am' ? 'ዕለታዊ ስጦታ እና እድል' : 'Lucky Wheel & Daily Gifts',
      icon: Gift,
      badge: 'GIFT',
      badgeColor: 'bg-amber-500',
    },
    {
      id: 'leaderboard' as TabType,
      label: language === 'am' ? 'የደረጃ ሰንጠረዥ' : 'Leaderboard',
      description: language === 'am' ? 'ምርጥ ተጫዋቾች እና አሸናፊዎች' : 'Top Winners & Rankings',
      icon: Trophy,
    },
    {
      id: 'history' as TabType,
      label: language === 'am' ? 'የጨዋታ ታሪክ' : 'Game History',
      description: language === 'am' ? 'ያለፉ ጨዋታዎች እና ትኬቶች' : 'Past Rounds & Result Verification',
      icon: History,
    },
    {
      id: 'admin' as TabType,
      label: language === 'am' ? 'አድሚን ፖርታል' : 'Admin Portal',
      description: language === 'am' ? 'የስርዓት ቁጥጥር' : 'Platform Control & Metrics',
      icon: ShieldAlert,
    },
    {
      id: 'docs' as TabType,
      label: language === 'am' ? 'መመሪያዎች' : 'Documentation',
      description: language === 'am' ? 'ደንቦች እና የኤፒአይ መረጃ' : 'Rules, Guide & API Reference',
      icon: FileText,
    },
  ];

  const currentTabObj = tabs.find((t) => t.id === activeTab) || tabs[0];
  const CurrentIcon = currentTabObj.icon;

  // Close sidebar on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleSelectTab = (tabId: TabType) => {
    onChangeTab(tabId);
    triggerHaptic('medium');
    setIsOpen(false);
  };

  return (
    <nav className="relative z-50">
      {/* Floating Side Bar Trigger Button */}
      <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2">
        <button
          onClick={() => {
            setIsOpen(!isOpen);
            triggerHaptic('light');
          }}
          className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-2xl transition-all duration-300 backdrop-blur-xl border ${
            isOpen
              ? 'bg-amber-500 text-slate-950 border-amber-300 scale-95 shadow-amber-500/30'
              : 'bg-slate-900/90 text-white border-slate-700/80 hover:border-amber-400/50 hover:bg-slate-800 shadow-slate-950/80 active:scale-95'
          }`}
          aria-label="Toggle Side Menu"
        >
          {isOpen ? (
            <X className="w-5 h-5 animate-spin-once" />
          ) : (
            <div className="flex items-center gap-2">
              <Menu className="w-5 h-5 text-amber-400" />
              <div className="flex items-center gap-1.5 pl-1 border-l border-slate-700">
                <CurrentIcon className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-black tracking-wide hidden sm:inline">
                  {currentTabObj.label}
                </span>
              </div>
            </div>
          )}

          <span className="text-xs font-black uppercase tracking-wider">
            {isOpen ? (language === 'am' ? 'ዝጋ' : 'Close') : (language === 'am' ? 'ምናሌ' : 'Menu')}
          </span>

          {hasActiveGameRoom && !isOpen && (
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          )}
        </button>
      </div>

      {/* Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={() => {
            setIsOpen(false);
            triggerHaptic('light');
          }}
          className="fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-sm transition-opacity duration-300"
        />
      )}

      {/* Dropdown Sidebar Drawer */}
      <div
        className={`fixed top-0 right-0 bottom-0 z-50 w-80 max-w-[85vw] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-l border-slate-800 shadow-2xl transform transition-transform duration-300 ease-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Sidebar Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-yellow-600 flex items-center justify-center font-black text-slate-950 shadow-md">
              🎱
            </div>
            <div>
              <div className="text-sm font-black text-white tracking-wide flex items-center gap-1.5">
                YABEDE <span className="text-amber-400">BINGO</span>
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {language === 'am' ? 'የአሰሳ ምናሌ' : 'Navigation Menu'}
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              setIsOpen(false);
              triggerHaptic('light');
            }}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Sidebar Items List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 custom-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleSelectTab(tab.id)}
                className={`w-full flex items-center justify-between p-3 rounded-2xl transition-all duration-200 text-left border ${
                  isActive
                    ? 'bg-gradient-to-r from-amber-500/20 to-amber-500/5 text-amber-300 border-amber-500/40 shadow-lg shadow-amber-500/10 font-bold'
                    : 'bg-slate-800/40 hover:bg-slate-800 text-slate-300 hover:text-white border-transparent hover:border-slate-700/60'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                      isActive
                        ? 'bg-amber-400 text-slate-950 shadow-md shadow-amber-400/20'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold truncate leading-tight">
                        {tab.label}
                      </span>
                      {tab.badge && (
                        <span
                          className={`text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ${
                            tab.badgeColor || 'bg-red-500'
                          } animate-pulse`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 truncate mt-0.5 font-normal">
                      {tab.description}
                    </p>
                  </div>
                </div>

                <ChevronRight
                  className={`w-4 h-4 shrink-0 transition-transform ${
                    isActive ? 'text-amber-400 translate-x-0.5' : 'text-slate-600'
                  }`}
                />
              </button>
            );
          })}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 space-y-2">
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span className="flex items-center gap-1 text-emerald-400 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              {language === 'am' ? 'ስርዓት ዝግጁ ነው' : 'Live System Online'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">v2.6.0</span>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-amber-300 text-[11px]">
            <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="text-[10px] leading-tight">
              {language === 'am'
                ? 'በቴሌብር እና ሲቢኢ ፈጣን ጨዋታ እና ገቢ/ወጪ'
                : 'Instant 75-Ball Multiplayer Gaming'}
            </span>
          </div>
        </div>
      </div>
    </nav>
  );
};

