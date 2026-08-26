import React from 'react';
import { Socket } from 'socket.io-client';
import { BingoRoom, BingoTicket, ChatMessage, UserProfile, WinningPattern, RoomStats } from '@shared/types';
import { triggerHaptic, triggerNotificationHaptic } from '../lib/telegramSDK';
import { audioEngine, getAmharicNumberText } from '../lib/audioEngine';
import { formatCardNumber, generateCardMatrixByNumber, getRemainingSeconds } from '@shared/bingoUtils';
import { apiUrl } from '@shared/apiConfig';
import { logger } from '@shared/logger';
import confetti from 'canvas-confetti';
import { MessageSquare, Send, Sparkles, Trophy, Volume2, CheckCircle2, AlertCircle, History, RefreshCw, ChevronDown, ChevronUp, Grid, Users } from 'lucide-react';

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
  socket?: Socket | null;
}

// 75-Number Drawn Bingo Board Grid Component
const BingoMasterBoard = React.memo<{ drawnBalls: number[]; currentBall: number | null; isOpen?: boolean; onToggle?: () => void }>(
  ({ drawnBalls, currentBall, isOpen = false, onToggle }) => {
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
        <div
          onClick={onToggle}
          className="flex items-center justify-between text-xs font-bold text-slate-300 border-b border-slate-800 pb-2 cursor-pointer select-none"
        >
          <span className="flex items-center gap-1.5 text-amber-400 font-black">
            <Sparkles className="w-4 h-4" />
            <span>Master 75-Number Board ({drawnSet.size}/75)</span>
          </span>
          <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="font-mono">{isOpen ? 'COLLAPSE' : 'EXPAND'}</span>
            {isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </div>
        </div>

        {/* Vertical B-I-N-G-O Columns Grid */}
        {isOpen && (
          <div className="grid grid-cols-5 gap-1 sm:gap-1.5 pt-1">
            {columns.map((col) => {
              const numbers = Array.from({ length: col.max - col.min + 1 }, (_, i) => col.min + i);
              return (
                <div key={col.label} className="flex flex-col gap-1 text-center">
                  {/* Column Header */}
                  <div
                    className={`w-full py-1 rounded-lg border font-black text-xs flex items-center justify-center shrink-0 shadow-sm ${col.color}`}
                  >
                    {col.label}
                  </div>
                  {/* Vertical Column Numbers */}
                  <div className="flex flex-col gap-0.5 sm:gap-1">
                    {numbers.map((num) => {
                      const isDrawn = drawnSet.has(num);
                      const isCurrent = currentBall === num;

                      return (
                        <div
                          key={num}
                          className={`w-full py-0.5 sm:py-1 rounded text-[9px] sm:text-xs font-mono font-bold flex items-center justify-center transition ${
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
        )}
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
  socket,
}) => {
  const [autoDaub, setAutoDaub] = React.useState<boolean>(true);
  const [chatOpen, setChatOpen] = React.useState<boolean>(false);
  const [messageInput, setMessageInput] = React.useState<string>('');
  const [localDaubed, setLocalDaubed] = React.useState<Record<string, boolean[][]>>({});
  const [nextDrawSeconds, setNextDrawSeconds] = React.useState<number>(3);
  const [liveRoomStats, setLiveRoomStats] = React.useState<{
    prizePool?: number;
    ticketsSold?: number;
    activePlayersCount?: number;
  } | null>(null);
  const [showWinnerModal, setShowWinnerModal] = React.useState<boolean>(true);
  const [liveTickets, setLiveTickets] = React.useState<BingoTicket[]>(tickets || []);
  const [isRefreshing, setIsRefreshing] = React.useState<boolean>(false);
  const [selectedCardIndex, setSelectedCardIndex] = React.useState<number>(0);
  const [showMasterBoard, setShowMasterBoard] = React.useState<boolean>(false);
  const isRefreshingRef = React.useRef<boolean>(false);

  const handleRefreshGame = React.useCallback(async () => {
    if (isRefreshingRef.current || !room?.id) return;
    try {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      triggerHaptic('light');

      const res = await fetch(apiUrl(`/api/bingo/room-status/${room.id}?userId=${user?.id}`));
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
              data.myTickets
                .filter((t: BingoTicket) => !room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
                .forEach((t: BingoTicket) => ticketMap.set(t.id, t));
              return Array.from(ticketMap.values());
            });
          }
        }
      }
    } catch (err) {
      logger.debug('Manual game refresh note:', err);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [room?.id, room?.gameReferenceId, user?.id]);

  // Auto-return to card selection when room resets to WAITING or COUNTDOWN for the next round
  React.useEffect(() => {
    if ((room.status === 'WAITING' || room.status === 'COUNTDOWN') && onReturnToCardSelection) {
      onReturnToCardSelection();
    }
  }, [room.status, room.gameReferenceId, onReturnToCardSelection]);

  // Sync prop changes without wiping out accumulated tickets
  React.useEffect(() => {
    if (tickets) {
      setLiveTickets(tickets.filter((t) => !room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId));
    }
  }, [tickets, room.gameReferenceId]);

  // Server-authoritative REST status fetch on mount & reconnect
  React.useEffect(() => {
    if (!room?.id || !user?.id) return;
    let isMounted = true;

    fetch(apiUrl(`/api/bingo/room-status/${room.id}?userId=${user.id}`))
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (isMounted && data && data.success && Array.isArray(data.myTickets)) {
          const currentRoundTickets = data.myTickets.filter(
            (t: BingoTicket) => !room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId
          );
          setLiveTickets(currentRoundTickets);
        }
      })
      .catch((err) => logger.debug('Initial status fetch notice:', err));

    return () => {
      isMounted = false;
    };
  }, [room?.id, user?.id, room?.gameReferenceId]);

  // Real-time Socket.IO synchronization for active gameplay (room stats, tickets, updates)
  React.useEffect(() => {
    if (!socket || !room?.id) return;

    socket.emit('room:join', { roomId: room.id, userId: user?.id });

    const handleRoomSnapshot = (data: {
      room?: BingoRoom;
      tickets?: BingoTicket[];
      reservations?: Record<number, any>;
    }) => {
      if (data && data.tickets && Array.isArray(data.tickets)) {
        const activeTkts = data.tickets.filter(
          (t) =>
            t.roomId === room.id &&
            t.status === 'ACTIVE' &&
            (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
        );
        if (activeTkts.length > 0) {
          setLiveTickets(activeTkts);
        }
      }
      if (data && data.room && data.room.id === room.id) {
        setLiveRoomStats({
          prizePool: data.room.prizePool,
          ticketsSold: data.room.ticketsSold,
          activePlayersCount: data.room.activePlayersCount,
        });
      }
    };

    const handleTicketBought = (data: { tickets: BingoTicket[] }) => {
      if (data && data.tickets && Array.isArray(data.tickets)) {
        const roomTkts = data.tickets.filter(
          (t) =>
            t.roomId === room.id &&
            t.status === 'ACTIVE' &&
            (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId)
        );
        if (roomTkts.length > 0) {
          setLiveTickets((prev) => {
            const ticketMap = new Map<string, BingoTicket>();
            prev.forEach((t) => ticketMap.set(t.id, t));
            roomTkts.forEach((t) => ticketMap.set(t.id, t));
            return Array.from(ticketMap.values());
          });
        }
      }
    };

    const handleStatsUpdated = (data: {
      roomId?: string;
      groupId?: string;
      prizePool?: number;
      ticketsSold?: number;
      activePlayersCount?: number;
    }) => {
      const targetId = data.roomId || data.groupId;
      if (targetId === room.id) {
        setLiveRoomStats((prev) => ({
          prizePool: typeof data.prizePool === 'number' ? data.prizePool : prev?.prizePool,
          ticketsSold: typeof data.ticketsSold === 'number' ? data.ticketsSold : prev?.ticketsSold,
          activePlayersCount:
            typeof data.activePlayersCount === 'number' ? data.activePlayersCount : prev?.activePlayersCount,
        }));
      }
    };

    const handleRoomUpdated = (data: { room?: BingoRoom }) => {
      if (data && data.room && data.room.id === room.id) {
        setLiveRoomStats({
          prizePool: data.room.prizePool,
          ticketsSold: data.room.ticketsSold,
          activePlayersCount: data.room.activePlayersCount,
        });
      }
    };

    socket.on('room:snapshot', handleRoomSnapshot);
    socket.on('ticket:bought', handleTicketBought);
    socket.on('room:stats_updated', handleStatsUpdated);
    socket.on('private_group:stats_updated', handleStatsUpdated);
    socket.on('room:updated', handleRoomUpdated);

    return () => {
      socket.off('room:snapshot', handleRoomSnapshot);
      socket.off('ticket:bought', handleTicketBought);
      socket.off('room:stats_updated', handleStatsUpdated);
      socket.off('private_group:stats_updated', handleStatsUpdated);
      socket.off('room:updated', handleRoomUpdated);
    };
  }, [socket, room?.id, user?.id, room?.gameReferenceId]);

  // Auto-reset modal state when a new game round starts
  React.useEffect(() => {
    if (room.status === 'PLAYING' || room.status === 'WAITING' || room.status === 'COUNTDOWN') {
      setShowWinnerModal(true);
    }
  }, [room.status]);

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

      {/* Live Current Ball Callout / Winner Results Screen */}
      {room.status === 'FINISHED' ? (
        <div className="bg-gradient-to-br from-amber-950/80 via-slate-900 to-amber-950/80 border-2 border-amber-500 rounded-3xl p-4 sm:p-6 text-center shadow-2xl relative overflow-hidden space-y-4 animate-fade-in w-full">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-64 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 space-y-3.5">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-amber-500/20 border-2 border-amber-400 text-amber-400 flex items-center justify-center mx-auto text-2xl sm:text-3xl font-black shadow-lg shadow-amber-500/20 animate-bounce">
              🏆
            </div>
            <h3 className="text-lg sm:text-xl font-black text-amber-400 tracking-tight">
              {language === 'am' ? '🎉 የዙሩ አሸናፊዎች (GAME FINISHED)!' : '🎉 ROUND WINNERS ANNOUNCEMENT!'}
            </h3>
            
            {/* Game Reference Badge & Payout Notice */}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {room.gameReferenceId && (
                <div className="inline-flex items-center gap-1 bg-slate-950/90 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-mono font-bold text-amber-300 shadow-sm">
                  <span>Ref:</span>
                  <span className="text-white">{room.gameReferenceId}</span>
                </div>
              )}
              <div className="inline-flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/40 px-3 py-1 rounded-full text-[11px] font-bold text-emerald-300 shadow-sm">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>{language === 'am' ? 'ሽልማቱ ወደ ቦርሳ ገብቷል' : 'Winnings Credited to Wallet'}</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
              {language === 'am'
                ? 'እንኳን ደስ አለዎት! የዚህ ዙር አሸናፊዎች ተለይተዋል፡'
                : 'Congratulations to the winners of this round! Winnings have been credited directly to their wallets.'}
            </p>

            {room.lastWinners && room.lastWinners.length > 0 ? (
              <div className="space-y-3 max-w-md mx-auto pt-1 w-full">
                {room.lastWinners.map((winner, idx) => {
                  const formattedCardNum = winner.cardNumber ? formatCardNumber(winner.cardNumber) : '—';
                  const winnerMatrix = winner.cardNumber ? generateCardMatrixByNumber(winner.cardNumber) : null;

                  return (
                    <div
                      key={winner.id || `win-${idx}`}
                      className="bg-slate-950/95 border border-amber-500/50 rounded-2xl p-3.5 sm:p-4 text-left shadow-xl space-y-3"
                    >
                      {/* Top Row: User & Prize Amount */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-800/80 pb-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {winner.photoUrl ? (
                            <img
                              src={winner.photoUrl}
                              alt={winner.username}
                              className="w-10 h-10 rounded-full object-cover border-2 border-amber-400 shrink-0"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-black flex items-center justify-center text-sm border-2 border-amber-400 shrink-0">
                              {winner.username.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-sm font-black text-white flex items-center gap-1.5 truncate">
                              <span>@{winner.username}</span>
                            </div>
                            <div className="text-[10px] text-emerald-400 font-bold flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                              <span>Verified Bingo Winner</span>
                            </div>
                          </div>
                        </div>

                        {/* Prize Amount Box */}
                        <div className="flex sm:flex-col items-center sm:items-end justify-between bg-slate-900/80 sm:bg-transparent px-3 py-1.5 sm:p-0 rounded-xl border sm:border-0 border-slate-800">
                          <span className="text-[10px] text-slate-400 block font-semibold">Prize Won</span>
                          <span className="text-base sm:text-lg font-black text-emerald-400">
                            +{(winner.prizeAmount || 0).toLocaleString()} Birr
                          </span>
                        </div>
                      </div>

                      {/* Details Strip */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/60">
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Card:</span>
                          <span className="font-mono font-black text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-500/20">
                            #{formattedCardNum}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Pattern:</span>
                          <span className="font-bold text-amber-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                            {winner.pattern}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-slate-400 text-[11px]">Stake:</span>
                          <span className="font-bold text-slate-200">
                            {winner.ticketPrice || room.ticketPrice} Birr
                          </span>
                        </div>
                      </div>

                      {/* Optional Winner 5x5 Winning Card Preview */}
                      {winnerMatrix && (
                        <div className="bg-slate-900/40 p-2 rounded-xl border border-slate-800/40 space-y-1">
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider text-center">
                            Winning Card #{formattedCardNum} Layout
                          </div>
                          <div className="grid grid-cols-5 gap-1 text-center text-[8px] font-black font-mono max-w-[200px] mx-auto">
                            {['B', 'I', 'N', 'G', 'O'].map((l, i) => (
                              <div key={i} className="text-amber-400 font-sans text-[8px] font-bold py-0.5">
                                {l}
                              </div>
                            ))}
                            {winnerMatrix.map((row, rIdx) =>
                              row.map((cell, cIdx) => (
                                <div
                                  key={`${rIdx}-${cIdx}`}
                                  className={`p-0.5 rounded text-[8px] aspect-square flex items-center justify-center ${
                                    cell === 'FREE'
                                      ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black'
                                      : 'bg-slate-950 text-slate-300 border border-slate-800'
                                  }`}
                                >
                                  {cell === 'FREE' ? '★' : cell}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-400">
                No winners claimed in this round. Prize carried over to next game!
              </div>
            )}

            {room.id.startsWith('grp_') || room.id.startsWith('private_') ? (
              <div className="pt-3 space-y-2 max-w-sm mx-auto">
                <button
                  onClick={() => onReturnToCardSelection && onReturnToCardSelection()}
                  className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 text-slate-950 font-black text-xs sm:text-sm shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 transition active:scale-95 cursor-pointer"
                >
                  <Users className="w-4 h-4" />
                  <span>{language === 'am' ? 'ወደ ግሩፕ ሎቢ ተመለስ' : 'Return to Private Group Lobby'}</span>
                </button>
              </div>
            ) : (
              <div className="pt-2 text-[11px] text-amber-300 font-extrabold animate-pulse">
                ⏱ Next Game Round Starting Shortly ({activeCountdown}s)...
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Responsive Main Game Layout (Mobile-first prioritized order) */
        <div className="space-y-4 max-w-2xl mx-auto w-full">
          {/* PRIORITY 1 & 2: Status & Countdown / Live Draw Stage */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-950 to-slate-900 border border-slate-800 rounded-3xl p-4 text-center shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-48 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10 space-y-3">
              {/* Game Status Badge */}
              <div className="flex items-center justify-between text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${room.status === 'PLAYING' ? 'bg-red-500 animate-ping' : 'bg-amber-400'}`} />
                  <span>{room.status === 'PLAYING' ? '⚡ LIVE BALL DRAW' : '⏳ GAME COUNTDOWN'}</span>
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-400/10 border border-amber-400/30 text-amber-300 font-bold font-mono">
                  {room.status === 'PLAYING'
                    ? `Next in ${nextDrawSeconds}s`
                    : `Starts in ${activeCountdown}s`}
                </span>
              </div>

              {/* PRIORITY 3: Current Bingo Ball */}
              {room.currentBall ? (
                <div className="flex flex-col items-center justify-center gap-2.5 py-1">
                  <div
                    className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-tr ${getBallColor(
                      room.currentBall
                    )} shadow-2xl shadow-amber-500/10 flex flex-col items-center justify-center text-white border-4 border-slate-900 animate-bounce`}
                  >
                    <span className="text-xs sm:text-sm font-black opacity-90 leading-none">
                      {getBallLetter(room.currentBall)}
                    </span>
                    <span className="text-3xl sm:text-4xl font-black leading-none mt-0.5">{room.currentBall}</span>
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

                    <div className="w-32 sm:w-40 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80">
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
                  <div className="text-2xl sm:text-3xl font-black text-amber-400 font-mono">
                    00:{activeCountdown.toString().padStart(2, '0')}
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Waiting for players & game start...</span>
                </div>
              )}

              {/* PRIORITY 4: Contained Drawn Balls History Feed */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 px-1">
                  <span className="flex items-center gap-1 text-amber-400">
                    <History className="w-3.5 h-3.5" />
                    <span>Drawn Balls History ({room.drawnBalls.length}/75)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowMasterBoard((prev) => !prev)}
                    className="text-amber-400 hover:text-amber-300 font-extrabold text-[10px] flex items-center gap-1 bg-slate-800/80 px-2 py-0.5 rounded-lg border border-slate-700/60"
                  >
                    <span>{showMasterBoard ? 'Hide Board' : 'Show 75 Board'}</span>
                    {showMasterBoard ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>

                {/* Horizontal scrollable chips for drawn balls */}
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 px-0.5 no-scrollbar min-h-[36px]">
                  {room.drawnBalls.length === 0 ? (
                    <span className="text-[11px] text-slate-500 italic py-1 w-full text-center">No balls drawn yet...</span>
                  ) : (
                    [...room.drawnBalls].reverse().map((b, idx) => {
                      const letter = getBallLetter(b);
                      const colorClass = getBallColor(b);
                      const isLatest = idx === 0;

                      return (
                        <div
                          key={`${b}-${idx}`}
                          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs font-black shrink-0 transition ${
                            isLatest
                              ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-md ring-2 ring-amber-400/40'
                              : 'bg-slate-950 text-slate-200 border-slate-800'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded-full bg-gradient-to-tr ${colorClass} text-white text-[9px] flex items-center justify-center font-black`}
                          >
                            {letter}
                          </span>
                          <span className="font-mono text-xs font-black">{b}</span>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Collapsible 75 Master Board */}
                {showMasterBoard && (
                  <div className="pt-2">
                    <BingoMasterBoard
                      drawnBalls={room.drawnBalls}
                      currentBall={room.currentBall}
                      isOpen={showMasterBoard}
                      onToggle={() => setShowMasterBoard(false)}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PRIORITY 5, 6 & 7: User Purchased Bingo Cards & Claim Button */}
          {liveTickets.length > 0 ? (
            <div className="space-y-3">
              {/* PRIORITY 6: Multi-Card Selection Switcher Tabs (when player has >1 card) */}
              {liveTickets.length > 1 && (
                <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  {liveTickets.map((t, idx) => {
                    const isCardReady = checkReadyForBingo(t);
                    const isSelected = selectedCardIndex === idx;
                    const cardNum = t.cardNumber ? formatCardNumber(t.cardNumber) : `#${t.id.slice(-3)}`;

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedCardIndex(idx);
                          triggerHaptic('light');
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-black transition shrink-0 min-h-[40px] ${
                          isSelected
                            ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                            : 'bg-slate-950 text-slate-300 hover:text-white border border-slate-800'
                        }`}
                      >
                        <span>Card {cardNum}</span>
                        {isCardReady && (
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* PRIORITY 5: Active Selected Card Full View */}
              {(() => {
                const currentTicket = liveTickets[selectedCardIndex] || liveTickets[0];
                if (!currentTicket) return null;
                const isReady = checkReadyForBingo(currentTicket);
                const cardDisplayNumber = currentTicket.cardNumber ? formatCardNumber(currentTicket.cardNumber) : `#${currentTicket.id.slice(-3)}`;

                return (
                  <div
                    key={currentTicket.id}
                    className={`bg-slate-900 border ${
                      isReady ? 'border-emerald-500/80 shadow-emerald-500/20 ring-1 ring-emerald-500/40' : 'border-slate-800'
                    } rounded-3xl p-3.5 sm:p-5 space-y-3.5 shadow-xl relative transition w-full`}
                  >
                    {/* Ticket Header */}
                    <div className="flex items-center justify-between text-xs border-b border-slate-800 pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-emerald-400 text-sm sm:text-base">
                          Card {cardDisplayNumber}
                        </span>
                        {(currentTicket.gameReferenceId || room.gameReferenceId) && (
                          <span className="text-[10px] font-mono text-slate-400 bg-slate-950 px-2 py-0.5 rounded-lg border border-slate-800">
                            {currentTicket.gameReferenceId || room.gameReferenceId}
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1 rounded-full border border-amber-500/20">
                        {room.winningPatterns.join(', ')}
                      </span>
                    </div>

                    {/* 5x5 Bingo Matrix Grid - Optimized for Mobile Finger Touches */}
                    <div className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center w-full">
                      {['B', 'I', 'N', 'G', 'O'].map((letter, lIdx) => (
                        <div
                          key={lIdx}
                          className="text-xs sm:text-sm font-black text-amber-400 py-1 sm:py-1.5 bg-slate-950 rounded-xl border border-slate-800 shadow-inner"
                        >
                          {letter}
                        </div>
                      ))}

                      {currentTicket.matrix.map((row, rIdx) =>
                        row.map((cell, cIdx) => {
                          const marked = isCellMarked(currentTicket.id, rIdx, cIdx, cell);

                          return (
                            <button
                              key={`${rIdx}-${cIdx}`}
                              type="button"
                              onClick={() => handleCellClick(currentTicket.id, rIdx, cIdx)}
                              className={`w-full aspect-square rounded-xl sm:rounded-2xl text-xs sm:text-base font-black flex items-center justify-center transition border min-w-0 min-h-[38px] sm:min-h-[44px] active:scale-95 touch-manipulation ${
                                cell === 'FREE'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-black shadow-inner text-sm sm:text-lg'
                                  : marked
                                  ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-slate-950 border-emerald-300 shadow-md shadow-emerald-500/30 font-black'
                                  : 'bg-slate-950 text-slate-200 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              {cell === 'FREE' ? '★' : cell}
                            </button>
                          );
                        })
                      )}
                    </div>

                    {/* PRIORITY 7: BINGO CLAIM BUTTON */}
                    <button
                      type="button"
                      onClick={() => handleClaim(currentTicket.id)}
                      disabled={!isReady || currentTicket.status === 'BINGO_CLAIMED'}
                      className={`w-full py-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-2 transition shadow-xl ${
                        isReady && currentTicket.status !== 'BINGO_CLAIMED'
                          ? 'bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-500 text-slate-950 shadow-emerald-500/30 animate-pulse hover:brightness-110 cursor-pointer active:scale-95'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                      }`}
                    >
                      <Sparkles className="w-5 h-5" />
                      <span>
                        {currentTicket.status === 'BINGO_CLAIMED'
                          ? '✅ BINGO CLAIMED!'
                          : isReady
                          ? '🎉 CLAIM BINGO NOW!'
                          : 'Complete Pattern to Claim Bingo'}
                      </span>
                    </button>
                  </div>
                );
              })()}
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
                {room.lastWinners && room.lastWinners.length > 1
                  ? '🏆 Multiple Winners!'
                  : room.lastWinners && room.lastWinners.length === 1
                  ? '🏆 Winner Announcement'
                  : '🏁 Round Completed'}
              </h3>
              <p className="text-xs text-slate-300 mt-1">
                {room.lastWinners && room.lastWinners.length > 1
                  ? `Simultaneous Bingo on Ball #${room.currentBall || '?'}! Prize pool split equally.`
                  : room.lastWinners && room.lastWinners.length === 1
                  ? `Game round completed in ${room.name}!`
                  : `Round finished with no winning cards in ${room.name}.`}
              </p>
            </div>

            {/* Winner Information Cards List */}
            {room.lastWinners && room.lastWinners.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {room.lastWinners.map((w, idx) => (
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
            ) : (
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-center text-slate-400 text-xs font-semibold">
                No winning claims registered for this round.
              </div>
            )}

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
