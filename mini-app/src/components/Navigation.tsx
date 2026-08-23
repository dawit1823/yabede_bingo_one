import React, { useState, useEffect } from 'react';
import { triggerHaptic } from '../lib/telegramSDK';
import {
  Home,
  Gamepad2,
  History,
  Wallet,
  Gift,
  Trophy,
  FileText,
  Menu,
  X,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export type TabType = 'home' | 'active_game' | 'history' | 'wallet' | 'bonuses' | 'leaderboard';

interface NavigationProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  hasActiveGameRoom?: boolean;
  language: 'en' | 'am';
}

export const Navigation: React.FC<NavigationProps> = ({
  activeTab,
  onChangeTab,
  hasActiveGameRoom = false,
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

  const handleTabSelect = (tabId: TabType) => {
    triggerHaptic('light');
    onChangeTab(tabId);
    setIsOpen(false);
  };

  return (
    <>
      {/* Modern Bottom Navigation Bar */}
      <nav
        id="miniapp-bottom-navigation"
        aria-label="Bottom Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800/80 shadow-2xl pb-safe"
      >
        <div className="max-w-md mx-auto px-2 py-1.5 flex items-center justify-around gap-1">
          {/* Quick Primary Tab 1: Home */}
          <button
            id="tab-btn-home"
            type="button"
            onClick={() => handleTabSelect('home')}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'home'
                ? 'text-amber-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{language === 'am' ? 'መነሻ' : 'Home'}</span>
          </button>

          {/* Quick Primary Tab 2: Live Game */}
          <button
            id="tab-btn-active-game"
            type="button"
            onClick={() => handleTabSelect('active_game')}
            className={`relative flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'active_game'
                ? 'text-amber-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Gamepad2 className="w-5 h-5 mb-0.5" />
              {hasActiveGameRoom && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-500 rounded-full animate-ping" />
              )}
            </div>
            <span className="text-[10px] tracking-tight">{language === 'am' ? 'ጨዋታ' : 'Game'}</span>
          </button>

          {/* Quick Primary Tab 3: Wallet */}
          <button
            id="tab-btn-wallet"
            type="button"
            onClick={() => handleTabSelect('wallet')}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'wallet'
                ? 'text-amber-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{language === 'am' ? 'ቦርሳ' : 'Wallet'}</span>
          </button>

          {/* Quick Primary Tab 4: Bonus */}
          <button
            id="tab-btn-bonuses"
            type="button"
            onClick={() => handleTabSelect('bonuses')}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all ${
              activeTab === 'bonuses'
                ? 'text-amber-400 font-bold scale-105'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <div className="relative">
              <Gift className="w-5 h-5 mb-0.5" />
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
              </span>
            </div>
            <span className="text-[10px] tracking-tight">{language === 'am' ? 'ቦነስ' : 'Bonus'}</span>
          </button>

          {/* Menu Drawer Toggle Button */}
          <button
            id="tab-btn-menu-drawer"
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              setIsOpen(true);
            }}
            className={`flex flex-col items-center justify-center flex-1 py-1.5 px-1 rounded-xl transition-all ${
              ['leaderboard', 'history'].includes(activeTab)
                ? 'text-amber-400 font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Menu className="w-5 h-5 mb-0.5" />
            <span className="text-[10px] tracking-tight">{language === 'am' ? 'ተጨማሪ' : 'More'}</span>
          </button>
        </div>
      </nav>

      {/* Slide-over Full Navigation Drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-xs bg-slate-900 h-full border-l border-slate-800 shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200">
            {/* Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-yellow-300 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20">
                  B
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100 flex items-center gap-1">
                    <span>Ahun Bingo</span>
                    <Sparkles className="w-3 h-3 text-amber-400" />
                  </h2>
                  <p className="text-[10px] text-slate-400">{language === 'am' ? 'ዋና ሜኑ' : 'Navigation Menu'}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tab List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                const isSelected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    id={`drawer-tab-${tab.id}`}
                    type="button"
                    onClick={() => handleTabSelect(tab.id)}
                    className={`w-full flex items-center justify-between p-3 rounded-xl transition text-left ${
                      isSelected
                        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
                        : 'bg-slate-800/40 border border-slate-800 hover:bg-slate-800/80 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`p-2 rounded-lg ${
                          isSelected ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-semibold flex items-center space-x-1.5">
                          <span>{tab.label}</span>
                          {tab.badge && (
                            <span
                              className={`text-[9px] px-1.5 py-0.5 rounded-full font-black text-slate-950 ${
                                tab.badgeColor || 'bg-amber-400'
                              }`}
                            >
                              {tab.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 line-clamp-1">{tab.description}</p>
                      </div>
                    </div>
                    <ChevronRight
                      className={`w-4 h-4 ${isSelected ? 'text-amber-400' : 'text-slate-500'}`}
                    />
                  </button>
                );
              })}
            </div>

            {/* Drawer Footer */}
            <div className="p-3 border-t border-slate-800 bg-slate-950/40 text-center">
              <p className="text-[10px] text-slate-400 font-mono">
                Ahun Bingo v2.5 • Telegram Mini App
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
