import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { initTelegramApp, triggerHaptic } from './lib/telegramSDK';
import { audioEngine } from './lib/audioEngine';
import { logger } from './lib/logger';
import {
  BingoRoom,
  BingoTicket,
  ChatMessage,
  LeaderboardEntry,
  PaymentProviderType,
  ReferralStat,
  UserProfile,
  WalletTransaction,
} from './types';

// Components
import { TelegramSimulatorBar } from './components/TelegramSimulatorBar';
import { HeaderBar, ThemeMode } from './components/HeaderBar';
import { Navigation, TabType } from './components/Navigation';
import { HomeView } from './components/HomeView';
import { CardSelectionView } from './components/CardSelectionView';
import { ActiveGameView } from './components/ActiveGameView';
import { WalletView } from './components/WalletView';
import { BonusesView } from './components/BonusesView';
import { LeaderboardView } from './components/LeaderboardView';
import { GameHistoryView } from './components/GameHistoryView';
import { HelpView } from './components/HelpView';
import { AuthModal } from './components/AuthModal';
import { CreatePrivateGroupModal } from './components/CreatePrivateGroupModal';
import { JoinPrivateGroupModal } from './components/JoinPrivateGroupModal';
import { PrivateGroupLobbyModal } from './components/PrivateGroupLobbyModal';
import { TelegramBotModal } from './components/TelegramBotModal';
import { RegistrationGateModal } from './components/RegistrationGateModal';
import { TelegramPhoneVerificationModal } from './components/TelegramPhoneVerificationModal';
import { ConfettiOverlay } from './components/ConfettiOverlay';
import { Wrench } from 'lucide-react';
import { getRemainingSeconds, formatPrivateGroupToRoom } from './lib/bingoUtils';
import { apiUrl, getSocketUrl } from './lib/apiConfig';

