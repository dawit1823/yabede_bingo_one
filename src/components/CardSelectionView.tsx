import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Socket } from 'socket.io-client';
import { motion, AnimatePresence } from 'motion/react';
import { BingoRoom, UserProfile, CardReservation, BingoTicket } from '../types';
import { formatCardNumber, generateCardMatrixByNumber, getRemainingSeconds } from '../lib/bingoUtils';
import { triggerHaptic, triggerNotificationHaptic } from '../lib/telegramSDK';
import { audioEngine } from '../lib/audioEngine';
import { apiUrl } from '../lib/apiConfig';
import { logger } from '../lib/logger';
import {
  ArrowLeft,
  Search,
  Sparkles,
  AlertCircle,
  Trophy,
  Grid,
  RefreshCw,
  X,
  CheckCircle2,
} from 'lucide-react';

interface CardSelectionViewProps {
  room: BingoRoom;
  user: UserProfile;
  onBack: () => void;
  onCardPurchased: (ticket: BingoTicket) => void;
  onCardDeselected?: (cardNumber: number) => void;
  onEnterGame?: () => void;
  language: 'en' | 'am';
  socket?: Socket | null;
}

const ALL_CARD_NUMBERS = Array.from({ length: 400 }, (_, i) => i + 1);

interface CardItemProps {
  num: number;
  reservation?: CardReservation;
  currentUserId: string;
  isSalesClosed: boolean;
  isToggling: boolean;
  isOptimisticSelected?: boolean;
  onToggle: (num: number) => void;
}

// Memoized Card Item to optimize performance across 400 grid cards
const CardItem = React.memo<CardItemProps>(
  ({
    num,
    reservation,
    currentUserId,
    isSalesClosed,
    isToggling,
    isOptimisticSelected,
    onToggle,
  }) => {
    const isPurchasedByMe = reservation?.status === 'SOLD' && reservation?.userId === currentUserId;
    const isReservedByMe =
      (reservation?.status === 'RESERVED' && reservation?.userId === currentUserId) ||
      Boolean(isOptimisticSelected);
    const isPurchasedByOther = reservation?.status === 'SOLD' && reservation?.userId !== currentUserId;
    const isReservedByOther =
      reservation?.status === 'RESERVED' && reservation?.userId !== currentUserId && !isOptimisticSelected;
    const isDisabled = isPurchasedByOther || isReservedByOther || isToggling;

    return (
      <button
        disabled={isDisabled}
        onClick={() => onToggle(num)}
        className={`py-3 px-2 rounded-2xl border text-center transition flex flex-col items-center justify-center gap-0.5 relative active:scale-95 touch-manipulation min-h-[52px] cursor-pointer ${
          isPurchasedByMe
            ? 'bg-emerald-600 text-white border-emerald-300 shadow-lg font-black ring-2 ring-emerald-400 hover:bg-emerald-700'
            : isReservedByMe
            ? 'bg-emerald-500 text-white border-emerald-300 shadow-md font-black ring-2 ring-emerald-300 hover:bg-emerald-600 animate-pulse'
            : isPurchasedByOther
            ? 'bg-red-600/90 text-white border-red-700 font-bold opacity-90 cursor-not-allowed shadow-sm'
            : isReservedByOther
            ? 'bg-amber-500 text-slate-950 border-amber-600 font-bold opacity-90 cursor-not-allowed shadow-sm'
            : 'bg-white text-slate-900 border-slate-300 hover:bg-emerald-50 font-extrabold shadow-sm'
        }`}
      >
        <span className="text-xs font-black tracking-tight">{formatCardNumber(num)}</span>
        <span
          className={`text-[8px] font-black px-1.5 py-0.2 rounded-full uppercase tracking-tighter ${
            isPurchasedByMe
              ? 'bg-emerald-950/80 text-emerald-100 border border-emerald-300'
              : isReservedByMe
              ? 'bg-emerald-950/80 text-emerald-100 border border-emerald-300'
              : isPurchasedByOther
              ? 'bg-red-950/80 text-red-100 border border-red-400'
              : isReservedByOther
              ? 'bg-amber-950/80 text-amber-100 border border-amber-400'
              : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
          }`}
        >
          {isPurchasedByMe
            ? 'CONFIRMED'
            : isReservedByMe
            ? 'SELECTED'
            : isPurchasedByOther
            ? 'SOLD'
            : isReservedByOther
            ? 'HOLD'
            : 'AVAILABLE'}
        </span>
        {isPurchasedByOther && reservation?.username && (
          <span className="text-[8px] text-slate-200 font-mono truncate max-w-full">
            @{reservation.username}
          </span>
        )}
      </button>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.num === nextProps.num &&
      prevProps.currentUserId === nextProps.currentUserId &&
      prevProps.isSalesClosed === nextProps.isSalesClosed &&
      prevProps.isToggling === nextProps.isToggling &&
      prevProps.isOptimisticSelected === nextProps.isOptimisticSelected &&
      prevProps.onToggle === nextProps.onToggle &&
      prevProps.reservation?.status === nextProps.reservation?.status &&
      prevProps.reservation?.userId === nextProps.reservation?.userId &&
      prevProps.reservation?.username === nextProps.reservation?.username &&
      prevProps.reservation?.purchasedAt === nextProps.reservation?.purchasedAt
    );
  }
);

