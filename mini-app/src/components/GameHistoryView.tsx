import React, { useEffect, useState } from 'react';
import { UserProfile, GameHistoryRecord, WinningPattern } from '@shared/types';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '@shared/apiConfig';
import {
  History,
  Trophy,
  RotateCw,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  CircleX,
  Sparkles,
  Users,
  Grid,
  Hash,
  Coins,
  Award,
} from 'lucide-react';

interface GameHistoryViewProps {
  user: UserProfile;
  language: 'en' | 'am';
}

const PATTERN_LABELS: Record<WinningPattern, { en: string; am: string; badge: string }> = {
  ONE_LINE: { en: 'Single Line (1 Line)', am: 'አንድ መስመር', badge: '1 LINE' },
  TWO_LINES: { en: 'Double Line (2 Lines)', am: 'ሁለት መስመር', badge: '2 LINES' },
  FOUR_CORNERS: { en: 'Four Corners', am: 'አራት ማዕዘን', badge: 'CORNERS' },
  CORNERS: { en: 'Four Corners', am: 'አራት ማዕዘን', badge: 'CORNERS' },
  ONE_LINE_FAST_AND_CORNERS: { en: 'One Line + Corners', am: 'አንድ መስመር ወይም ማዕዘን', badge: 'LINE+CORNERS' },
  ONE_LINE_AND_CORNERS: { en: 'One Line + Corners', am: 'አንድ መስመር ወይም ማዕዘን', badge: 'LINE+CORNERS' },
  FULL_HOUSE: { en: 'Full House (BINGO)', am: 'ሙሉ ካርድ (ቢንጎ)', badge: 'FULL HOUSE' },
};