// Demo Users for Simulator
const DEMO_USERS: UserProfile[] = [
  {
    id: 'usr_abebe',
    telegramId: 100001,
    username: 'abebe_k',
    firstName: 'Abebe',
    lastName: 'Kebede',
    photoUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    language: 'am',
    referralCode: 'ABEBE10',
    walletBalance: 450,
    bonusBalance: 50,
    vipLevel: 2,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    totalWins: 18,
    totalGamesPlayed: 45,
    totalDeposited: 1000,
    totalWithdrawn: 500,
  },
  {
    id: 'usr_tigist',
    telegramId: 100002,
    username: 'tigist_h',
    firstName: 'Tigist',
    lastName: 'Haile',
    photoUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    language: 'en',
    referralCode: 'TIGI2026',
    walletBalance: 1200,
    bonusBalance: 150,
    vipLevel: 3,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    totalWins: 27,
    totalGamesPlayed: 60,
    totalDeposited: 2000,
    totalWithdrawn: 800,
  },
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserProfile>(DEMO_USERS[0]);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(() => Boolean(localStorage.getItem('ahun_jwt_token')));
  const [onlineUsersCount, setOnlineUsersCount] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<TabType>('home');
  const [language, setLanguage] = useState<'en' | 'am'>('am');
  const [theme, setTheme] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('yabede_theme');
    if (saved === 'golden' || saved === 'light' || saved === 'dark') {
      return saved as ThemeMode;
    }
    return 'golden';
  });
  const isDarkMode = theme !== 'light';

  const handleSelectTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('yabede_theme', newTheme);
  };
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [isPhoneVerificationOpen, setIsPhoneVerificationOpen] = useState<boolean>(false);

  // Session-persistent Referral Code extracted during initialization
  const [referralCode, setReferralCode] = useState<string>(() => {
    try {
      return (
        sessionStorage.getItem('yabede_referral_code') ||
        localStorage.getItem('yabede_referral_code') ||
        ''
      );
    } catch {
      return '';
    }
  });

  // App Data States
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rooms, setRooms] = useState<BingoRoom[]>([]);
  const [activeRoom, setActiveRoom] = useState<BingoRoom | null>(null);
  const [userTickets, setUserTickets] = useState<BingoTicket[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [referralStat, setReferralStat] = useState<ReferralStat | undefined>();

  // Card Selection Grid State
  const [selectedCardRoom, setSelectedCardRoom] = useState<BingoRoom | null>(null);

  // Win Notification State
  const [winNotification, setWinNotification] = useState<{
    title: string;
    message: string;
    prizeAmount: number;
    roomName: string;
  } | null>(null);

  // Broadcaster / Platform Announcement State
  const [activeAnnouncement, setActiveAnnouncement] = useState<{
    id: string;
    title: string;
    message: string;
    createdAt: string;
  } | null>(null);

  // Private Group States
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [isJoinGroupCodeOpen, setIsJoinGroupCodeOpen] = useState(false);
  const [activePrivateGroupId, setActivePrivateGroupId] = useState<string | null>(null);

  // Telegram Bot Gateway & Registration Gate States
  const [isBotOpen, setIsBotOpen] = useState(false);
  const [isGateOpen, setIsGateOpen] = useState(false);
  const [isMaintenanceMode, setIsMaintenanceMode] = useState(false);
  const [registrationBonusCredit, setRegistrationBonusCredit] = useState<number>(50);
  const [tgAuthStatus, setTgAuthStatus] = useState<'checking' | 'authenticated' | 'outside_telegram' | 'auth_error'>('checking');
  const [tgAuthErrorMessage, setTgAuthErrorMessage] = useState<string>('');

  // Check Maintenance Mode & System Settings
  useEffect(() => {
    fetch(apiUrl('/api/system/settings'))
      .then((res) => res.json())
      .then((data) => {
        if (data && data.maintenanceMode !== undefined) {
          setIsMaintenanceMode(Boolean(data.maintenanceMode));
        }
        if (data && typeof data.registrationBonusCredit === 'number') {
          setRegistrationBonusCredit(data.registrationBonusCredit);
          setCurrentUser((prev) => {
            if (prev.id.startsWith('usr_abebe') || prev.id.startsWith('demo_') || !prev.telegramId) {
              return { ...prev, bonusBalance: data.registrationBonusCredit };
            }
            return prev;
          });
        }
      })
      .catch(() => null);
  }, []);

  // Initialize Telegram App & Real WebApp Session Verification with Persistent Referral Extraction
  useEffect(() => {
    initTelegramApp();

    // Comprehensive extraction of referralCode / start parameter from all Telegram & URL sources
    const urlParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(
      window.location.hash.startsWith('#') ? window.location.hash.slice(1) : window.location.hash
    );

    let extractedReferralCode =
      window.Telegram?.WebApp?.initDataUnsafe?.start_param ||
      urlParams.get('startapp') ||
      urlParams.get('tgWebAppStartParam') ||
      urlParams.get('referralCode') ||
      urlParams.get('ref') ||
      urlParams.get('start') ||
      hashParams.get('startapp') ||
      hashParams.get('tgWebAppStartParam') ||
      hashParams.get('ref') ||
      hashParams.get('start') ||
      '';

    // Parse initData if start_param is encoded inside raw initData string
    const initData = window.Telegram?.WebApp?.initData || '';
    if (!extractedReferralCode && initData) {
      try {
        const parsedInit = new URLSearchParams(initData);
        extractedReferralCode = parsedInit.get('start_param') || '';
      } catch (e) {
        console.warn('Failed to parse start_param from initData string', e);
      }
    }

    if (extractedReferralCode && !extractedReferralCode.startsWith('group_')) {
      const cleanRef = extractedReferralCode.trim();
      setReferralCode(cleanRef);
      try {
        sessionStorage.setItem('yabede_referral_code', cleanRef);
        localStorage.setItem('yabede_referral_code', cleanRef);
      } catch (e) {
        console.warn('Could not persist referral code in storage', e);
      }
    }

    const effectiveReferral =
      extractedReferralCode && !extractedReferralCode.startsWith('group_')
        ? extractedReferralCode.trim()
        : sessionStorage.getItem('yabede_referral_code') ||
          localStorage.getItem('yabede_referral_code') ||
          undefined;

    if (initData) {
      // Send real Telegram initData to backend for HMAC verification & auto-registration
      fetch(apiUrl('/api/auth/telegram'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, referralCode: effectiveReferral }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok && data.success && data.user) {
            setCurrentUser(data.user);
            setIsLoggedIn(true);
            localStorage.setItem('ahun_jwt_token', data.token);
            setTgAuthStatus('authenticated');
            setIsGateOpen(false);
          } else {
            setIsLoggedIn(false);
            setTgAuthErrorMessage(data.message || 'Telegram authentication failed.');
            setTgAuthStatus('auth_error');
          }
        })
        .catch((err) => {
          console.warn('Telegram session verification note:', err);
          setIsLoggedIn(false);
          setTgAuthErrorMessage('Network error verifying Telegram session.');
          setTgAuthStatus('auth_error');
        });
    } else {
      // Opened outside Telegram Mini App
      setTgAuthStatus('outside_telegram');
    }

    // Check Telegram Start Param for Group Invite (e.g. startapp=group_YABEDE77)
    if (extractedReferralCode && extractedReferralCode.startsWith('group_')) {
      const code = extractedReferralCode.replace('group_', '').toUpperCase();
      fetch(apiUrl('/api/private-groups/join-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, userId: currentUser.id }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.group) {
            setActivePrivateGroupId(data.group.id);
          }
        })
        .catch(console.error);
    }
  }, []);

  // Unified Game State Reset function that clears userTickets, selectedCardRoom, and activeRoom state
  const resetGameState = useCallback((roomId?: string) => {
    if (roomId) {
      setUserTickets((prev) => prev.filter((t) => t.roomId !== roomId));
      setActiveRoom((prev) => (prev && prev.id === roomId ? null : prev));
      setSelectedCardRoom((prev) => (prev && prev.id === roomId ? null : prev));
    } else {
      setUserTickets([]);
      setActiveRoom(null);
      setSelectedCardRoom(null);
    }
  }, []);

  // Monitor activeTab or gameId changes to ensure UI state stays synchronized
  const activeGameId = activeRoom?.gameReferenceId;
  const prevGameIdRef = useRef<string | undefined>(activeGameId);

  useEffect(() => {
    if (prevGameIdRef.current && activeGameId && prevGameIdRef.current !== activeGameId) {
      if (activeRoom) {
        resetGameState(activeRoom.id);
      } else {
        resetGameState();
      }
    }
    prevGameIdRef.current = activeGameId;

    if (activeTab === 'home') {
      if (activeRoom && activeRoom.status === 'FINISHED') {
        resetGameState(activeRoom.id);
      }
    } else if (activeTab === 'active_game' && !activeRoom && !selectedCardRoom) {
      setActiveTab('home');
    }
  }, [activeTab, activeGameId, activeRoom, selectedCardRoom, resetGameState]);

  // Connect Socket.IO
  useEffect(() => {
    const socketUrl = getSocketUrl();
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    newSocket.on('connect', () => {
      logger.debug('[Socket.IO] Client connected to backend:', newSocket.id);
      newSocket.emit('auth:identify', { userId: currentUser.id });
    });

    newSocket.on('reconnect', (attempt) => {
      logger.debug('[Socket.IO] Client reconnected (attempt ' + attempt + ')');
      newSocket.emit('auth:identify', { userId: currentUser.id });
    });

    newSocket.on('connect_error', (err) => {
      logger.debug('[Socket.IO] Client connection error:', err.message);
    });

    newSocket.on('settings:updated', (data: any) => {
      logger.debug('[Socket.IO] Received authoritative settings:updated');
      if (data?.settings?.maintenanceMode !== undefined) {
        setIsMaintenanceMode(Boolean(data.settings.maintenanceMode));
      }
      const newBonus = typeof data?.registrationBonusCredit === 'number'
        ? data.registrationBonusCredit
        : typeof data?.settings?.welcomeBonusBirr === 'number'
        ? data.settings.welcomeBonusBirr
        : null;

      if (newBonus !== null) {
        setRegistrationBonusCredit(newBonus);
        setCurrentUser((prev) => {
          if (prev.id.startsWith('usr_abebe') || prev.id.startsWith('demo_') || !prev.telegramId) {
            return { ...prev, bonusBalance: newBonus };
          }
          return prev;
        });
      }
      fetchData();
    });

    newSocket.on('online:users_count', (data: { count: number }) => {
      if (data && typeof data.count === 'number') {
        setOnlineUsersCount(data.count);
      }
    });

    newSocket.on('wallet:updated', (data: { userId: string; newBalance: number }) => {
      if (data.userId === currentUser.id && typeof data.newBalance === 'number') {
        setCurrentUser((prev) => ({ ...prev, walletBalance: data.newBalance }));
      }
    });

    newSocket.on('room:updated', (data: { room: BingoRoom }) => {
      if (data && data.room) {
        const roomWithRem = { ...data.room, countdownSeconds: getRemainingSeconds(data.room) };
        setRooms((prev) => prev.map((r) => (r.id === data.room.id ? roomWithRem : r)));
        setActiveRoom((prev) => (prev && prev.id === data.room.id ? roomWithRem : prev));
        setSelectedCardRoom((prev) => {
          if (!prev || prev.id !== data.room.id) return prev;
          if (data.room.status === 'PLAYING') {
            setActiveRoom(roomWithRem);
            setActiveTab('active_game');
            return null;
          }
          return roomWithRem;
        });
      }
    });

    const handleRoomStatusChanged = (data: { roomId?: string; groupId?: string; status: any }) => {
      const targetId = data.roomId || data.groupId;
      if (!targetId) return;

      setRooms((prev) =>
        prev.map((r) => (r.id === targetId ? { ...r, status: data.status } : r))
      );
      setActiveRoom((prev) => (prev && prev.id === targetId ? { ...prev, status: data.status } : prev));
      setSelectedCardRoom((prev) => {
        if (!prev || prev.id !== targetId) return prev;
        if (data.status === 'PLAYING') {
          setActiveRoom({ ...prev, status: data.status });
          setActiveTab('active_game');
          return null;
        }
        return { ...prev, status: data.status };
      });
    };

    newSocket.on('room:status_changed', handleRoomStatusChanged);
    newSocket.on('private_group:started', (data: { group?: BingoRoom; status?: any }) => {
      if (data && data.group) {
        handleRoomStatusChanged({ groupId: data.group.id, status: data.status || 'PLAYING' });
      }
    });

    newSocket.on('private_group:updated', (data: { group: any }) => {
      if (data && data.group) {
        setRooms((prev) => {
          const existing = prev.find((r) => r.id === data.group.id);
          const updated = formatPrivateGroupToRoom(data.group, existing);
          if (!updated) return prev;
          const exists = prev.some((r) => r.id === updated.id);
          if (exists) {
            return prev.map((r) => (r.id === updated.id ? updated : r));
          }
          return [...prev, updated];
        });
        setActiveRoom((prev) => {
          if (prev && prev.id === data.group.id) {
            return formatPrivateGroupToRoom(data.group, prev);
          }
          return prev;
        });
      }
    });

    newSocket.on('room:countdown', (data: { roomId: string; seconds: number; status: any; startedAt?: string; endsAt?: string }) => {
      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === data.roomId) {
            const updated = {
              ...r,
              status: data.status,
              startedAt: data.startedAt ?? r.startedAt,
              endsAt: data.endsAt !== undefined ? data.endsAt : r.endsAt,
            };
            return { ...updated, countdownSeconds: getRemainingSeconds(updated) };
          }
          return r;
        })
      );
      setActiveRoom((prev) => {
        if (prev && prev.id === data.roomId) {
          const updated = {
            ...prev,
            status: data.status,
            startedAt: data.startedAt ?? prev.startedAt,
            endsAt: data.endsAt !== undefined ? data.endsAt : prev.endsAt,
          };
          return { ...updated, countdownSeconds: getRemainingSeconds(updated) };
        }
        return prev;
      });
      setSelectedCardRoom((prev) => {
        if (prev && prev.id === data.roomId) {
          const updated = {
            ...prev,
            status: data.status,
            startedAt: data.startedAt ?? prev.startedAt,
            endsAt: data.endsAt !== undefined ? data.endsAt : prev.endsAt,
          };
          if (data.status === 'PLAYING') {
            setActiveRoom(updated);
            setActiveTab('active_game');
            return null;
          }
          return { ...updated, countdownSeconds: getRemainingSeconds(updated) };
        }
        return prev;
      });
    });

    const handleBallDrawn = (data: { roomId?: string; groupId?: string; ball: number; drawnBalls: number[] }) => {
      const targetId = data.roomId || data.groupId;
      if (!targetId) return;

      setRooms((prev) =>
        prev.map((r) =>
          r.id === targetId ? { ...r, currentBall: data.ball, drawnBalls: data.drawnBalls } : r
        )
      );
      setActiveRoom((prev) =>
        prev && prev.id === targetId
          ? { ...prev, currentBall: data.ball, drawnBalls: data.drawnBalls }
          : prev
      );
    };

    newSocket.on('ball:drawn', handleBallDrawn);
    newSocket.on('game:ball_drawn', handleBallDrawn);
    newSocket.on('private_group:ball_drawn', handleBallDrawn);

    const handleStatsUpdated = (data: { roomId?: string; groupId?: string; prizePool?: number; ticketsSold?: number; activePlayersCount?: number }) => {
      const targetId = data.roomId || data.groupId;
      if (!targetId) return;

      setActiveRoom((prev) => {
        if (prev && prev.id === targetId) {
          return {
            ...prev,
            prizePool: typeof data.prizePool === 'number' ? data.prizePool : prev.prizePool,
            ticketsSold: typeof data.ticketsSold === 'number' ? data.ticketsSold : prev.ticketsSold,
            activePlayersCount: typeof data.activePlayersCount === 'number' ? data.activePlayersCount : prev.activePlayersCount,
          };
        }
        return prev;
      });

      setRooms((prev) =>
        prev.map((r) => {
          if (r.id === targetId) {
            return {
              ...r,
              prizePool: typeof data.prizePool === 'number' ? data.prizePool : r.prizePool,
              ticketsSold: typeof data.ticketsSold === 'number' ? data.ticketsSold : r.ticketsSold,
              activePlayersCount: typeof data.activePlayersCount === 'number' ? data.activePlayersCount : r.activePlayersCount,
            };
          }
          return r;
        })
      );
    };

    newSocket.on('private_group:stats_updated', handleStatsUpdated);
    newSocket.on('room:stats_updated', handleStatsUpdated);

    newSocket.on('room:snapshot', (data: { room: BingoRoom; tickets: BingoTicket[]; messages: ChatMessage[] }) => {
      if (data && data.tickets && Array.isArray(data.tickets) && data.room) {
        setUserTickets((prev) => {
          const otherRoomTickets = prev.filter((t) => t.roomId !== data.room.id);
          return [...otherRoomTickets, ...data.tickets];
        });
      }
      if (data && data.messages && Array.isArray(data.messages)) {
        setChatMessages((prev) => {
          const otherRoomMsgs = prev.filter((m) => m.roomId && m.roomId !== data.room.id);
          return [...otherRoomMsgs, ...data.messages];
        });
      }
    });

    newSocket.on('ticket:bought', (data: { tickets: BingoTicket[]; userBalance: number }) => {
      if (data && data.tickets && Array.isArray(data.tickets)) {
        setUserTickets((prev) => {
          const existingIds = new Set(prev.map((t) => t.id));
          const newItems = data.tickets.filter((t) => !existingIds.has(t.id));
          return [...prev, ...newItems];
        });
      }
      if (typeof data.userBalance === 'number') {
        setCurrentUser((prev) => ({ ...prev, walletBalance: data.userBalance }));
      }
    });

    newSocket.on('chat:message', (msg: ChatMessage) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    });

    const handleWinEvent = (data: {
      winner: any;
      winners?: any[];
      prizeAmount?: number;
      pattern?: string;
      roomId?: string;
      room?: any;
      group?: any;
      message?: string;
    }) => {
      const winner = data.winner;
      const winnersList = data.winners || (winner ? [winner] : []);
      const targetId = data.room?.id || data.group?.id;

      if (targetId) {
        setActiveRoom((prev) => {
          if (prev && prev.id === targetId) {
            return {
              ...prev,
              status: data.group?.status || 'WAITING_HOST_DECISION',
              lastWinners: winnersList.length > 0 ? winnersList : prev.lastWinners,
            };
          }
          return prev;
        });
      }

      const myWin = winnersList.find((w: any) => w.userId === currentUser.id) || (winner?.userId === currentUser.id ? winner : null);
      if (myWin) {
        audioEngine.playWin();
        triggerHaptic('heavy');
        fetchData();

        const roomName = data.room?.name || data.group?.name || 'Bingo Game';
        const winAmount = typeof data.prizeAmount === 'number' && data.prizeAmount > 0
          ? data.prizeAmount
          : (myWin.prizeAmount || 0);
        setWinNotification({
          title: language === 'am' ? '🎉 ቢንጎ አሸንፈዋል!' : '🎉 BINGO WINNER!',
          message: language === 'am'
            ? `የተወራረዱበት ቢንጎ አልቋል! በ"${roomName}" ${winAmount} ብር አሸንፈዋል! ገንዘቡ በራስ-ሰር ወደ ቦርሳዎ ተጨምሯል።`
            : `Your bingo game ended! You won ${winAmount} Birr in "${roomName}"! The prize has been added to your wallet balance.`,
          prizeAmount: winAmount,
          roomName,
        });
      }
    };

    newSocket.on('game:winner', handleWinEvent);
    newSocket.on('private_group:winner', handleWinEvent);
    newSocket.on('private_group:waiting_host', (data: { groupId: string; group?: any; winners?: any[] }) => {
      if (data && data.groupId) {
        setActiveRoom((prev) => {
          if (prev && prev.id === data.groupId) {
            return {
              ...prev,
              status: 'WAITING_HOST_DECISION',
              lastWinners: data.winners && data.winners.length > 0 ? data.winners : prev.lastWinners,
            };
          }
          return prev;
        });
      }
    });
    newSocket.on('private_group:ended', (data: { groupId: string; group?: any }) => {
      if (data && data.groupId) {
        setActiveRoom((prev) => {
          if (prev && prev.id === data.groupId) {
            return {
              ...prev,
              status: 'FINISHED',
            };
          }
          return prev;
        });
      }
    });

    newSocket.on('private_group:play_again', (data: { groupId: string; group: any }) => {
      setUserTickets((prev) => prev.filter((t) => t.roomId !== data.groupId));
      setActiveRoom(null);
      setActiveTab('home');
      setActivePrivateGroupId(data.groupId);
    });

    newSocket.on('private_group:closed', (data: { groupId: string; message?: string }) => {
      setActiveRoom((prev) => (prev && prev.id === data.groupId ? null : prev));
      setActivePrivateGroupId((prev) => (prev === data.groupId ? null : prev));
      setActiveTab('home');
      if (data.message) {
        logger.info('[Private Group Closed]', data.message);
      }
    });

    newSocket.on('game:reset', (data: { roomId: string; room: BingoRoom }) => {
      resetGameState(data.roomId);
      setRooms((prev) => prev.map((r) => (r.id === data.roomId ? data.room : r)));
      if (activeRoom && activeRoom.id === data.roomId) {
        setSelectedCardRoom(data.room);
      } else if (selectedCardRoom && selectedCardRoom.id === data.roomId) {
        setSelectedCardRoom(data.room);
      }
    });

    newSocket.on('wallet:updated', (data: { userId: string; newBalance?: number; bonusBalance?: number }) => {
      if (data && data.userId === currentUser.id) {
        setCurrentUser((prev) => ({
          ...prev,
          walletBalance: typeof data.newBalance === 'number' ? data.newBalance : prev.walletBalance,
          bonusBalance: typeof data.bonusBalance === 'number' ? data.bonusBalance : prev.bonusBalance,
        }));
        // Refresh transaction history when wallet updates
        fetch(apiUrl(`/api/wallet/transactions?userId=${currentUser.id}`))
          .then((r) => (r.ok ? r.json() : null))
          .then((tData) => {
            if (tData?.transactions) setTransactions(tData.transactions);
          })
          .catch(() => {});
      }
    });

    newSocket.on('user:balance_updated', (data: { userId: string; newBalance?: number; bonusBalance?: number }) => {
      if (data && data.userId === currentUser.id) {
        setCurrentUser((prev) => ({
          ...prev,
          walletBalance: typeof data.newBalance === 'number' ? data.newBalance : prev.walletBalance,
          bonusBalance: typeof data.bonusBalance === 'number' ? data.bonusBalance : prev.bonusBalance,
        }));
      }
    });

    newSocket.on('settings:updated', () => {
      fetchData();
    });

    newSocket.on('rooms:updated', (data: { rooms: BingoRoom[] }) => {
      if (data && data.rooms && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
      }
    });

    newSocket.on('room:updated', (data: { room: BingoRoom }) => {
      if (data && data.room) {
        setRooms((prev) => prev.map((r) => (r.id === data.room.id ? data.room : r)));
        setActiveRoom((prev) => (prev && prev.id === data.room.id ? data.room : prev));
      }
    });

    newSocket.on('room:deleted', (data: { roomId: string }) => {
      if (data?.roomId) {
        setRooms((prev) => prev.filter((r) => r.id !== data.roomId));
        setActiveRoom((prev) => (prev && prev.id === data.roomId ? null : prev));
        setSelectedCardRoom((prev) => (prev && prev.id === data.roomId ? null : prev));
      }
    });

    newSocket.on('broadcast:announcement', (ann: { id: string; title: string; message: string; createdAt: string }) => {
      if (ann && (ann.title || ann.message)) {
        setActiveAnnouncement(ann);
        triggerHaptic('medium');
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [currentUser.id]);

  // Client-side 1-second ticker recalculating remaining time from endsAt
  useEffect(() => {
    const handleInteraction = () => {
      audioEngine.unlockAudio();
    };

    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });

    const timer = setInterval(() => {
      setRooms((prev) =>
        prev.map((r) => {
          const rem = getRemainingSeconds(r);
          return r.countdownSeconds === rem ? r : { ...r, countdownSeconds: rem };
        })
      );
      setActiveRoom((prev) => {
        if (!prev) return null;
        const rem = getRemainingSeconds(prev);
        return prev.countdownSeconds === rem ? prev : { ...prev, countdownSeconds: rem };
      });
      setSelectedCardRoom((prev) => {
        if (!prev) return null;
        const rem = getRemainingSeconds(prev);
        return prev.countdownSeconds === rem ? prev : { ...prev, countdownSeconds: rem };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Fetch Initial Data
  const fetchData = async () => {
    try {
      // Fetch Official Bingo Rooms from server engine
      const roomsRes = await fetch(apiUrl('/api/bingo/rooms'));
      if (roomsRes.ok) {
        const rData = await roomsRes.json();
        if (rData.rooms && Array.isArray(rData.rooms) && rData.rooms.length > 0) {
          setRooms(rData.rooms);
        }
      }

      // Profile & Referral
      const profileRes = await fetch(apiUrl(`/api/user/profile?userId=${currentUser.id}`));
      if (profileRes.ok) {
        const pData = await profileRes.json();
        setCurrentUser(pData.user);
        setReferralStat(pData.referralStat);
      }

      // Online Users
      const onlineRes = await fetch(apiUrl('/api/online-users'));
      if (onlineRes.ok) {
        const oData = await onlineRes.json();
        if (typeof oData.count === 'number') {
          setOnlineUsersCount(oData.count);
        }
      }

      // Ledger
      const txRes = await fetch(apiUrl(`/api/wallet/transactions?userId=${currentUser.id}`));
      if (txRes.ok) {
        const tData = await txRes.json();
        setTransactions(tData.transactions);
      }

      // Leaderboard
      const lbRes = await fetch(apiUrl('/api/leaderboard'));
      if (lbRes.ok) {
        const lData = await lbRes.json();
        setLeaderboard(lData.leaderboard);
      }
    } catch {
      // Fallback
    }
  };

  useEffect(() => {
    fetchData();
  }, [currentUser.id]);

  // Actions
  const handleJoinRoom = (room: BingoRoom, ticketCount: number) => {
    if (!currentUser.phone || !currentUser.phone.trim()) {
      setIsPhoneVerificationOpen(true);
      return;
    }

    setActiveRoom(room);
    setActiveTab('active_game');

    if (socket) {
      socket.emit('room:join', { roomId: room.id, userId: currentUser.id });
      socket.emit('ticket:buy', { roomId: room.id, userId: currentUser.id, count: ticketCount });
    }
  };

  const handleDeposit = async (params: {
    paymentMethodId: string;
    amount: number;
    referenceCode: string;
    mobileNumber?: string;
    screenshotUrl?: string;
    note?: string;
  }) => {
    const res = await fetch(apiUrl('/api/wallet/deposit'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        paymentMethodId: params.paymentMethodId,
        amount: params.amount,
        referenceCode: params.referenceCode,
        mobileNumber: params.mobileNumber,
        screenshotUrl: params.screenshotUrl,
        note: params.note,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Deposit failed');
    }

    await fetchData();
  };

  const handleWithdraw = async (params: {
    paymentMethodId: string;
    paymentMethodName: string;
    amount: number;
    accountNumber: string;
    accountName: string;
    note?: string;
  }) => {
    const res = await fetch(apiUrl('/api/wallet/withdraw'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: currentUser.id,
        paymentMethodId: params.paymentMethodId,
        paymentMethodName: params.paymentMethodName,
        amount: params.amount,
        accountNumber: params.accountNumber,
        accountName: params.accountName,
        note: params.note,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Withdrawal failed');
    }

    await fetchData();
  };

  const handleSpinWheel = async (): Promise<number> => {
    const res = await fetch(apiUrl('/api/bonuses/lucky-spin'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    });

    if (!res.ok) throw new Error('Spin failed');
    const data = await res.json();
    await fetchData();
    return data.amount;
  };

  const handleSendMessage = (text: string) => {
    const currentRoomId = activeRoom?.id || selectedCardRoom?.id;
    if (socket && currentRoomId) {
      socket.emit('chat:send', {
        roomId: currentRoomId,
        userId: currentUser.id,
        text,
      });
    }
  };

  const handleClaimBingo = (ticketId: string) => {
    if (socket) {
      socket.emit('bingo:claim', { ticketId, userId: currentUser.id });
    }
  };

  if (tgAuthStatus === 'outside_telegram' && !import.meta.env.DEV) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-3xl p-6 md:p-8 text-center shadow-2xl backdrop-blur-xl relative z-10 space-y-6">
          <div className="w-20 h-20 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-center justify-center mx-auto text-4xl shadow-inner">
            📱
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-amber-400 tracking-tight">YABEDE BINGO</h1>
            <p className="text-sm font-bold text-slate-200">Please Open from Telegram Mini App</p>
            <p className="text-xs text-slate-400 leading-relaxed pt-1">
              To guarantee real account security, Telegram identity verification, and instant payouts, Yabede Bingo must be accessed directly through our official Telegram Bot.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <a
              href="https://t.me/yabede_bingo_bot"
              target="_blank"
              rel="noreferrer"
              className="w-full py-3.5 px-6 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition-all transform hover:scale-[1.02]"
            >
              <span>🎮 Open Telegram Bot (@yabede_bingo_bot)</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (tgAuthStatus === 'auth_error') {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
        <div className="max-w-md w-full bg-slate-900/90 border border-red-500/30 rounded-3xl p-6 md:p-8 text-center shadow-2xl backdrop-blur-xl relative z-10 space-y-6">
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/30 rounded-2xl flex items-center justify-center mx-auto text-3xl">
            ⚠️
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-red-400">Telegram Authentication Failed</h2>
            <p className="text-xs text-slate-300 leading-relaxed">
              {tgAuthErrorMessage || 'Could not verify your Telegram signature. Please re-open the application from Telegram.'}
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <a
              href="https://t.me/yabede_bingo_bot"
              target="_blank"
              rel="noreferrer"
              className="w-full py-3 px-6 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition"
            >
              <span>🔄 Re-open from Telegram Bot</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen min-h-[100dvh] w-full max-w-full overflow-x-hidden flex flex-col ${
        theme === 'golden'
          ? 'theme-golden bg-[#150d0a] text-amber-50'
          : theme === 'light'
          ? 'theme-light bg-slate-100 text-slate-900'
          : 'theme-dark bg-slate-950 text-slate-100'
      } font-sans transition-colors duration-300`}
    >
      {/* Main App Header */}
      <HeaderBar
        user={currentUser}
        isLoggedIn={isLoggedIn}
        registrationBonusCredit={registrationBonusCredit}
        onOpenDeposit={() => setActiveTab('wallet')}
        onOpenAuth={() => setIsAuthOpen(true)}
        onOpenPhoneVerification={() => setIsPhoneVerificationOpen(true)}
        language={language}
        onToggleLanguage={() => setLanguage(language === 'am' ? 'en' : 'am')}
        theme={theme}
        onSelectTheme={handleSelectTheme}
      />

      {/* Page Views Content Container */}
      <main className="max-w-3xl mx-auto px-2.5 sm:px-4 pt-3 sm:pt-5 w-full min-w-0 flex-1">
        {isMaintenanceMode ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-5 shadow-2xl my-8">
            <div className="w-20 h-20 mx-auto bg-amber-500/10 border-2 border-amber-500/40 rounded-3xl flex items-center justify-center text-amber-400 shadow-xl animate-pulse">
              <Wrench className="w-10 h-10" />
            </div>
            <div>
              <h2 className="text-xl font-black text-white">System Under Maintenance</h2>
              <p className="text-slate-400 text-xs mt-2 max-w-md mx-auto leading-relaxed">
                The platform is currently undergoing scheduled maintenance and system optimization. All active game rooms and wallet services will resume shortly.
              </p>
            </div>
          </div>
        ) : (
          <>
            {selectedCardRoom ? (
          <CardSelectionView
            room={selectedCardRoom}
            user={currentUser}
            messages={chatMessages}
            onSendMessage={handleSendMessage}
            onBack={() => setSelectedCardRoom(null)}
            onCardPurchased={(ticket) => {
              setUserTickets((prev) => {
                if (prev.some((t) => t.id === ticket.id)) return prev;
                return [...prev, ticket];
              });
            }}
            onCardDeselected={(cardNumber) => {
              if (selectedCardRoom) {
                setUserTickets((prev) =>
                  prev.filter((t) => !(t.roomId === selectedCardRoom.id && t.cardNumber === cardNumber))
                );
              }
            }}
            onEnterGame={() => {
              const targetRoom = selectedCardRoom;
              setSelectedCardRoom(null);
              setActiveRoom(targetRoom);
              setActiveTab('active_game');
              if (socket) {
                socket.emit('room:join', { roomId: targetRoom.id, userId: currentUser.id });
              }
            }}
            language={language}
            socket={socket}
          />
        ) : (
          <>
            {activeTab === 'home' && (
              <HomeView
                rooms={rooms}
                user={currentUser}
                onJoinRoom={handleJoinRoom}
                onSelectRoom={(room) => {
                  if (!currentUser.phone || !currentUser.phone.trim()) {
                    setIsPhoneVerificationOpen(true);
                    return;
                  }
                  setSelectedCardRoom(room);
                  if (socket) {
                    socket.emit('room:join', { roomId: room.id, userId: currentUser.id });
                  }
                }}
                onNavigateTab={(tab) => setActiveTab(tab as any)}
                onCreatePrivateGroup={() => {
                  if (!currentUser.phone || !currentUser.phone.trim()) {
                    setIsPhoneVerificationOpen(true);
                    return;
                  }
                  setIsCreateGroupOpen(true);
                }}
                onJoinPrivateGroupCode={() => {
                  if (!currentUser.phone || !currentUser.phone.trim()) {
                    setIsPhoneVerificationOpen(true);
                    return;
                  }
                  setIsJoinGroupCodeOpen(true);
                }}
                onOpenPrivateGroupLobby={(groupId) => {
                  if (!currentUser.phone || !currentUser.phone.trim()) {
                    setIsPhoneVerificationOpen(true);
                    return;
                  }
                  setActivePrivateGroupId(groupId);
                }}
                onRefreshRooms={fetchData}
                onOpenPhoneVerification={() => setIsPhoneVerificationOpen(true)}
                language={language}
                onlineUsersCount={onlineUsersCount}
                isLoggedIn={isLoggedIn}
                socket={socket}
              />
            )}

            {activeTab === 'active_game' && activeRoom && (
              <ActiveGameView
                room={activeRoom}
                tickets={userTickets.filter(
                  (t) =>
                    t.roomId === activeRoom.id &&
                    (!activeRoom.gameReferenceId || !t.gameReferenceId || t.gameReferenceId === activeRoom.gameReferenceId) &&
                    t.status === 'ACTIVE'
                )}
                user={currentUser}
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                onClaimBingo={handleClaimBingo}
                onReturnToCardSelection={() => {
                  if (activeRoom.id.startsWith('grp_')) {
                    const grpId = activeRoom.id;
                    setActiveRoom(null);
                    setActiveTab('home');
                    setActivePrivateGroupId(grpId);
                  } else {
                    const roomToSelect = rooms.find((r) => r.id === activeRoom.id) || activeRoom;
                    setSelectedCardRoom(roomToSelect);
                    setActiveRoom(null);
                  }
                }}
                onPlayAgain={async () => {
                  if (activeRoom.id.startsWith('grp_')) {
                    await fetch(apiUrl('/api/private-groups/play-again'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ groupId: activeRoom.id, hostUserId: currentUser.id }),
                    });
                  }
                }}
                onCloseGroup={async () => {
                  if (activeRoom.id.startsWith('grp_')) {
                    await fetch(apiUrl('/api/private-groups/close-group'), {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ groupId: activeRoom.id, hostUserId: currentUser.id }),
                    });
                  }
                }}
                isHost={Boolean(activeRoom.id.startsWith('grp_') && ((activeRoom as any).hostId === currentUser.id))}
                language={language}
                socket={socket}
              />
            )}

            {activeTab === 'active_game' && !activeRoom && (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-4 my-8">
                <h3 className="text-lg font-black text-white">No Active Bingo Arena Selected</h3>
                <p className="text-xs text-slate-400">Select an active room from the Home view to buy tickets and join the live draw.</p>
                <button
                  onClick={() => setActiveTab('home')}
                  className="px-6 py-2.5 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs"
                >
                  Go to Arenas
                </button>
              </div>
            )}

            {activeTab === 'wallet' && (
              <WalletView
                user={currentUser}
                transactions={transactions}
                onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
                onOpenPhoneVerification={() => setIsPhoneVerificationOpen(true)}
                language={language}
              />
            )}

            {activeTab === 'history' && (
              <GameHistoryView user={currentUser} language={language} />
            )}

            {activeTab === 'bonuses' && (
              <BonusesView
                user={currentUser}
                referralStat={referralStat}
                onSpinWheel={handleSpinWheel}
                onOpenPhoneVerification={() => setIsPhoneVerificationOpen(true)}
                language={language}
              />
            )}

            {activeTab === 'leaderboard' && (
              <LeaderboardView entries={leaderboard} language={language} />
            )}

            {activeTab === 'help' && (
              <HelpView
                user={currentUser}
                isLoggedIn={isLoggedIn}
                language={language}
                onNavigateTab={(tab) => {
                  setActiveTab(tab);
                  if (tab === 'home') {
                    setSelectedCardRoom(null);
                    setActiveRoom(null);
                  }
                }}
                onOpenPhoneVerification={() => setIsPhoneVerificationOpen(true)}
                onOpenAuth={() => setIsAuthOpen(true)}
                onCreatePrivateGroup={() => setIsCreateGroupOpen(true)}
                onJoinPrivateGroupCode={() => setIsJoinGroupCodeOpen(true)}
              />
            )}
          </>
        )}
      </>
    )}
  </main>

      {/* Bottom Navigation */}
      <Navigation
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        hasActiveGameRoom={Boolean(activeRoom)}
        language={language}
      />

      {/* Account & Security Modal */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        isLoggedIn={isLoggedIn}
        language={language}
        referralCode={referralCode}
        onOpenPhoneVerification={() => setIsPhoneVerificationOpen(true)}
        onAuthSuccess={(user) => {
          setCurrentUser(user);
          setIsLoggedIn(true);
          setIsAuthOpen(false);
        }}
        onLogout={() => {
          setIsLoggedIn(false);
          localStorage.removeItem('ahun_jwt_token');
          setCurrentUser(DEMO_USERS[0]);
        }}
      />

      {/* Telegram Phone Verification Modal */}
      <TelegramPhoneVerificationModal
        isOpen={isPhoneVerificationOpen}
        onClose={() => setIsPhoneVerificationOpen(false)}
        user={currentUser}
        language={language}
        onVerificationSuccess={(updatedUser) => {
          setCurrentUser(updatedUser);
        }}
        onOpenBotSimulator={() => setIsBotOpen(true)}
      />

      {/* Private Group Modals */}
      <CreatePrivateGroupModal
        user={currentUser}
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        onCreated={(group) => {
          setActivePrivateGroupId(group.id);
        }}
        language={language}
      />

      <JoinPrivateGroupModal
        user={currentUser}
        isOpen={isJoinGroupCodeOpen}
        onClose={() => setIsJoinGroupCodeOpen(false)}
        onJoined={(group) => {
          setActivePrivateGroupId(group.id);
        }}
        language={language}
      />

      {activePrivateGroupId && (
        <PrivateGroupLobbyModal
          user={currentUser}
          groupId={activePrivateGroupId}
          isOpen={Boolean(activePrivateGroupId)}
          onClose={() => setActivePrivateGroupId(null)}
          socket={socket}
          onPlayActiveGame={(group, tickets) => {
            const formatted = formatPrivateGroupToRoom(group);
            if (formatted) {
              formatted.status = 'PLAYING';
              setActiveRoom(formatted);
              if (Array.isArray(tickets) && tickets.length > 0) {
                setUserTickets((prev) => {
                  const existingIds = new Set(tickets.map((t) => t.id));
                  const remaining = prev.filter((t) => !existingIds.has(t.id));
                  return [...remaining, ...tickets];
                });
              }
              setActivePrivateGroupId(null);
              setActiveTab('active_game');
            }
          }}
          language={language}
        />
      )}

      {/* Telegram Registration Bot Gateway Simulator Modal */}
      <TelegramBotModal
        isOpen={isBotOpen}
        onClose={() => setIsBotOpen(false)}
        currentUser={currentUser}
        onAuthSuccess={(regUser) => {
          setCurrentUser(regUser);
          setIsLoggedIn(true);
          setIsGateOpen(false);
          setIsBotOpen(false);
        }}
      />

      {/* Registration Gate Overlay Modal */}
      <RegistrationGateModal
        isOpen={isGateOpen}
        onOpenBot={() => {
          setIsGateOpen(false);
          setIsBotOpen(true);
        }}
      />

      {/* Confetti Celebration Animation */}
      <ConfettiOverlay trigger={Boolean(winNotification)} />

      {/* OFF-PAGE BINGO WIN CELEBRATION MODAL */}
      {winNotification && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in">
          <div className="bg-gradient-to-b from-amber-950 via-slate-900 to-slate-950 border-2 border-amber-500/60 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/20 rounded-full blur-3xl pointer-events-none" />
            
            <div className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 border-2 border-amber-400/50 flex items-center justify-center text-3xl animate-bounce shadow-lg shadow-amber-500/30">
              🏆
            </div>

            <div>
              <h3 className="text-xl font-black text-amber-300 tracking-wide">
                {winNotification.title}
              </h3>
              <p className="text-xs text-slate-300 mt-2 leading-relaxed">
                {winNotification.message}
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/90 border border-amber-500/30 space-y-1">
              <span className="text-[10px] text-amber-400 font-bold uppercase tracking-wider">
                {language === 'am' ? 'የተጨመረው ሽልማት' : 'Prize Credited'}
              </span>
              <div className="text-2xl font-black text-emerald-400">
                +{winNotification.prizeAmount} Birr
              </div>
              <div className="text-[11px] text-slate-300">
                {language === 'am' ? 'አዲሱ የቦርሳዎ ሂሳብ:' : 'Updated Wallet Balance:'} <strong className="text-amber-300">{currentUser.walletBalance} Birr</strong>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setWinNotification(null);
                  setActiveTab('wallet');
                }}
                className="flex-1 py-3 px-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-black transition"
              >
                {language === 'am' ? 'ቦርሳ ይመልከቱ' : 'View Wallet'}
              </button>

              <button
                onClick={() => setWinNotification(null)}
                className="flex-1 py-3 px-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 text-xs font-black shadow-lg shadow-emerald-500/20 transition"
              >
                {language === 'am' ? 'እሺ (ቀጥል)' : 'Great, Got it!'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PLATFORM BROADCAST ANNOUNCEMENT POPUP MODAL */}
      {activeAnnouncement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
          <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-amber-500/60 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl space-y-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
            
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/20 border border-amber-400/50 flex items-center justify-center text-2xl shadow-lg shadow-amber-500/20">
              📢
            </div>

            <div className="space-y-1.5">
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
                {language === 'am' ? 'ይፋዊ ማስታወቂያ' : 'Official Announcement'}
              </span>
              <h3 className="text-lg font-black text-white tracking-wide pt-1">
                {activeAnnouncement.title}
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed max-h-48 overflow-y-auto whitespace-pre-wrap p-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-left">
                {activeAnnouncement.message}
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setActiveAnnouncement(null)}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/25 transition"
              >
                {language === 'am' ? 'ገባኝ (አረጋግጥ)' : 'Understood'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