interface BingoCardGridProps {
  filteredCards: number[];
  reservations: Record<number, CardReservation>;
  optimisticSelections: Set<number>;
  currentUserId: string;
  isSalesClosed: boolean;
  togglingCard: number | null;
  onToggleCard: (num: number) => void;
}

// Dedicated Memoized Grid Component for 400 Bingo Cards
const BingoCardGrid = React.memo<BingoCardGridProps>(
  ({
    filteredCards,
    reservations,
    optimisticSelections,
    currentUserId,
    isSalesClosed,
    togglingCard,
    onToggleCard,
  }) => {
    return (
      <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2.5 max-h-[calc(100vh-280px)] sm:max-h-[calc(100vh-320px)] min-h-[300px] overflow-y-auto pr-1 pb-32 sm:pb-36 scroll-smooth">
        {filteredCards.map((num) => {
          const res = reservations[num];
          const isOptimistic = optimisticSelections.has(num);
          return (
            <CardItem
              key={num}
              num={num}
              reservation={res}
              currentUserId={currentUserId}
              isSalesClosed={isSalesClosed}
              isToggling={togglingCard === num}
              isOptimisticSelected={isOptimistic}
              onToggle={onToggleCard}
            />
          );
        })}
      </div>
    );
  }
);

// Selected Card Compact Preview Item for horizontal scrollable selection strip
const SelectedCardPreviewItem = React.memo<{
  cardNumber: number;
  status: 'SOLD' | 'RESERVED' | 'OPTIMISTIC';
  ticketPrice: number;
  onDeselect: (num: number) => void;
  isToggling: boolean;
  language: 'en' | 'am';
}>(({ cardNumber, status, ticketPrice, onDeselect, isToggling, language }) => {
  const matrix = useMemo(() => generateCardMatrixByNumber(cardNumber), [cardNumber]);

  const isConfirmed = status === 'SOLD';
  const isOptimistic = status === 'OPTIMISTIC';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.8, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: 15 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`border-2 rounded-2xl p-2.5 min-w-[150px] max-w-[160px] shrink-0 snap-center shadow-xl flex flex-col justify-between gap-1.5 relative transition-colors ${
        isConfirmed
          ? 'bg-slate-900 border-emerald-500 shadow-emerald-950/40'
          : isOptimistic
          ? 'bg-slate-900 border-amber-400 animate-pulse'
          : 'bg-slate-900 border-emerald-400/80'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between gap-1 border-b border-slate-800 pb-1">
        <div className="flex flex-col">
          <span className="text-[11px] font-black text-emerald-400 leading-tight">
            Card {formatCardNumber(cardNumber)}
          </span>
          <span className="text-[9px] font-bold text-amber-300 font-mono">
            {ticketPrice} Birr
          </span>
        </div>

        <button
          disabled={isToggling}
          onClick={(e) => {
            e.stopPropagation();
            onDeselect(cardNumber);
          }}
          className="p-1 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/40 border border-red-500/30 transition text-[10px] font-bold shrink-0 active:scale-95 disabled:opacity-50 cursor-pointer"
          title="Deselect Card"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Selection Status Badge */}
      <div className="flex items-center justify-between text-[8px] font-black uppercase">
        <span
          className={`px-1.5 py-0.5 rounded-full flex items-center gap-1 border ${
            isConfirmed
              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
              : isOptimistic
              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
              : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
          }`}
        >
          {isConfirmed ? (
            <>
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
              <span>{language === 'am' ? 'የተረጋገጠ' : 'CONFIRMED'}</span>
            </>
          ) : isOptimistic ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping inline-block" />
              <span>{language === 'am' ? 'በመምረጥ ላይ...' : 'SELECTING...'}</span>
            </>
          ) : (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
              <span>{language === 'am' ? 'የተመረጠ' : 'SELECTED'}</span>
            </>
          )}
        </span>
      </div>

      {/* Mini 5x5 Grid Preview */}
      <div className="grid grid-cols-5 gap-0.5 text-center text-[7px] font-mono font-black">
        {['B', 'I', 'N', 'G', 'O'].map((l, idx) => (
          <div key={idx} className="text-amber-400 font-sans text-[7px] font-black">
            {l}
          </div>
        ))}
        {matrix.map((row, rIdx) =>
          row.map((cell, cIdx) => (
            <div
              key={`${rIdx}-${cIdx}`}
              className={`p-0.5 rounded text-[7px] ${
                cell === 'FREE'
                  ? 'bg-amber-500/30 text-amber-300 border border-amber-500/40 font-black'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {cell === 'FREE' ? '★' : cell}
            </div>
          ))
        )}
      </div>
    </motion.div>
  );
});

