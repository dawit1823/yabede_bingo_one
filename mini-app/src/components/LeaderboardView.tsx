import React from 'react';
import { LeaderboardEntry } from '@shared/types';
import { triggerHaptic } from '../lib/telegramSDK';
import { Trophy, Award, Flame, Crown } from 'lucide-react';

interface LeaderboardViewProps {
  entries: LeaderboardEntry[];
  language: 'en' | 'am';
}

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ entries, language }) => {
  const [period, setPeriod] = React.useState<'daily' | 'weekly' | 'alltime'>('daily');

  const topThree = entries.slice(0, 3);
  const remaining = entries.slice(3);

  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-amber-950/60 via-slate-900 to-slate-950 border border-amber-500/30 rounded-3xl p-6 shadow-2xl text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
          <Trophy className="w-7 h-7" />
        </div>

        <h2 className="text-2xl font-black text-white">
          {language === 'am' ? 'የደረጃ ሰንጠረዥ' : 'Yabede Bingo Leaderboard'}
        </h2>
        <p className="text-xs text-slate-300 max-w-sm mx-auto">
          Top players win weekly prize pool bonuses and VIP status rewards!
        </p>

        {/* Period Filter Tabs */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 max-w-xs mx-auto mt-4">
          {(['daily', 'weekly', 'alltime'] as const).map((p) => (
            <button
              key={p}
              onClick={() => {
                setPeriod(p);
                triggerHaptic('light');
              }}
              className={`py-1.5 rounded-xl text-xs font-black capitalize transition ${
                period === p
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* TOP 3 PODIUM */}
      {topThree.length >= 3 && (
        <div className="grid grid-cols-3 gap-2 items-end pt-4">
          {/* 2nd Place */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3 text-center space-y-2 shadow-xl">
            <div className="relative inline-block">
              <img
                src={topThree[1].photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${topThree[1].userId}`}
                alt={topThree[1].firstName}
                className="w-12 h-12 rounded-full border-2 border-slate-300 mx-auto object-cover"
              />
              <span className="absolute -top-2 -right-2 bg-slate-300 text-slate-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-slate-950">
                2
              </span>
            </div>
            <div>
              <div className="text-xs font-black text-white truncate">{topThree[1].firstName}</div>
              <div className="text-[10px] text-amber-400 font-bold">{topThree[1].totalWins} Wins</div>
            </div>
          </div>

          {/* 1st Place GOLD */}
          <div className="bg-gradient-to-b from-amber-500/20 to-slate-900 border-2 border-amber-400 rounded-3xl p-4 text-center space-y-2 shadow-2xl scale-105">
            <Crown className="w-6 h-6 text-amber-400 mx-auto animate-bounce" />
            <div className="relative inline-block">
              <img
                src={topThree[0].photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${topThree[0].userId}`}
                alt={topThree[0].firstName}
                className="w-16 h-16 rounded-full border-2 border-amber-400 mx-auto object-cover shadow-lg shadow-amber-500/30"
              />
              <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 text-xs font-black w-6 h-6 rounded-full flex items-center justify-center border-2 border-slate-950">
                1
              </span>
            </div>
            <div>
              <div className="text-sm font-black text-white truncate">{topThree[0].firstName}</div>
              <div className="text-xs text-amber-300 font-extrabold">{topThree[0].totalWins} Wins</div>
            </div>
          </div>

          {/* 3rd Place */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-3 text-center space-y-2 shadow-xl">
            <div className="relative inline-block">
              <img
                src={topThree[2].photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${topThree[2].userId}`}
                alt={topThree[2].firstName}
                className="w-12 h-12 rounded-full border-2 border-amber-700 mx-auto object-cover"
              />
              <span className="absolute -top-2 -right-2 bg-amber-700 text-white text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border border-slate-950">
                3
              </span>
            </div>
            <div>
              <div className="text-xs font-black text-white truncate">{topThree[2].firstName}</div>
              <div className="text-[10px] text-amber-400 font-bold">{topThree[2].totalWins} Wins</div>
            </div>
          </div>
        </div>
      )}

      {/* RANKINGS 4 to 20 */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-2 shadow-xl">
        {remaining.map((entry) => (
          <div
            key={entry.userId}
            className="bg-slate-950 rounded-2xl p-3 border border-slate-800/80 flex items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-3">
              <span className="w-6 font-extrabold text-slate-500 text-center">#{entry.rank}</span>
              <img
                src={entry.photoUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${entry.userId}`}
                alt={entry.firstName}
                className="w-8 h-8 rounded-full border border-slate-700 object-cover"
              />
              <div>
                <div className="font-bold text-white flex items-center gap-1.5">
                  <span>{entry.firstName}</span>
                  <span className="text-[9px] font-black px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
                    L{entry.vipLevel}
                  </span>
                </div>
                <span className="text-[10px] text-slate-400">@{entry.username}</span>
              </div>
            </div>

            <div className="text-right">
              <span className="font-black text-amber-400 block">{entry.totalWins} Wins</span>
              <span className="text-[9px] text-slate-500">{entry.totalGamesPlayed} Games</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
