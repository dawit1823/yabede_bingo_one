import React, { useState } from 'react';
import { UserProfile, WinningPattern, PrizeDistributionRule } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import { Users, Coins, Trophy, ShieldCheck, Sparkles, X, Check } from 'lucide-react';

interface CreatePrivateGroupModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onCreated: (group: any) => void;
  language: 'en' | 'am';
}

export const CreatePrivateGroupModal: React.FC<CreatePrivateGroupModalProps> = ({
  user,
  isOpen,
  onClose,
  onCreated,
  language,
}) => {
  const [name, setName] = useState(`${user.firstName}'s Private Group`);
  const [ticketPrice, setTicketPrice] = useState<number>(50);
  const [maxPlayers, setMaxPlayers] = useState<number>(10);
  const [maxTicketsPerPlayer, setMaxTicketsPerPlayer] = useState<number>(3);
  const [winningPattern, setWinningPattern] = useState<WinningPattern>('FULL_HOUSE');
  const [prizeDistribution, setPrizeDistribution] = useState<PrizeDistributionRule>('WINNER_100');
  const [autoStartReady, setAutoStartReady] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(apiUrl('/api/private-groups/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: user.id,
          name: name.trim() || `${user.firstName}'s Private Group`,
          ticketPrice,
          maxPlayers,
          maxTicketsPerPlayer,
          winningPattern,
          prizeDistribution,
          autoStartReady,
          allowSpectators: true,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to create group');
      }

      triggerHaptic('heavy');
      onCreated(data.group);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
      triggerHaptic('heavy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl max-w-lg w-full p-4 sm:p-6 space-y-4 sm:space-y-5 shadow-2xl my-auto max-h-[92vh] sm:max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 gap-2 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white truncate">
                {language === 'am' ? 'የግል ቢንጎ ግሩፕ ይፍጠሩ' : 'Create Private Group Bingo'}
              </h3>
              <p className="text-[10px] sm:text-xs text-slate-400 truncate">
                {language === 'am' ? 'ጓደኞችዎን ይጋብዙ እና የራሳችሁን ጃክፖት ተወዳደሩ' : 'Set custom ticket price, invite friends & play'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800 shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-2xl p-3 font-semibold shrink-0">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Group Name */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              {language === 'am' ? 'የግሩፕ ስም' : 'Group Name'}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Addis Friends Bingo 🇪🇹"
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500 font-bold"
              required
            />
          </div>

          {/* Ticket Price Selection with Horizontally Scrollable Options */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              {language === 'am' ? 'የአንድ ትኬት ዋጋ (በብር)' : 'Ticket Price per Player (ETB)'}
            </label>
            <div className="flex items-center gap-1.5 overflow-x-auto whitespace-nowrap py-1 scrollbar-none">
              {[10, 20, 50, 100, 200, 500].map((price) => (
                <button
                  key={price}
                  type="button"
                  onClick={() => {
                    setTicketPrice(price);
                    triggerHaptic('light');
                  }}
                  className={`min-h-[44px] px-3.5 py-2.5 rounded-xl font-extrabold text-xs border transition shrink-0 ${
                    ticketPrice === price
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/20'
                      : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  {price} Birr
                </button>
              ))}
            </div>
          </div>

          {/* Max Players & Max Tickets */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                {language === 'am' ? 'ከፍተኛ የተጫዋቾች ብዛት' : 'Max Players'}
              </label>
              <select
                value={maxPlayers}
                onChange={(e) => setMaxPlayers(Number(e.target.value))}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
              >
                {[2, 4, 6, 10, 20, 50, 100].map((num) => (
                  <option key={num} value={num}>
                    {num} Players
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1">
                {language === 'am' ? 'ማክስ ትኬት / ሰው' : 'Max Tickets / Player'}
              </label>
              <select
                value={maxTicketsPerPlayer}
                onChange={(e) => setMaxTicketsPerPlayer(Number(e.target.value))}
                className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
              >
                {[1, 2, 3, 5, 10].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'Ticket' : 'Tickets'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Winning Pattern */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              {language === 'am' ? 'የማሸነፊያ ሕግ (Winning Pattern)' : 'Winning Pattern'}
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setWinningPattern('FULL_HOUSE')}
                className={`p-3 rounded-2xl border text-left transition ${
                  winningPattern === 'FULL_HOUSE'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-xs font-extrabold text-white">Full House (3X)</div>
                <div className="text-[10px]">All 24 numbers daubed</div>
              </button>

              <button
                type="button"
                onClick={() => setWinningPattern('ONE_LINE')}
                className={`p-3 rounded-2xl border text-left transition ${
                  winningPattern === 'ONE_LINE'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-300 font-bold'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="text-xs font-extrabold text-white">One Line Fast</div>
                <div className="text-[10px]">Any 1 row/col completed</div>
              </button>
            </div>
          </div>

          {/* Prize Distribution */}
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-1">
              {language === 'am' ? 'የሽልማት ክፍፍል' : 'Prize Pool Distribution'}
            </label>
            <select
              value={prizeDistribution}
              onChange={(e) => setPrizeDistribution(e.target.value as PrizeDistributionRule)}
              className="w-full min-h-[44px] bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500 font-bold"
            >
              <option value="WINNER_100">100% to Winner (Winner Takes All)</option>
              <option value="HOST_10_WINNER_90">90% Winner / 10% Host Organizer Bonus</option>
            </select>
          </div>

          {/* Auto Start Toggle */}
          <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950 border border-slate-800">
            <div>
              <div className="text-xs font-bold text-white">
                {language === 'am' ? 'ተጫዋቾች ሲዘጋጁ ወዲያውኑ ጀምር' : 'Auto-Start when Players Ready'}
              </div>
              <div className="text-[10px] text-slate-400">
                {language === 'am' ? 'ተሳታፊዎች ትኬት ገዝተው ሲያበቁ ወዲያውኑ ይጀምራል' : 'Game starts automatically when all participants are ready'}
              </div>
            </div>
            <input
              type="checkbox"
              checked={autoStartReady}
              onChange={(e) => setAutoStartReady(e.target.checked)}
              className="w-5 h-5 accent-amber-500 cursor-pointer shrink-0 ml-2"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full min-h-[48px] py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>{language === 'am' ? 'በመፍጠር ላይ...' : 'Creating...'}</span>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>{language === 'am' ? 'ግሩፕ ፍጠርና ጓደኛ ይጋብዙ' : 'Create Group & Get Invite Code'}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