export interface SelectedCardData {
  cardNumber: number;
  status: 'SOLD' | 'RESERVED' | 'OPTIMISTIC';
  time: number;
}

interface SelectedCardsPanelProps {
  mySelectedCards: SelectedCardData[];
  liveRoom: BingoRoom;
  togglingCard: number | null;
  language: 'en' | 'am';
  onDeselectCard: (num: number) => void;
  onEnterGame?: () => void;
  onBack: () => void;
  horizontalScrollRef: React.RefObject<HTMLDivElement | null>;
}

export const SelectedCardsPanel: React.FC<SelectedCardsPanelProps> = React.memo(({
  mySelectedCards,
  liveRoom,
  togglingCard,
  language,
  onDeselectCard,
  onEnterGame,
  onBack,
  horizontalScrollRef,
}) => {
  const totalPrice = mySelectedCards.length * (liveRoom.ticketPrice || 0);

  if (mySelectedCards.length === 0) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-950/90 backdrop-blur-md border-t border-slate-800 p-3 pb-safe shadow-lg">
        <div className="max-w-3xl mx-auto flex items-center justify-between gap-3 text-xs text-slate-400 px-1">
          <div className="flex items-center gap-2">
            <Grid className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="font-semibold text-slate-300 text-[11px] sm:text-xs">
              {language === 'am'
                ? 'ምንም ካርድ አልተመረጠም • ለመምረጥ ከላይ ያሉትን ካርዶች ይንኩ'
                : 'No cards selected • Tap any available card above to select'}
            </span>
          </div>
          <span className="text-[10px] text-amber-400 font-bold bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 rounded-lg shrink-0">
            {liveRoom.ticketPrice || 0} Birr / Card
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t-2 border-emerald-500/50 p-3 sm:p-4 pb-safe shadow-[0_-12px_40px_rgba(0,0,0,0.85)]">
      <div className="max-w-3xl mx-auto space-y-2.5">
        {/* Header */}
        <div className="flex items-center justify-between text-xs font-black text-slate-200 px-1">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
              <Trophy className="w-3.5 h-3.5" />
            </div>
            <div>
              <span className="text-emerald-400 font-black text-xs sm:text-sm">
                {language === 'am' ? 'የተመረጡ ካርዶች' : 'Selected Cards'} ({mySelectedCards.length})
              </span>
              <span className="text-[10px] text-slate-400 block font-normal">
                {totalPrice} Birr Total
              </span>
            </div>
          </div>

          <span className="text-[10px] text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-full font-bold">
            {language === 'am' ? 'ለማስወገድ X ይጫኑ' : 'Tap X to deselect'}
          </span>
        </div>

        {/* Horizontal Scrollable Selected Cards List with Motion Animations */}
        <div
          ref={horizontalScrollRef}
          className="flex gap-2.5 overflow-x-auto pb-1.5 pt-0.5 px-0.5 snap-x snap-mandatory touch-pan-x scroll-smooth no-scrollbar"
        >
          <AnimatePresence mode="popLayout">
            {mySelectedCards.map((card) => (
              <SelectedCardPreviewItem
                key={card.cardNumber}
                cardNumber={card.cardNumber}
                status={card.status}
                ticketPrice={liveRoom.ticketPrice || 0}
                onDeselect={onDeselectCard}
                isToggling={togglingCard === card.cardNumber}
                language={language}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Enter Game Arena / Confirm Button */}
        <button
          onClick={() => {
            if (onEnterGame) {
              onEnterGame();
            } else {
              onBack();
            }
          }}
          className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 text-white font-black text-xs sm:text-sm shadow-2xl border border-emerald-300 flex items-center justify-between hover:brightness-110 active:scale-[0.98] transition cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
            <span>
              {language === 'am'
                ? `${mySelectedCards.length} ካርድ ${mySelectedCards.length > 1 ? 'ዎች' : ''} ተመርጠዋል • ወደ ጨዋታው ግባ`
                : `${mySelectedCards.length} Card${mySelectedCards.length > 1 ? 's' : ''} Selected • Enter Game Arena`}
            </span>
          </div>
          <div className="flex items-center gap-1.5 bg-slate-950/40 px-3 py-1 rounded-xl text-amber-300 text-xs font-black border border-amber-400/30">
            <span>{language === 'am' ? 'ጀምር' : 'JOIN'}</span>
            <ArrowLeft className="w-4 h-4 rotate-180" />
          </div>
        </button>
      </div>
    </div>
  );
});

export const CardSelectionView: React.FC<CardSelectionViewProps> = ({
  room,
  user,
  onBack,
  onCardPurchased,
  onCardDeselected,
  onEnterGame,
  language,
  socket,
}) => {
  const [liveRoom, setLiveRoom] = useState<BingoRoom>(room);
  const [reservations, setReservations] = useState<Record<number, CardReservation>>({});
  const [optimisticSelections, setOptimisticSelections] = useState<Set<number>>(new Set());
  const [selectionTimes, setSelectionTimes] = useState<Record<number, number>>({});
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterMode, setFilterMode] = useState<'all' | 'available' | 'sold'>('all');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [togglingCard, setTogglingCard] = useState<number | null>(null);

  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const prevSelectedCountRef = useRef<number>(0);

  // Sync props room to local liveRoom
  useEffect(() => {
    setLiveRoom(room);
  }, [room]);

  // Reset all local selections and reservations whenever gameReferenceId or roomId changes
  useEffect(() => {
    setReservations({});
    setOptimisticSelections(new Set());
    setSelectionTimes({});
    setErrorMessage(null);
  }, [room.id, liveRoom.gameReferenceId]);

  // Socket.IO Real-Time Listener for Zero-Latency Card & Room Updates
  useEffect(() => {
    if (!socket) return;

    socket.emit('room:join', { roomId: room.id, userId: user.id });

    const handleCardUpdated = (data: {
      roomId: string;
      cardNumber?: number;
      reservation?: CardReservation | null;
      reservations?: Record<number, CardReservation>;
      action?: string;
      room?: BingoRoom;
    }) => {
      if (data.roomId !== room.id) return;

      if (data.action === 'RESET_ALL') {
        setReservations({});
        setOptimisticSelections(new Set());
        setSelectionTimes({});
        if (data.room) {
          setLiveRoom(data.room);
        }
        return;
      }

      if (data.cardNumber !== undefined) {
        setReservations((prev) => {
          const next = { ...prev };
          if (!data.reservation || data.action === 'DESELECTED' || data.action === 'CANCELLED' || data.action === 'EXPIRED') {
            delete next[data.cardNumber!];
          } else {
            next[data.cardNumber!] = data.reservation;
          }
          return next;
        });

        // Clear optimistic selection if server synced it
        setOptimisticSelections((prev) => {
          if (prev.has(data.cardNumber!)) {
            const next = new Set(prev);
            next.delete(data.cardNumber!);
            return next;
          }
          return prev;
        });
      }

      if (data.room) {
        setLiveRoom(data.room);
      }
    };

    const handleRoomSnapshot = (data: {
      room?: BingoRoom;
      reservations?: Record<number, CardReservation>;
    }) => {
      if (data.reservations) {
        setReservations(data.reservations);
      }
      if (data.room) {
        setLiveRoom(data.room);
      }
    };

    const handleGameReset = (data: { roomId: string; room?: BingoRoom }) => {
      if (data.roomId === room.id) {
        setReservations({});
        setOptimisticSelections(new Set());
        setSelectionTimes({});
        if (data.room) {
          setLiveRoom(data.room);
        }
      }
    };

    const handleRoomUpdated = (data: { room?: BingoRoom }) => {
      if (data && data.room && data.room.id === room.id) {
        setLiveRoom(data.room);
      }
    };

    const handleRoomCountdown = (data: { roomId: string; seconds: number; status: any; startedAt?: string; endsAt?: string }) => {
      if (data.roomId === room.id) {
        setLiveRoom((prev) => ({
          ...prev,
          status: data.status ?? prev.status,
          startedAt: data.startedAt ?? prev.startedAt,
          endsAt: data.endsAt !== undefined ? data.endsAt : prev.endsAt,
          countdownSeconds: data.seconds,
        }));
      }
    };

    const handleRoomStatsUpdated = (data: { roomId?: string; groupId?: string; prizePool?: number; ticketsSold?: number; activePlayersCount?: number }) => {
      const targetId = data.roomId || data.groupId;
      if (targetId === room.id) {
        setLiveRoom((prev) => ({
          ...prev,
          prizePool: typeof data.prizePool === 'number' ? data.prizePool : prev.prizePool,
          ticketsSold: typeof data.ticketsSold === 'number' ? data.ticketsSold : prev.ticketsSold,
          activePlayersCount: typeof data.activePlayersCount === 'number' ? data.activePlayersCount : prev.activePlayersCount,
        }));
      }
    };

    const handleRoomStatusChanged = (data: { roomId?: string; groupId?: string; status: any }) => {
      const targetId = data.roomId || data.groupId;
      if (targetId === room.id) {
        setLiveRoom((prev) => ({
          ...prev,
          status: data.status ?? prev.status,
        }));
      }
    };

    socket.on('card:updated', handleCardUpdated);
    socket.on('card:reservation_updated', handleCardUpdated);
    socket.on('room:snapshot', handleRoomSnapshot);
    socket.on('game:reset', handleGameReset);
    socket.on('room:updated', handleRoomUpdated);
    socket.on('room:countdown', handleRoomCountdown);
    socket.on('room:stats_updated', handleRoomStatsUpdated);
    socket.on('private_group:stats_updated', handleRoomStatsUpdated);
    socket.on('room:status_changed', handleRoomStatusChanged);
    socket.on('private_group:started', handleRoomStatusChanged);

    return () => {
      socket.off('card:updated', handleCardUpdated);
      socket.off('card:reservation_updated', handleCardUpdated);
      socket.off('room:snapshot', handleRoomSnapshot);
      socket.off('game:reset', handleGameReset);
      socket.off('room:updated', handleRoomUpdated);
      socket.off('room:countdown', handleRoomCountdown);
      socket.off('room:stats_updated', handleRoomStatsUpdated);
      socket.off('private_group:stats_updated', handleRoomStatsUpdated);
      socket.off('room:status_changed', handleRoomStatusChanged);
      socket.off('private_group:started', handleRoomStatusChanged);
    };
  }, [socket, room.id, user.id]);

  // Auto-transition to active game arena when room status changes to PLAYING
  useEffect(() => {
    if (liveRoom.status === 'PLAYING' && onEnterGame) {
      onEnterGame();
    }
  }, [liveRoom.status, onEnterGame]);

  // Manual Refresh Handler
  const isRefreshingRef = React.useRef(false);

  const handleManualRefresh = useCallback(async () => {
    if (isRefreshingRef.current) return;
    try {
      isRefreshingRef.current = true;
      setIsRefreshing(true);
      triggerHaptic('light');

      const response = await fetch(apiUrl(`/api/bingo/room-status/${room.id}?userId=${user.id}`));
      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          if (data.reservations) {
            setReservations(data.reservations);
          }
          if (data.room) {
            setLiveRoom(data.room);
          }
          if (data.myTickets && Array.isArray(data.myTickets)) {
            data.myTickets.forEach((t: BingoTicket) => {
              if (!room.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === room.gameReferenceId) {
                onCardPurchased(t);
              }
            });
          }
          setIsSyncing(false);
        }
      }
    } catch (err) {
      logger.debug('Manual refresh note:', err);
      setIsSyncing(true);
    } finally {
      isRefreshingRef.current = false;
      setIsRefreshing(false);
    }
  }, [room.id, room.gameReferenceId, user.id, onCardPurchased]);

  // Initial fetch of room status on mount
  useEffect(() => {
    handleManualRefresh();
  }, [room.id, user.id]);

  // Helper to filter valid reservations
  const getActiveReservation = useCallback(
    (num: number): CardReservation | undefined => {
      const res = reservations[num];
      if (!res) return undefined;
      return res;
    },
    [reservations]
  );

  // Filter cards based on search and filter tabs
  const filteredCards = useMemo(() => {
    return ALL_CARD_NUMBERS.filter((num) => {
      const reservation = getActiveReservation(num);
      const isSoldOrReserved = Boolean(reservation) || optimisticSelections.has(num);

      if (filterMode === 'available' && isSoldOrReserved) return false;
      if (filterMode === 'sold' && !isSoldOrReserved) return false;

      if (searchQuery.trim()) {
        const formatted = formatCardNumber(num).toLowerCase();
        const numStr = num.toString();
        return formatted.includes(searchQuery.toLowerCase()) || numStr.includes(searchQuery);
      }

      return true;
    });
  }, [filterMode, searchQuery, getActiveReservation, optimisticSelections]);

  const activeReservationsCount = useMemo(() => {
    const keys = new Set([
      ...Object.keys(reservations).map(Number).filter((num) => Boolean(getActiveReservation(num))),
      ...Array.from(optimisticSelections),
    ]);
    return keys.size;
  }, [reservations, getActiveReservation, optimisticSelections]);

  // Combined selected cards ordered chronologically by selection timestamp
  const mySelectedCards = useMemo(() => {
    const cardsMap = new Map<
      number,
      { cardNumber: number; status: 'SOLD' | 'RESERVED' | 'OPTIMISTIC'; time: number }
    >();

    // 1. Add server reservations owned by current user
    Object.keys(reservations).forEach((key) => {
      const num = Number(key);
      const res = getActiveReservation(num);
      if (res && res.userId === user.id && (res.status === 'SOLD' || res.status === 'RESERVED')) {
        const timestamp = res.purchasedAt
          ? new Date(res.purchasedAt).getTime()
          : res.reservedAt
          ? new Date(res.reservedAt).getTime()
          : selectionTimes[num] || num;
        cardsMap.set(num, {
          cardNumber: num,
          status: res.status as 'SOLD' | 'RESERVED',
          time: timestamp,
        });
      }
    });

    // 2. Add optimistic selections
    optimisticSelections.forEach((num) => {
      if (!cardsMap.has(num)) {
        cardsMap.set(num, {
          cardNumber: num,
          status: 'OPTIMISTIC',
          time: selectionTimes[num] || Date.now(),
        });
      }
    });

    // Sort chronologically by selection time
    return Array.from(cardsMap.values()).sort((a, b) => a.time - b.time);
  }, [reservations, optimisticSelections, selectionTimes, user.id, getActiveReservation]);

  // Auto-scroll horizontal list when new card is added
  useEffect(() => {
    if (mySelectedCards.length > prevSelectedCountRef.current && horizontalScrollRef.current) {
      horizontalScrollRef.current.scrollTo({
        left: horizontalScrollRef.current.scrollWidth,
        behavior: 'smooth',
      });
    }
    prevSelectedCountRef.current = mySelectedCards.length;
  }, [mySelectedCards.length]);

  const availableCount = Math.max(0, 400 - activeReservationsCount);
  const soldCount = activeReservationsCount;

  const isPrivateGroup = liveRoom.id.startsWith('grp_') || liveRoom.id.startsWith('private_');
  const currentRemSeconds = getRemainingSeconds(liveRoom);
  const isSalesClosed =
    liveRoom.status === 'PLAYING' ||
    liveRoom.status === 'FINISHED' ||
    liveRoom.status === 'RESETTING' ||
    (!isPrivateGroup && currentRemSeconds <= 0);

  // Toggle Selection Action with Instant Optimistic UI Response
  const handleToggleCard = useCallback(
    async (num: number) => {
      if (isSalesClosed) {
        triggerNotificationHaptic('warning');
        setErrorMessage('Card selection is closed for this round. Please wait for the next game.');
        return;
      }

      const reservation = getActiveReservation(num);
      const isOwnedByMe =
        (reservation && reservation.userId === user.id) || optimisticSelections.has(num);

      if (reservation && reservation.userId !== user.id && !isOwnedByMe) {
        triggerNotificationHaptic('warning');
        setErrorMessage('This Bingo card is already owned by another player.');
        return;
      }

      const isDeselecting = isOwnedByMe;

      // INSTANT OPTIMISTIC FEEDBACK
      triggerHaptic('light');
      setErrorMessage(null);

      if (isDeselecting) {
        setOptimisticSelections((prev) => {
          const next = new Set(prev);
          next.delete(num);
          return next;
        });
        setSelectionTimes((prev) => {
          const next = { ...prev };
          delete next[num];
          return next;
        });
        setReservations((prev) => {
          const next = { ...prev };
          if (next[num]?.userId === user.id) {
            delete next[num];
          }
          return next;
        });
        audioEngine.playDaub();
      } else {
        const now = Date.now();
        setOptimisticSelections((prev) => new Set(prev).add(num));
        setSelectionTimes((prev) => ({ ...prev, [num]: now }));
        audioEngine.playWin();
      }

      try {
        setTogglingCard(num);

        const response = await fetch(apiUrl('/api/bingo/toggle-card'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: room.id,
            cardNumber: num,
            userId: user.id,
          }),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to update card selection.');
        }

        if (data.action === 'SELECTED') {
          triggerNotificationHaptic('success');
          // Instantly sync card reservation into state so it NEVER disappears
          const serverRes: CardReservation = {
            id: `${room.id}_${num}`,
            roomId: room.id,
            cardNumber: num,
            userId: user.id,
            username: user.username,
            status: 'SOLD',
            purchasedAt: new Date().toISOString(),
          };
          setReservations((prev) => ({
            ...prev,
            [num]: serverRes,
          }));
          setOptimisticSelections((prev) => {
            const next = new Set(prev);
            next.delete(num);
            return next;
          });

          if (data.ticket) {
            onCardPurchased(data.ticket);
          }
        } else if (data.action === 'DESELECTED') {
          setReservations((prev) => {
            const next = { ...prev };
            delete next[num];
            return next;
          });
          setOptimisticSelections((prev) => {
            const next = new Set(prev);
            next.delete(num);
            return next;
          });
          if (onCardDeselected) {
            onCardDeselected(num);
          }
        }
      } catch (err: any) {
        // REVERT OPTIMISTIC UPDATE ON ERROR
        triggerNotificationHaptic('error');
        const friendlyMsg = err?.message === 'Failed to fetch'
          ? 'Network connection error. Please try again.'
          : err?.message || 'Failed to update card selection.';
        setErrorMessage(friendlyMsg);

        if (isDeselecting) {
          setOptimisticSelections((prev) => new Set(prev).add(num));
        } else {
          setOptimisticSelections((prev) => {
            const next = new Set(prev);
            next.delete(num);
            return next;
          });
          setSelectionTimes((prev) => {
            const next = { ...prev };
            delete next[num];
            return next;
          });
        }
      } finally {
        setTogglingCard(null);
      }
    },
    [isSalesClosed, getActiveReservation, user.id, room.id, onCardPurchased, onCardDeselected, optimisticSelections]
  );

  const totalPrice = mySelectedCards.length * (liveRoom.ticketPrice || 0);

  return (
    <div
      className={`space-y-4 transition-all duration-300 relative ${
        mySelectedCards.length > 0 ? 'pb-64 sm:pb-72' : 'pb-24'
      }`}
    >
      {/* Header Bar with Refresh Button */}
      <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-xl">
        <button
          onClick={onBack}
          className="p-2.5 rounded-2xl bg-slate-800 border border-slate-700 text-slate-200 hover:bg-slate-700 transition active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5">
            <span className="text-xl">{liveRoom.icon}</span>
            <h2 className="text-base font-black text-white">{liveRoom.name}</h2>
          </div>
          <p className="text-[10px] text-slate-400">
            {language === 'am' ? '400 ልዩ የቢንጎ ካርዶች • እባክዎን ካርድ ይምረጡ' : '400 Unique Cards • Choose your Card'}
            {liveRoom.gameReferenceId && (
              <span className="block font-mono text-amber-400 font-bold mt-0.5">
                Ref: {liveRoom.gameReferenceId}
              </span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block">Prize Pool</span>
            <span className="text-sm font-black text-amber-400">{(liveRoom?.prizePool ?? 0).toLocaleString()} Birr</span>
          </div>

          {/* Refresh Button */}
          <button
            disabled={isRefreshing}
            onClick={handleManualRefresh}
            title="Refresh Card Status"
            className="px-3 py-2 rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{language === 'am' ? 'አድስ' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Synchronization Indicator */}
      {isSyncing && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-2.5 px-4 text-center text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2 animate-pulse shadow-md">
          <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin shrink-0" />
          <span>{language === 'am' ? 'ከሰርቨሩ ጋር በመጣመር ላይ...' : 'Synchronizing game...'}</span>
        </div>
      )}

      {/* Error Banner */}
      {errorMessage && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-center shadow-lg flex items-center justify-between gap-2 text-red-300 font-bold text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-xs font-black text-red-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Countdown / Sales Closed Banner */}
      {isSalesClosed ? (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-3.5 text-center shadow-lg flex items-center justify-center gap-2 text-red-300 font-extrabold text-xs">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>Ticket sales for this round have closed. Please wait for the next game.</span>
        </div>
      ) : (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 text-center text-amber-300 font-extrabold text-xs flex items-center justify-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-400 animate-spin" />
          <span>
            {isPrivateGroup
              ? 'Ticket Selection Active • Waiting for Host to Start Game'
              : `Ticket Selection Active • Countdown: ${currentRemSeconds}s remaining`}
          </span>
        </div>
      )}

      {/* Stats & Search Toolbar */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-xl">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-slate-950 p-2.5 rounded-2xl border border-slate-800">
            <span className="text-[10px] text-slate-400 block">Total Cards</span>
            <span className="font-extrabold text-white">400 Cards</span>
          </div>

          <div className="bg-emerald-500/10 p-2.5 rounded-2xl border border-emerald-500/20">
            <span className="text-[10px] text-emerald-400 block">Available</span>
            <span className="font-black text-emerald-300">{availableCount}</span>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-2xl border border-slate-700">
            <span className="text-[10px] text-slate-400 block">Reserved / Sold</span>
            <span className="font-extrabold text-slate-300">{soldCount}</span>
          </div>
        </div>

        {/* 4-Color Status Legend */}
        <div className="flex flex-wrap items-center justify-around gap-2 bg-slate-950 p-2.5 rounded-2xl border border-slate-800 text-[10px] font-bold">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-white border border-slate-300 shadow-sm inline-block" />
            <span className="text-slate-300">Available</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-amber-400 border border-amber-500 shadow-sm inline-block" />
            <span className="text-amber-300">Reserved (Hold)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-emerald-500 border border-emerald-400 shadow-sm inline-block" />
            <span className="text-emerald-300">Selected (Mine)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-md bg-red-600 border border-red-500 shadow-sm inline-block" />
            <span className="text-red-300">Purchased (Other)</span>
          </div>
        </div>

        {/* Search & Filter Tabs */}
        <div className="flex flex-col sm:flex-row items-center gap-2">
          {/* Search Box */}
          <div className="relative flex-1 w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'am' ? 'ካርድ ቁጥር ፈልግ (ምሳሌ #187)...' : 'Search Card Number (#187)...'}
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 w-full sm:w-auto shrink-0">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                filterMode === 'all' ? 'bg-amber-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              All (400)
            </button>
            <button
              onClick={() => setFilterMode('available')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                filterMode === 'available' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
              }`}
            >
              Available ({availableCount})
            </button>
            <button
              onClick={() => setFilterMode('sold')}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                filterMode === 'sold' ? 'bg-slate-800 text-slate-200' : 'text-slate-400'
              }`}
            >
              Sold ({soldCount})
            </button>
          </div>
        </div>
      </div>

      {/* 400 Cards Grid */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 shadow-2xl space-y-3">
        <div className="flex items-center justify-between text-xs font-bold text-slate-300">
          <span className="flex items-center gap-1.5">
            <Grid className="w-4 h-4 text-amber-400" />
            <span>Select a Bingo Card to Preview & Buy</span>
          </span>
          <span className="text-[10px] text-slate-400">Showing {filteredCards.length} cards</span>
        </div>

        <BingoCardGrid
          filteredCards={filteredCards}
          reservations={reservations}
          optimisticSelections={optimisticSelections}
          currentUserId={user.id}
          isSalesClosed={isSalesClosed}
          togglingCard={togglingCard}
          onToggleCard={handleToggleCard}
        />
      </div>

      {/* Fixed Bottom Selected Cards Panel */}
      <SelectedCardsPanel
        mySelectedCards={mySelectedCards}
        liveRoom={liveRoom}
        togglingCard={togglingCard}
        language={language}
        onDeselectCard={handleToggleCard}
        onEnterGame={onEnterGame}
        onBack={onBack}
        horizontalScrollRef={horizontalScrollRef}
      />
    </div>
  );
};