export const GameHistoryView: React.FC<GameHistoryViewProps> = ({ user, language }) => {
  const [history, setHistory] = useState<GameHistoryRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async (showRefreshSpin = false) => {
    if (showRefreshSpin) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await fetch(apiUrl(`/api/bingo/history/${user.id}`));
      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status}`);
      }
      const data = await response.json();
      if (data.success && Array.isArray(data.history)) {
        setHistory(data.history);
      } else {
        throw new Error(data.error || 'Failed to load game history');
      }
    } catch (err: any) {
      console.warn('⚠️ Error fetching game history:', err);
      setError(language === 'am' ? 'የጨዋታ ታሪክ ማምጣት አልተቻለም' : 'Could not fetch game history');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [user.id]);

  const toggleExpand = (id: string) => {
    triggerHaptic('light');
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Format relative timestamp
  const formatTimeAgo = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const diffSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
      if (diffSeconds < 60) return language === 'am' ? 'አሁን' : 'Just now';
      if (diffSeconds < 3600) {
        const mins = Math.floor(diffSeconds / 60);
        return language === 'am' ? `ከ${mins} ደቂቃ በፊት` : `${mins}m ago`;
      }
      if (diffSeconds < 86400) {
        const hours = Math.floor(diffSeconds / 3600);
        return language === 'am' ? `ከ${hours} ሰዓት በፊት` : `${hours}h ago`;
      }
      return date.toLocaleDateString(language === 'am' ? 'am-ET' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  // Stats calculation
  const totalGames = history.length;
  const totalWins = history.filter((h) => h.outcome === 'WON').length;
  const totalEarnings = history.reduce((sum, h) => sum + (h.prizeWon || 0), 0);
  const totalSpent = history.reduce((sum, h) => sum + (h.ticketPrice * h.ticketsCount), 0);

  return (
    <div className="space-y-6 pb-28 max-w-lg mx-auto px-1">
      {/* HEADER CARD */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/40 border border-slate-800 rounded-3xl p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center shadow-inner">
              <History className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">
                {language === 'am' ? 'የጨዋታ ታሪክ' : 'Game History'}
              </h2>
              <p className="text-xs text-slate-400">
                {language === 'am'
                  ? 'የመጨረሻዎቹ 5 የቢንጎ ጨዋታዎች ውጤቶች'
                  : 'Results of your last 5 Bingo games'}
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              triggerHaptic('medium');
              fetchHistory(true);
            }}
            disabled={refreshing || loading}
            className="p-2.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-slate-300 hover:text-amber-400 transition flex items-center justify-center"
            title="Refresh history"
          >
            <RotateCw className={`w-4 h-4 ${refreshing ? 'animate-spin text-amber-400' : ''}`} />
          </button>
        </div>

        {/* SUMMARY STATS BAR */}
        <div className="grid grid-cols-3 gap-2 bg-slate-950/80 p-3 rounded-2xl border border-slate-800 text-center">
          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {language === 'am' ? 'ተጫውተዋል' : 'Last 5 Games'}
            </span>
            <span className="text-base font-black text-white">{totalGames}</span>
          </div>

          <div className="border-x border-slate-800 px-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {language === 'am' ? 'ድል (Wins)' : 'Wins'}
            </span>
            <span className="text-base font-black text-emerald-400 flex items-center justify-center gap-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              {totalWins}
            </span>
          </div>

          <div>
            <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
              {language === 'am' ? 'ጠቅላላ ሽልማት' : 'Total Won'}
            </span>
            <span className="text-base font-black text-amber-400">
              {totalEarnings > 0 ? `+${totalEarnings}` : '0'} <span className="text-[10px] font-normal text-slate-400">Birr</span>
            </span>
          </div>
        </div>
      </div>

      {/* ERROR / LOADING / CONTENT STATES */}
      {loading ? (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-10 text-center space-y-3">
          <RotateCw className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-400">
            {language === 'am' ? 'የጨዋታ ታሪክ በመጫን ላይ...' : 'Loading game history...'}
          </p>
        </div>
      ) : error ? (
        <div className="bg-slate-900/80 border border-red-500/30 rounded-3xl p-6 text-center space-y-3">
          <p className="text-xs text-red-400 font-medium">{error}</p>
          <button
            onClick={() => fetchHistory()}
            className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold"
          >
            {language === 'am' ? 'እንደገና ሞክር' : 'Try Again'}
          </button>
        </div>
      ) : history.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-10 text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-800 text-slate-500 flex items-center justify-center mx-auto">
            <History className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-300">
            {language === 'am' ? 'ምንም የተቀመጠ ጨዋታ የለም' : 'No game history found'}
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {language === 'am'
              ? 'ተቀላቅለው ቢንጎ ሲጫወቱ የመጨረሻ ውጤቶችዎ እዚህ ይታያሉ።'
              : 'Join a Live Bingo arena to participate and view your results here!'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {language === 'am' ? 'የቅርብ 5 ጨዋታዎች' : 'Last 5 Played Rounds'}
            </span>
            <span className="text-[10px] text-slate-500 font-mono">
              {language === 'am' ? 'ዝርዝር ለማየት ይጫኑ' : 'Tap item for details'}
            </span>
          </div>

          {history.map((record, index) => {
            const isWon = record.outcome === 'WON';
            const isExpanded = expandedId === record.id;
            const patternInfo = record.winningPattern ? PATTERN_LABELS[record.winningPattern] : null;

            return (
              <div
                key={record.id}
                className={`transition-all duration-300 rounded-2xl border overflow-hidden shadow-lg ${
                  isWon
                    ? 'bg-gradient-to-r from-emerald-950/30 via-slate-900 to-slate-900 border-emerald-500/40 shadow-emerald-950/20'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-700'
                }`}
              >
                {/* SUMMARY HEADER */}
                <div
                  onClick={() => toggleExpand(record.id)}
                  className="p-4 cursor-pointer flex items-center justify-between gap-3 select-none"
                >
                  <div className="flex items-center gap-3">
                    {/* Outcome Icon Badge */}
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg shadow-inner shrink-0 ${
                        isWon
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      }`}
                    >
                      {isWon ? <Trophy className="w-5 h-5 text-amber-400" /> : <CircleX className="w-5 h-5 text-slate-400" />}
                    </div>

                    {/* Game / Room Title */}
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-white">
                          {record.roomIcon || '🟢'} {record.roomName}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {record.ticketPrice} Birr
                        </span>
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400">
                        {record.gameReferenceId && (
                          <>
                            <span className="font-mono text-amber-400 font-bold text-[10px] bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                              Ref: {record.gameReferenceId}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{formatTimeAgo(record.playedAt)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1 text-slate-300 font-mono">
                          <Grid className="w-3 h-3 text-slate-400" />
                          {record.ticketsCount} {record.ticketsCount === 1 ? 'Card' : 'Cards'} (
                          {record.cardNumbers.map((num) => `#${String(num).padStart(3, '0')}`).join(', ')}
                          )
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Outcome Badge & Expansion Toggle */}
                  <div className="flex items-center gap-2 text-right shrink-0">
                    <div>
                      {isWon ? (
                        <div className="space-y-0.5">
                          <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-xl">
                            <Sparkles className="w-3 h-3 text-amber-400 animate-pulse" />
                            +{record.prizeWon} Birr
                          </span>
                          {patternInfo && (
                            <span className="block text-[9px] font-black uppercase text-amber-400 tracking-wider">
                              {patternInfo.badge}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-xl border border-slate-700/50">
                          {language === 'am' ? 'አልወጣም' : 'Lost'}
                        </span>
                      )}
                    </div>

                    <div className="text-slate-400 p-1">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* EXPANDED DETAILS ACCORDION */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-2 border-t border-slate-800/80 bg-slate-950/60 space-y-3 text-xs">
                    {/* WINNING PATTERN & OUTCOME SUMMARY */}
                    <div className="grid grid-cols-2 gap-2 bg-slate-900/80 p-3 rounded-xl border border-slate-800">
                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          {language === 'am' ? 'የድል መንገድ (Pattern)' : 'Winning Pattern'}
                        </span>
                        <span className="font-bold text-amber-400 flex items-center gap-1 mt-0.5">
                          <Award className="w-3.5 h-3.5 text-amber-400" />
                          {patternInfo
                            ? language === 'am'
                              ? patternInfo.am
                              : patternInfo.en
                            : language === 'am'
                            ? 'የወጣበት የለም'
                            : 'Standard Round'}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                          {language === 'am' ? 'የድል ገቢ (Prize Outcome)' : 'Prize Outcome'}
                        </span>
                        <span
                          className={`font-black mt-0.5 block ${
                            isWon ? 'text-emerald-400' : 'text-slate-400'
                          }`}
                        >
                          {isWon
                            ? `WON ${record.prizeWon} BIRR 🎉`
                            : language === 'am'
                            ? '0 ብር (ተሸንፈዋል)'
                            : '0 Birr (Better luck next round!)'}
                        </span>
                      </div>
                    </div>

                    {/* ROUND METRICS */}
                    <div className="grid grid-cols-3 gap-2 text-center text-[11px] text-slate-300 bg-slate-900/50 p-2.5 rounded-xl border border-slate-800/60">
                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">
                          {language === 'am' ? 'የተሸጡ ካርዶች' : 'Tickets Sold'}
                        </span>
                        <span className="font-bold text-white">{record.totalTicketsSold}</span>
                      </div>

                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">
                          {language === 'am' ? 'ጠቅላላ የሽልማት ቋት' : 'Prize Pool'}
                        </span>
                        <span className="font-bold text-amber-400">{record.totalPrizePool} Birr</span>
                      </div>

                      <div>
                        <span className="text-[9px] text-slate-400 uppercase font-bold block">
                          {language === 'am' ? 'የወጡ ቁጥሮች' : 'Drawn Balls'}
                        </span>
                        <span className="font-bold text-white">{record.drawnBallsCount} balls</span>
                      </div>
                    </div>

                    {/* DRAWN BALLS FEEDS */}
                    {record.drawnBalls && record.drawnBalls.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                          {language === 'am' ? 'የተሳቡ የቢንጎ ቁጥሮች' : 'Drawn Numbers Sequence'}
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-2 bg-slate-900 rounded-xl border border-slate-800">
                          {record.drawnBalls.map((ball, idx) => (
                            <span
                              key={idx}
                              className="w-6 h-6 rounded-full bg-slate-800 text-slate-200 border border-slate-700 text-[10px] font-black flex items-center justify-center"
                            >
                              {ball}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* WINNERS OF THE ROUND */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {language === 'am' ? 'የዚህ ዙር አሸናፊዎች' : 'Round Winners'}
                      </span>

                      {record.winners && record.winners.length > 0 ? (
                        <div className="space-y-1">
                          {record.winners.map((winner, idx) => (
                            <div
                              key={winner.id || idx}
                              className={`flex items-center justify-between p-2 rounded-xl text-xs border ${
                                winner.userId === user.id
                                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 font-bold'
                                  : 'bg-slate-900/80 border-slate-800 text-slate-300'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                                <span>
                                  {winner.username} {winner.userId === user.id && '(YOU)'}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Card #{winner.cardNumber || '?'}
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span className="text-[9px] font-black uppercase text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded border border-amber-400/20">
                                  {winner.pattern}
                                </span>
                                <span className="font-bold text-emerald-400">
                                  +{winner.prizeAmount} Birr
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">
                          {language === 'am' ? 'የአሸናፊ ዝርዝር የለም' : 'No winner recorded for this round'}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
