import React from 'react';
import { triggerHaptic } from '../lib/telegramSDK';
import { Home, Gamepad2, History, Wallet, Gift, Trophy, ShieldAlert, FileText } from 'lucide-react';

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
  isAdmin = false,
  language,
}) => {
  const tabs = [
    {
      id: 'home' as TabType,
      label: language === 'am' ? 'መነሻ' : 'Home',
      icon: Home,
    },
    {
      id: 'active_game' as TabType,
      label: language === 'am' ? 'ጨዋታ' : 'Live Bingo',
      icon: Gamepad2,
      badge: hasActiveGameRoom ? 'LIVE' : undefined,
    },
    {
      id: 'history' as TabType,
      label: language === 'am' ? 'ታሪክ' : 'History',
      icon: History,
    },
    {
      id: 'wallet' as TabType,
      label: language === 'am' ? 'ወኪል/ሒሳብ' : 'Wallet',
      icon: Wallet,
    },
    {
      id: 'bonuses' as TabType,
      label: language === 'am' ? 'ቦነስ & ሽልማት' : 'Rewards',
      icon: Gift,
    },
    {
      id: 'leaderboard' as TabType,
      label: language === 'am' ? 'ደረጃ' : 'Leaders',
      icon: Trophy,
    },
    {
      id: 'admin' as TabType,
      label: 'Admin',
      icon: ShieldAlert,
    },
    {
      id: 'docs' as TabType,
      label: 'Docs',
      icon: FileText,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 px-2 py-1.5 shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-around gap-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => {
                onChangeTab(tab.id);
                triggerHaptic('light');
              }}
              className={`relative flex flex-col items-center justify-center py-1 px-2.5 rounded-2xl transition-all duration-200 ${
                isActive
                  ? 'text-amber-400 font-bold bg-amber-400/10 scale-105'
                  : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'text-amber-400 animate-pulse' : 'text-slate-400'}`} />
                {tab.badge && (
                  <span className="absolute -top-1 -right-3 bg-red-500 text-white text-[8px] font-black px-1 rounded-full animate-bounce">
                    {tab.badge}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 tracking-tight leading-none whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
