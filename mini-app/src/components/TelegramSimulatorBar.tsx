import React from 'react';
import { UserProfile } from '@shared/types';
import { triggerHaptic } from '../lib/telegramSDK';
import { Moon, Sun, Smartphone, Bot } from 'lucide-react';

interface TelegramSimulatorBarProps {
  currentUser: UserProfile;
  allDemoUsers?: UserProfile[];
  demoUsers?: UserProfile[];
  onSwitchUser: (user: UserProfile) => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
  language?: 'en' | 'am';
  onToggleLanguage?: () => void;
  onOpenBot?: () => void;
  onlineUsersCount?: number;
}

export const TelegramSimulatorBar: React.FC<TelegramSimulatorBarProps> = ({
  currentUser: _currentUser,
  allDemoUsers,
  demoUsers,
  onSwitchUser: _onSwitchUser,
  isDarkMode,
  onToggleTheme,
  language,
  onToggleLanguage,
  onOpenBot,
  onlineUsersCount,
}) => {
  return (
    <div className="bg-slate-900 border-b border-slate-800 text-slate-200 text-xs py-2 px-3 flex flex-wrap items-center justify-between gap-2 shadow-inner">
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
          <Smartphone className="w-3.5 h-3.5" />
          Telegram WebApp Simulator
        </span>
        <span className="hidden sm:inline text-slate-400">| Environment: Telegram iOS/Android</span>
      </div>

      <div className="flex items-center flex-wrap gap-2">
        {/* Language Toggle */}
        <button
          onClick={() => {
            onToggleLanguage();
            triggerHaptic('light');
          }}
          className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 font-medium text-slate-300 transition"
        >
          {language === 'am' ? '🇪ET 🇪🇹 (አማርኛ)' : '🇬🇧 EN'}
        </button>

        {/* Theme Toggle */}
        <button
          onClick={() => {
            onToggleTheme();
            triggerHaptic('light');
          }}
          className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition"
          title="Toggle Telegram Theme"
        >
          {isDarkMode ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-indigo-400" />}
        </button>

        {/* Telegram Registration Bot Button */}
        {onOpenBot && (
          <button
            onClick={() => {
              onOpenBot();
              triggerHaptic('medium');
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 hover:brightness-110 text-white font-bold transition shadow-sm"
            title="Open Telegram Registration Bot"
          >
            <Bot className="w-3.5 h-3.5" />
            <span>🤖 Open Bot</span>
          </button>
        )}
      </div>
    </div>
  );
};
