import React from 'react';
import { collection, query, where, doc, onSnapshot } from 'firebase/firestore';
import { db as firestoreDb } from '../lib/firebase';
import { BingoRoom, BingoTicket, ChatMessage, UserProfile, WinningPattern, RoomStats } from '../types';
import { triggerHaptic, triggerNotificationHaptic } from '../lib/telegramSDK';
import { audioEngine, getAmharicNumberText } from '../lib/audioEngine';
import { formatCardNumber, getRemainingSeconds } from '../lib/bingoUtils';
import { apiUrl } from '../lib/apiConfig';
import { logger } from '../lib/logger';
import confetti from 'canvas-confetti';
import { MessageSquare, Send, Sparkles, Trophy, Volume2, CheckCircle2, AlertCircle, History, RefreshCw } from 'lucide-react';

interface ActiveGameViewProps {
  room: BingoRoom;
  tickets: BingoTicket[];
  user: UserProfile;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClaimBingo: (ticketId: string) => void;
  onReturnToCardSelection?: () => void;
  onPlayAgain?: () => void;
  onCloseGroup?: () => void;
  isHost?: boolean;
  language: 'en' | 'am';
}

// 75-Number Drawn Bingo Board Grid Component
const BingoMasterBoard = React.memo<{ drawnBalls: number[]; currentBall: number | null }>(
  ({ drawnBalls, currentBall }) => {
    const drawnSet = React.useMemo(() => new Set(drawnBalls || []), [drawnBalls]);
    const columns = [
      { label: 'B', min: 1, max: 15, color: 'text-red-400 border-red-500/30 bg-red-500/10' },
      { label: 'I', min: 16, max: 30, color: 'text-amber-400 border-amber-500/30 bg-amber-500/10' },
      { label: 'N', min: 31, max: 45, color: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10' },
      { label: 'G', min: 46, max: 60, color: 'text-sky-400 border-sky-500/30 bg-sky-500/10' },
      { label: 'O', min: 61, max: 75, color: 'text-purple-400 border-purple-500/30 bg-purple-500/10' },
    ];

    return (
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-3 sm:p-4 space-y-2 shadow-xl">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2">
          <span className="flex items-center gap-1.5 text-amber-400 font-black">
            <Sparkles className="w-4 h-4" />
            <span>Drawn Bingo Numbers ({drawnSet.size}/75)</span>
          </span>
          <span className="text-[10px] text-slate-400 font-mono">LIVE DRAW</span>
        </div>

        {/* Vertical B-I-N-G-O Columns Grid */}
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5 pt-1">
          {columns.map((col) => {
            const numbers = Array.from({ length: col.max - col.min + 1 }, (_, i) => col.min + i);
            return (
              <div key={col.label} className="flex flex-col gap-1 text-center">
                {/* Column Header */}
                <div
                  className={`w-full py-1.5 rounded-lg border font-black text-xs sm:text-sm flex items-center justify-center shrink-0 shadow-sm ${col.color}`}
                >
                  {col.label}
                </div>
                {/* Vertical Column Numbers */}
                <div className="flex flex-col gap-1">
                  {numbers.map((num) => {
                    const isDrawn = drawnSet.has(num);
                    const isCurrent = currentBall === num;

                    return (
                      <div
                        key={num}
                        className={`w-full py-1 rounded text-[10px] sm:text-xs font-mono font-bold flex items-center justify-center transition ${
                          isCurrent
                            ? 'bg-amber-400 text-slate-950 font-black ring-2 ring-amber-300 animate-pulse scale-105 z-10 shadow-lg'
                            : isDrawn
                            ? 'bg-emerald-500/90 text-white font-extrabold shadow-sm'
                            : 'bg-slate-950 text-slate-600 border border-slate-800/80'
                        }`}
                        title={`Ball #${num} ${isDrawn ? '(Drawn)' : ''}`}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);

export const ActiveGameView: React.FC<ActiveGameViewProps> = ({
  room,
  tickets,
  user,
  messages,
  onSendMessage,
  onClaimBingo,
  onReturnToCardSelection,
  onPlayAgain,
  onCloseGroup,
  isHost,
  language,
}) => {
  const [autoDaub, setAutoDaub] = React.useState<boolean>(true);
  const [chatOpen, setChatOpen] = React.useState<boolean>(false);
  const [messageInput, setMessageInput] = React.useState<string>('');
  const [localDaubed, setLocalDaubed] = React.useState<Record<string, boolean[][]>>({});
  const [nextDrawSeconds, setNextDrawSeconds] = React.useState<number>(3);
  const [liveRoomStats, setLiveRoomStats] = React.useState<RoomStats | null>(null);
  const [showWinnerModal, setShowWinnerModal] = React.useState<boolean>(true);
  const [liveTickets, setLiveTickets] = React.useState<BingoTicket[]>(tickets || []);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);

  const handleRefreshGame = React.useCallback(async () => {
    if (isRefreshing || !room?.id) return;
    try {
      setIsRefreshing(true);
      triggerHaptic('light');

      const res = await fetch(apiUrl(`/api/bingo/room-status/${room.id}?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        if (data && data.success) {
          if (data.room) {
            setLiveRoomStats({
              prizePool: data.room.prizePool,
              ticketsSold: data.room.ticketsSold,
              activePlayersCount: data.room.activePlayersCount,
            });
          }
          if (Array.isArray(data.myTickets) && data.myTickets.length > 0) {
            setLiveTickets((prev) => {
              const ticketMap = new Map<string, BingoTicket>();
              prev.forEach((t) => ticketMap.set(t.id, t));
              data.myTickets.forEach((t: BingoTicket) => ticketMap.set(t.id, t));
              return Array.from(ticketMap.values());
            });
          }
        }
      }
    } catch (err) {
      logger.debug('Manual game refresh note:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, [room?.id, user?.id, isRefreshing]);

  // Sync prop changes without wiping out accumulated tickets
  React.useEffect(() => {
    if (tickets && tickets.length > 0) {
      setLiveTickets((prev) => {
        const ticketMap = new Map<string, BingoTicket>();
        prev.forEach((t) => ticketMap.set(t.id, t));
        tickets.forEach((t) => ticketMap.set(t.id, t));
        return Array.from(ticketMap.values());
      });
    }
  }, [tickets]);

  // Server-authoritative REST status fetch on mount & reconnect
  React.useEffect(() => {
    if (!room?.id || !user?.id) return;
    let isMounted = true;

    fetch(apiUrl(`/api/bingo/room-status/${room.id}?userId=${user.id}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && data.success && Array.isArray(data.myTickets) && data.myTickets.length > 0) {
          setLiveTickets((prev) => {
            const ticketMap = new Map<string, BingoTicket>();
            prev.forEach((t) => ticketMap.set(t.id, t));
            data.myTickets.forEach((t: BingoTicket) => ticketMap.set(t.id, t));
            return Array.from(ticketMap.values());
          });
        }
      })
      .catch((err) => logger.debug('Initial status fetch notice:', err));

    return () => {
      isMounted = false;
    };
  }, [room?.id, user?.id]);

  // Real-time Firestore snapshot for tickets belonging to current user in this room
  React.useEffect(() => {
    if (!room?.id || !user?.id) return;

    const q = query(
      collection(firestoreDb, 'tickets'),
      where('roomId', '==', room.id),
      where('userId', '==', user.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched: BingoTicket[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as BingoTicket),
        }));
        if (fetched.length > 0) {
          setLiveTickets((prev) => {
            const ticketMap = new Map<string, BingoTicket>();
            prev.forEach((t) => ticketMap.set(t.id, t));
            fetched.forEach((t) => ticketMap.set(t.id, t));
            return Array.from(ticketMap.values());
          });
        }
      },
      (err) => {
        logger.debug('Live tickets snapshot note:', err.message);
      }
    );

    return () => unsubscribe();
  }, [room?.id, user?.id]);

  // Auto-reset modal state when a new game round starts
  React.useEffect(() => {
    if (room.status === 'PLAYING' || room.status === 'WAITING' || room.status === 'COUNTDOWN') {
      setShowWinnerModal(true);
    }
  }, [room.status]);

  // Real-time Firestore Subscription specifically to 'roomStats' sub-collection
  React.useEffect(() => {
    if (!room?.id) return;

    const statsRef = doc(firestoreDb, 'rooms', room.id, 'roomStats', 'current');
    const unsubscribe = onSnapshot(
      statsRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setLiveRoomStats(snapshot.data() as RoomStats);
        }
      },
      (err) => {
        logger.debug('roomStats sub-collection snapshot note:', err.message);
      }
    );

    return () => unsubscribe();
  }, [room?.id]);

  const displayPrizePool = liveRoomStats?.prizePool ?? room.prizePool ?? 0;
  const displayTicketsSold = liveRoomStats?.ticketsSold ?? room.ticketsSold ?? 0;
  const displayActivePlayers = liveRoomStats?.activePlayersCount ?? room.activePlayersCount ?? 0;

  // Reset 3-second ball draw timer when a new ball is drawn
  React.useEffect(() => {
    setNextDrawSeconds(3);
  }, [room?.currentBall, room?.drawnBalls?.length || 0]);

  // 1-second interval for 3-second ball draw countdown during active play
  React.useEffect(() => {
    if (room?.status !== 'PLAYING') return;
    const interval = setInterval(() => {
      setNextDrawSeconds((prev) => (prev > 1 ? prev - 1 : 3));
    }, 1000);
    return () => clearInterval(interval);
  }, [room?.status]);

  // Initialize local daub state from tickets
  React.useEffect(() => {
    const daubMap: Record<string, boolean[][]> = {};
    (tickets || []).forEach((t) => {
      if (t && t.daubed) {
        daubMap[t.id] = t.daubed.map((row) => [...row]);
      }
    });
    setLocalDaubed(daubMap);
  }, [tickets]);

  // Audio pop & Voice caller announcement on new ball drawn
  React.useEffect(() => {
    if (room?.currentBall) {
      audioEngine.playPop();
      audioEngine.speakBallDraw(room.currentBall, language);
    }
  }, [room?.currentBall, language]);

  // Handle cell tap daub
  const handleCellClick = (ticketId: string, rowIndex: number, colIndex: number) => {
    triggerHaptic('light');
    audioEngine.playDaub();

    setLocalDaubed((prev) => {
      const ticketMatrix = prev[ticketId] ? prev[ticketId].map((r) => [...r]) : Array(5).fill(false).map(() => Array(5).fill(false));
      ticketMatrix[rowIndex][colIndex] = !ticketMatrix[rowIndex][colIndex];
      return { ...prev, [ticketId]: ticketMatrix };
    });
  };

  // Helper to check if ticket cell is drawn or FREE
  const isCellDrawn = (cellVal: number | 'FREE') => {
    if (cellVal === 'FREE') return true;
    return (room?.drawnBalls || []).includes(cellVal);
  };

  // Helper to check if ticket cell is daubed locally or by auto-daub
  const isCellMarked = (ticketId: string, rIdx: number, cIdx: number, cellVal: number | 'FREE') => {
    if (cellVal === 'FREE') return true;
    if (autoDaub) return isCellDrawn(cellVal);
    return localDaubed[ticketId]?.[rIdx]?.[cIdx] || false;
  };

  // Helper to check if a ticket has met pattern requirements
  const checkReadyForBingo = (ticket: BingoTicket): boolean => {
    const daubedMatrix: boolean[][] = ticket.matrix.map((row, rIdx) =>
      row.map((cell, cIdx) => isCellMarked(ticket.id, rIdx, cIdx, cell))
    );

    for (const pattern of room.winningPatterns) {
      if (pattern === 'FOUR_CORNERS') {
        if (daubedMatrix[0][0] && daubedMatrix[0][4] && daubedMatrix[4][0] && daubedMatrix[4][4]) return true;
      } else if (pattern === 'FULL_HOUSE') {
        if (daubedMatrix.every((r) => r.every((c) => c))) return true;
      } else if (pattern === 'ONE_LINE') {
        // Rows
        if (daubedMatrix.some((r) => r.every((c) => c))) return true;
        // Cols
        for (let c = 0; c < 5; c++) {
          if (daubedMatrix.every((r) => r[c])) return true;
        }
        // Diagonals
        if (daubedMatrix[0][0] && daubedMatrix[1][1] && daubedMatrix[2][2] && daubedMatrix[3][3] && daubedMatrix[4][4]) return true;
        if (daubedMatrix[0][4] && daubedMatrix[1][3] && daubedMatrix[2][2] && daubedMatrix[3][1] && daubedMatrix[4][0]) return true;
      }
    }
    return false;
  };

  const handleClaim = (ticketId: string) => {
    onClaimBingo(ticketId);
    triggerNotificationHaptic('success');
    audioEngine.playWin();
    confetti({
      particleCount: 120,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const getBallLetter = (ball: number): string => {
    if (ball <= 15) return 'B';
    if (ball <= 30) return 'I';
    if (ball <= 45) return 'N';
    if (ball <= 60) return 'G';
    return 'O';
  };

  const getAmharicLetter = (ball: number): string => {
    if (ball <= 15) return 'ቢ';
    if (ball <= 30) return 'አይ';
    if (ball <= 45) return 'ኤን';
    if (ball <= 60) return 'ጂ';
    return 'ኦ';
  };

  const getBallColor = (ball: number): string => {
    if (ball <= 15) return 'from-red-500 to-rose-600';
    if (ball <= 30) return 'from-amber-400 to-yellow-500 text-slate-950';
    if (ball <= 45) return 'from-emerald-400 to-green-600 text-slate-950';
    if (ball <= 60) return 'from-sky-400 to-blue-600';
    return 'from-purple-500 to-indigo-600';
  };

  const activeCountdown = getRemainingSeconds(room);

  return (
    <div className="space-y-5 pb-24">
      {/* Live Room Header Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{room.icon}</span>
            <h2 className="text-base font-black text-white">{room.name}</h2>
            {tickets.length > 0 ? (
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-extrabold text-[10px] uppercase tracking-wider">
                Active Participant
              </span>
            ) : (
              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400 font-extrabold text-[10px] uppercase tracking-wider">
                Spectator Mode
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
            {room.gameReferenceId && (
              <>
                <span className="text-amber-400 font-mono font-bold bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  Ref: {room.gameReferenceId}
                </span>
                <span className="text-slate-600">•</span>
              </>
            )}
            <span>
              Prize Pool:{' '}
              <span className="text-amber-400 font-extrabold">
                {displayPrizePool.toLocaleString()} Birr
              </span>
            </span>
            <span className="text-slate-600">•</span>
            <span>
              Tickets Sold:{' '}
              <span className="text-emerald-400 font-extrabold">{displayTicketsSold}</span>
            </span>
            {displayActivePlayers > 0 && (
              <>
                <span className="text-slate-600">•</span>
                <span>
                  Players:{' '}
                  <span className="text-sky-400 font-extrabold">{displayActivePlayers}</span>
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Refresh Button */}
          <button
            onClick={handleRefreshGame}
            disabled={isRefreshing}
            title="Refresh Game State"
            className="p-2 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer flex items-center gap-1 text-xs font-bold"
          >
            <RefreshCw className={`w-4 h-4 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          {/* Auto Daub Toggle */}
          <button
            onClick={() => {
              setAutoDaub(!autoDaub);
              triggerHaptic('light');
            }}
            className={`px-3 py-1.5 rounded-2xl text-xs font-black border transition ${
              autoDaub
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {autoDaub ? '⚡ Auto-Daub ON' : '🖐️ Manual Daub'}
          </button>

          {/* Chat Drawer Toggle */}
          <button
            onClick={() => {
              setChatOpen(!chatOpen);
              triggerHaptic('light');
            }}
            className="p-2 rounded-2xl bg-slate-800 border border-slate-700 text-slate-300 relative"
          >
            <MessageSquare className="w-4 h-4" />
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full" />
            )}
          </button>
        </div>
      </div>

      {/* Auto-Play background protection banner */}
      <div className="bg-emerald-950/40 border border-emerald-500/40 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs text-emerald-300 shadow-md">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            {language === 'am'
              ? 'ይህንን ገጽ ቢዘጉት እንኳ ትኬትዎ በጀርባ ይጫወታል። ካሸነፉ ሽልማቱ በቀጥታ ወደ ቦርሳዎ ይገባል!'
              : 'Auto-Play Active: Even if you close this page, your bet stays active and winnings are credited directly to your balance!'}
          </span>
        </div>
      </div>

      {/* Live Current Ball Callout */}
      {room.status === 'FINISHED' ? (
        <div className="bg-gradient-to-br from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500 rounded-3xl p-6 text-center shadow-2xl relative overflow-hidden space-y-4 animate-fade-in">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-3">
            <div className="w-16 h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-400 flex items-center justify-center mx-auto text-3xl font-black">
              🏆
            </div>
            <h3 className="text-xl font-black text-amber-400 tracking-tight">
              {language === 'am' ? '🎉 የዙሩ አሸናፊዎች (GAME FINISHED)!' : '🎉 ROUND WINNERS ANNOUNCEMENT!'}
            </h3>
            {room.gameReferenceId && (
              <div className="inline-block bg-slate-950/80 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-mono font-bold text-amber-300 shadow-sm">
                Game Ref: {room.gameReferenceId}
              </div>
            )}
            <p className="text-xs text-slate-300 max-w-sm mx-auto">
              {language === 'am'
                ? 'እንኳን ደስ አለዎት! የዚህ ዙር አሸናፊዎች ተለይተዋል፡'
                : 'Congratulations to the winners of this round! Winnings have been credited directly to their wallets.'}
            </p>

            {room.lastWinners && room.lastWinners.length > 0 ? (
              <div className="space-y-2.5 max-w-md mx-auto pt-2">
                {room.lastWinners.map((winner, idx) => (
                  <div
                    key={winner.id || `win-${idx}`}
                    className="bg-slate-950/95 border border-amber-500/50 rounded-2xl p-4 flex items-center justify-between gap-3 text-left shadow-xl"
                  >
                    <div className="flex items-center gap-3">
                      {winner.photoUrl ? (
                        <img
                          src={winner.photoUrl}
                          alt={winner.username}
                          className="w-11 h-11 rounded-full object-cover border-2 border-amber-400 shrink-0"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black flex items-center justify-center text-sm border-2 border-amber-400 shrink-0">
                          {winner.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="space-y-0.5">
                        <div className="text-sm font-black text-white flex items-center gap-1.5">
                          <span>@{winner.username}</span>
                          <span className="bg-amber-500/20 text-amber-300 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/40 font-bold">
                            Card #{winner.cardNumber || '—'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-300 font-semibold flex items-center gap-2">
                          <span>Pattern: <strong className="text-amber-300">{winner.pattern}</strong></span>
                          <span>•</span>
                          <span>Ticket: <strong className="text-slate-200">{winner.ticketPrice || room.ticketPrice} Birr</strong></span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 block font-semibold">Prize Won</span>
                      <span className="text-base font-black text-emerald-400">
                        +{(winner.prizeAmount || 0).toLocaleString()} Birr
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-400">
                No winners claimed in this round. Prize carried over to next game!
              </div>
            )}

            <div className="pt-2 text-[11px] text-amber-300 font-extrabold animate-pulse">
              ⏱ Next Game Round Starting Shortly ({activeCountdown}s)...
            </div>
          </div>
        </div>
      ) : (
        /* Responsive Main Game Grid Container (2 Columns on Desktop, Stacked Mobile) */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column: Live Ball Callout & 75-Number Master Board */}
          <div className="lg:col-span-5 space-y-4">
            {/* Live Ball Card */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-3xl p-4 text-center shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 space-y-2.5">
                <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400 flex items-center justify-center gap-2">
                  <span>{room.status === 'PLAYING' ? '⚡ LIVE BALL DRAW' : '⏳ GAME COUNTDOWN'}</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 font-bold text-[10px]">
                    {room.status === 'PLAYING'
                      ? `Next ball in ${nextDrawSeconds}s`
                      : `Starts in ${activeCountdown}s`}
                  </span>
                </span>

                {room.currentBall ? (
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div
                      className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-tr ${getBallColor(
                        room.currentBall
                      )} shadow-2xl flex flex-col items-center justify-center text-white border-4 border-slate-900 animate-bounce`}
                    >
                      <span className="text-xs sm:text-sm font-black opacity-80">
                        {getBallLetter(room.currentBall)}
                      </span>
                      <span className="text-3xl sm:text-4xl font-black leading-none">{room.currentBall}</span>
                    </div>

                    {/* Draw Interval Progress Indicator & Spoken Voice Tag */}
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700/80 text-amber-300 font-extrabold text-xs shadow-md">
                        <Volume2 className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>
                          {language === 'am'
                            ? `${getAmharicLetter(room.currentBall)}, ${getAmharicNumberText(room.currentBall)}`
                            : `${getBallLetter(room.currentBall)}, ${room.currentBall}`}
                        </span>
                      </div>

                      <div className="w-36 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80">
                        <div
                          className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all duration-1000 ease-linear"
                          style={{ width: `${(nextDrawSeconds / 3) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="py-4 text-slate-300 text-base font-extrabold flex flex-col items-center gap-2">
                    <Sparkles className="w-8 h-8 text-amber-400 animate-spin" />
                    <div className="text-2xl font-black text-amber-400 font-mono">
                      00:{activeCountdown.toString().padStart(2, '0')}
                    </div>
                    <span className="text-xs text-slate-400 font-medium">Waiting for players & game start...</span>
                  </div>
                )}

                {/* Vertical Scrollable Drawn Balls History Feed */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-1">
                    <span className="flex items-center gap-1 text-amber-400">
                      <History className="w-3.5 h-3.5" />
                      <span>Drawn Balls History ({room.drawnBalls.length}/75)</span>
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">NEWEST FIRST</span>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto py-1 px-0.5 no-scrollbar">
                    {room.drawnBalls.length === 0 ? (
                      <span className="text-[11px] text-slate-500 italic py-1 text-center">No balls drawn yet...</span>
                    ) : (
                      [...room.drawnBalls].reverse().map((b, idx) => {
                        const letter = getBallLetter(b);
                        const colorClass = getBallColor(b);
                        const isLatest = idx === 0;

                        return (
                          <div
                            key={`${b}-${idx}`}
                            className={`flex items-center justify-between px-3 py-1.5 rounded-xl border text-xs font-black transition ${
                              isLatest
                                ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-2 ring-amber-400/40'
                                : 'bg-slate-950 text-slate-200 border-slate-800'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-5 h-5 rounded-full bg-gradient-to-tr ${colorClass} text-white text-[10px] flex items-center justify-center font-black shadow-sm`}
                              >
                                {letter}
                              </span>
                              <span className="font-mono text-xs font-black">Ball #{b}</span>
                            </div>
                            <span className={`text-[9px] font-mono ${isLatest ? 'text-slate-950 font-black' : 'text-slate-400'}`}>
                              {isLatest ? 'LATEST DRAW' : `#${room.drawnBalls.length - idx}`}
                            </span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Master 75-Number Drawn Bingo Board */}
            <BingoMasterBoard drawnBalls={room.drawnBalls} currentBall={room.currentBall} />
          </div>

          {/* Right Column: User Purchased Cards */}
          <div className="lg:col-span-7 space-y-4">
            {liveTickets.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs sm:text-sm font-black text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-400" />
                    <span>Your Purchased Cards ({liveTickets.length})</span>
                  </h3>
                  <span className="text-[10px] text-slate-400 font-bold">
                    {liveTickets.length > 1 ? 'Horizontal scrollable' : 'Active'}
                  </span>
                </div>

                {/* Horizontal Scrollable Row for Cards on Mobile, Stack/Grid on Large Screens */}
                <div className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-4 pb-3 lg:pb-0 snap-x snap-mandatory no-scrollbar">
                  {liveTickets.map((ticket) => {
                    const isReady = checkReadyForBingo(ticket);
                    const cardDisplayNumber = ticket.cardNumber ? formatCardNumber(ticket.cardNumber) : `#${ticket.id.slice(-3)}`;

                    return (
                      <div
                        key={ticket.id}
                        className={`bg-slate-900 border ${
                          isReady ? 'border-emerald-500/80 shadow-emerald-500/20' : 'border-slate-800'
                        } rounded-3xl p-4 space-y-3 shadow-xl relative transition min-w-[280px] sm:min-w-[320px] lg:min-w-0 max-w-[360px] lg:max-w-none shrink-0 lg:shrink snap-center`}
                      >
                        {/* Ticket Header displaying EXACT Card Number & Game Ref */}
                        <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-black text-emerald-400 text-sm">
                              Card {cardDisplayNumber}
                            </span>
                            {(ticket.gameReferenceId || room.gameReferenceId) && (
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                                {ticket.gameReferenceId || room.gameReferenceId}
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                            Patterns: {room.winningPatterns.join(', ')}
                          </span>
                        </div>

                        {/* 5x5 Bingo Matrix */}
                        <div className="grid grid-cols-5 gap-1.5 text-center">
                          {['B', 'I', 'N', 'G', 'O'].map((letter, lIdx) => (
                            <div
                              key={lIdx}
                              className="text-xs font-black text-amber-400 py-1 bg-slate-950 rounded-lg border border-slate-800"
                            >
                              {letter}
                            </div>
                          ))}

                          {ticket.matrix.map((row, rIdx) =>
                            row.map((cell, cIdx) => {
                              const marked = isCellMarked(ticket.id, rIdx, cIdx, cell);

                              return (
                                <button
                                  key={`${rIdx}-${cIdx}`}
                                  onClick={() => handleCellClick(ticket.id, rIdx, cIdx)}
                                  className={`aspect-square rounded-xl text-xs font-black flex items-center justify-center transition border ${
                                    cell === 'FREE'
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black'
                                      : marked
                                      ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/30 scale-95 font-black'
                                      : 'bg-slate-800/80 text-slate-200 border-slate-700/80 hover:bg-slate-700'
                                  }`}
                                >
                                  {cell === 'FREE' ? '★' : cell}
                                </button>
                              );
                            })
                          )}
                        </div>

                        {/* BINGO CLAIM BUTTON */}
                        <button
                          onClick={() => handleClaim(ticket.id)}
                          disabled={!isReady || ticket.status === 'BINGO_CLAIMED'}
                          className={`w-full py-3.5 rounded-2xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-xl ${
                            isReady && ticket.status !== 'BINGO_CLAIMED'
                              ? 'bg-gradient-to-r from-emerald-400 via-green-500 to-emerald-400 text-slate-950 shadow-emerald-500/30 animate-pulse hover:brightness-110 cursor-pointer'
                              : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                          }`}
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>
                            {ticket.status === 'BINGO_CLAIMED'
                              ? '✅ BINGO CLAIMED!'
                              : isReady
                              ? '🎉 CLAIM BINGO NOW!'
                              : 'Complete Pattern to Claim Bingo'}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3 shadow-xl">
                <AlertCircle className="w-8 h-8 text-amber-400 mx-auto" />
                <div className="space-y-1">
                  <span className="text-xs font-black uppercase text-amber-400 tracking-wider">
                    👁️ Spectator Mode Active
                  </span>
                  <p className="text-xs text-slate-300 max-w-sm mx-auto">
                    You are currently spectating live ball draws and winner announcements. Since you did not purchase a ticket before countdown ended, you are not participating in this round. Get ready to select your card when the next countdown begins!
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Room Chat Drawer */}
      {chatOpen && (
        <div className="fixed inset-x-0 bottom-16 z-40 bg-slate-900/95 backdrop-blur-md border-t border-slate-800 p-4 rounded-t-3xl shadow-2xl max-h-80 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <h4 className="text-xs font-black text-slate-200">Room Live Chat</h4>
            <button onClick={() => setChatOpen(false)} className="text-slate-400 text-xs font-bold">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 max-h-48">
            {messages.map((m) => (
              <div key={m.id} className="text-xs bg-slate-950/80 rounded-xl p-2 border border-slate-800">
                <span className="font-bold text-amber-400">@{m.username}: </span>
                <span className="text-slate-200">{m.text}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Send a chat message..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && messageInput.trim()) {
                  onSendMessage(messageInput);
                  setMessageInput('');
                }
              }}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => {
                if (messageInput.trim()) {
                  onSendMessage(messageInput);
                  setMessageInput('');
                }
              }}
              className="p-2 rounded-xl bg-amber-500 text-slate-950 font-bold"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Winner Announcement Modal Overlay */}
      {(room.status === 'FINISHED' || (room.lastWinners && room.lastWinners.length > 0)) && showWinnerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-gradient-to-br from-slate-900 via-amber-950/70 to-slate-900 border-2 border-amber-500/60 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/20 border border-amber-500/50 text-amber-400 text-3xl shadow-lg shadow-amber-500/20 mx-auto animate-bounce">
              🏆
            </div>

            <div>
              <h3 className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">
                {room.lastWinners && room.lastWinners.length > 1 ? '🏆 Multiple Winners!' : '🏆 Winner Announcement'}
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                {room.lastWinners && room.lastWinners.length > 1
                  ? `Simultaneous Bingo on Ball #${room.currentBall || '?'}! Prize pool split equally.`
                  : `Game round completed in ${room.name}!`}
              </p>
            </div>

            {/* Winner Information Cards List */}
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {(room.lastWinners || []).map((w, idx) => (
                <div
                  key={w.id || `win-${idx}`}
                  className="bg-slate-950/90 border border-amber-500/40 rounded-2xl p-4 space-y-2 text-left relative"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2.5">
                      {w.photoUrl ? (
                        <img
                          src={w.photoUrl}
                          alt={w.username}
                          className="w-10 h-10 rounded-full object-cover border border-amber-400"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-400/50 flex items-center justify-center font-black text-amber-300 text-sm shrink-0">
                          {w.username.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-black text-white">@{w.username}</div>
                        <div className="text-[10px] text-slate-400 font-bold">
                          Card <span className="text-emerald-400 font-extrabold">#{formatCardNumber(w.cardNumber || 1)}</span> • Ticket: <span className="text-amber-300 font-bold">{w.ticketPrice || room.ticketPrice} Birr</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-slate-400 font-medium">Prize Won</div>
                      <div className="text-sm font-black text-emerald-400">
                        {w.prizeAmount.toLocaleString()} Birr
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-300 font-semibold pt-1">
                    <span>
                      Pattern: <strong className="text-amber-400 font-extrabold">{w.pattern}</strong>
                    </span>
                    {room.lastWinners && room.lastWinners.length > 1 && (
                      <span className="text-sky-400 text-[10px] bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full">
                        Equal Share Split
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {room.id.startsWith('grp_') || room.status === 'WAITING_HOST_DECISION' ? (
              <div className="space-y-3 pt-2">
                {isHost ? (
                  <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-3 text-center">
                    <div className="text-xs font-black text-amber-400 uppercase tracking-wider">
                      👑 Host Decision Required
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Choose whether to start a new game round with this group or close the group room.
                    </p>
                    <div className="grid grid-cols-2 gap-2.5 pt-1">
                      <button
                        onClick={() => onPlayAgain && onPlayAgain()}
                        className="py-3 px-3 rounded-xl bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                      >
                        🎮 Play Again
                      </button>
                      <button
                        onClick={() => onCloseGroup && onCloseGroup()}
                        className="py-3 px-3 rounded-xl bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-500 hover:to-red-600 text-white font-black text-xs shadow-lg shadow-rose-600/20 active:scale-95 transition"
                      >
                        🚪 Close Group
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3.5 text-center text-amber-300 font-extrabold text-xs flex flex-col items-center justify-center gap-1.5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                      <span>Waiting for the group host to decide next step...</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Group session will auto-close if host does not respond within 60s
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
                  <span>Next game round starting in: <strong className="text-amber-400 font-black text-sm">{activeCountdown}s</strong></span>
                </div>

                <button
                  onClick={() => {
                    setShowWinnerModal(false);
                    if (onReturnToCardSelection) {
                      onReturnToCardSelection();
                    }
                  }}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 transition active:scale-95"
                >
                  {language === 'am' ? 'ዝጋ እና ወደ ካርድ ምርጫ ተመለስ' : 'Close & Return to Card Selection'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
