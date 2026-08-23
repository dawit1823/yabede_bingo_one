import React, { useEffect, useState, useCallback, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { initTelegramApp, triggerHaptic } from './lib/telegramSDK';
import { audioEngine } from './lib/audioEngine';
import { logger } from '@shared/logger';
import {
  BingoRoom,
  BingoTicket,
  ChatMessage,
  LeaderboardEntry,
  ReferralStat,
  UserProfile,
  WalletTransaction,
} from '@shared/types';

// Mini App Components
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
import { AuthModal } from './components/AuthModal';
import { CreatePrivateGroupModal } from './components/CreatePrivateGroupModal';
import { JoinPrivateGroupModal } from './components/JoinPrivateGroupModal';
import { PrivateGroupLobbyModal } from './components/PrivateGroupLobbyModal';
import { TelegramBotModal } from './components/TelegramBotModal';
import { RegistrationGateModal } from './components/RegistrationGateModal';
import { Wrench } from 'lucide-react';
import { getRemainingSeconds } from '@shared/bingoUtils';
import { apiUrl, getSocketUrl } from '@shared/apiConfig';

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

  const handleSelectTheme = (newTheme: ThemeMode) => {
    setTheme(newTheme);
    localStorage.setItem('yabede_theme', newTheme);
  };
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

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

  // Initialize Telegram App & Real WebApp Session Verification
  useEffect(() => {
    initTelegramApp();

    const initData = window.Telegram?.WebApp?.initData || '';

    if (initData) {
      fetch(apiUrl('/api/auth/telegram'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData }),
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (res.ok && (data.authenticated || data.success) && data.user) {
            setCurrentUser(data.user);
            setIsLoggedIn(true);
            setTgAuthStatus('authenticated');
            if (data.token) {
              localStorage.setItem('ahun_jwt_token', data.token);
              localStorage.setItem('ahun_user_id', data.user.id);
            }
          } else if (
            res.status === 503 ||
            data.error === 'FIRESTORE_QUOTA_EXCEEDED' ||
            (data.message && data.message.toLowerCase().includes('quota'))
          ) {
            setTgAuthStatus('auth_error');
            setTgAuthErrorMessage(
              data.message || 'Database quota limit reached. Please try again in a few moments.'
            );
          } else if (res.status === 401 || data.error === 'INVALID_SIGNATURE') {
            setTgAuthStatus('auth_error');
            setTgAuthErrorMessage(
              data.message || 'Telegram WebApp authentication signature check failed. Please open from Telegram.'
            );
          } else {
            setTgAuthStatus('auth_error');
            setTgAuthErrorMessage(data.message || data.error || 'Authentication service error');
          }
        })
        .catch((netErr) => {
          setTgAuthStatus('auth_error');
          setTgAuthErrorMessage('Could not connect to authentication service: ' + (netErr?.message || 'Network error'));
        });
    } else {
      setTgAuthStatus('outside_telegram');
    }
  }, []);

  // Connect to Authoritative Render Socket.IO server
  useEffect(() => {
    const socketUrl = getSocketUrl();
    const newSocket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      logger.info('Connected to Ahun Bingo backend Socket.IO');
      newSocket.emit('users:get_online_count');
      if (currentUser?.id) {
        newSocket.emit('user:register', { userId: currentUser.id });
      }
    });

    newSocket.on('presence:online_count', (data: { count: number }) => {
      if (data && typeof data.count === 'number') {
        setOnlineUsersCount(data.count);
      }
    });

    newSocket.on('rooms:updated', (data: { rooms: BingoRoom[] }) => {
      if (data && data.rooms && Array.isArray(data.rooms)) {
        setRooms(data.rooms);
        setActiveRoom((prev) => {
          if (!prev) return null;
          const updated = data.rooms.find((r) => r.id === prev.id);
          return updated || prev;
        });
      }
    });

    newSocket.on('room:updated', (data: { room: BingoRoom }) => {
      if (data && data.room) {
        setRooms((prevRooms) =>
          prevRooms.map((r) => (r.id === data.room.id ? data.room : r))
        );
        setActiveRoom((prevActive) =>
          prevActive && prevActive.id === data.room.id ? data.room : prevActive
        );
        setSelectedCardRoom((prevSelected) =>
          prevSelected && prevSelected.id === data.room.id ? data.room : prevSelected
        );
      }
    });

    newSocket.on('game:countdown', (data: { roomId: string; countdownSeconds: number }) => {
      setRooms((prev) =>
        prev.map((r) =>
          r.id === data.roomId ? { ...r, countdownSeconds: data.countdownSeconds } : r
        )
      );
      setActiveRoom((prev) =>
        prev && prev.id === data.roomId ? { ...prev, countdownSeconds: data.countdownSeconds } : prev
      );
    });

    newSocket.on('game:ball_drawn', (data: { roomId: string; ball: number; drawnBalls: number[]; room?: BingoRoom }) => {
      audioEngine.playPop();
      audioEngine.speakBallDraw(data.ball, language);
      if (data.room) {
        setRooms((prev) => prev.map((r) => (r.id === data.room!.id ? data.room! : r)));
        setActiveRoom((prev) => (prev && prev.id === data.room!.id ? data.room! : prev));
      }
    });

    newSocket.on('game:winner', (data: { roomId: string; winners: any[]; prizeAmount: number; pattern: string }) => {
      audioEngine.playWin();
      triggerHaptic('heavy');
      if (data.winners && data.winners.length > 0) {
        const myWin = data.winners.find((w: any) => w.userId === currentUser.id);
        if (myWin) {
          setWinNotification({
            title: language === 'am' ? '🎉 እንኳን ደስ አለዎት! አሸንፈዋል!' : '🎉 Congratulations! You Won!',
            message: language === 'am' ? `በቢንጎ ጨዋታ ${data.prizeAmount || myWin.prizeAmount || 0} ብር አሸንፈዋል!` : `You won ${data.prizeAmount || myWin.prizeAmount || 0} Birr in Bingo!`,
            prizeAmount: data.prizeAmount || myWin.prizeAmount || 0,
            roomName: activeRoom?.name || 'Bingo Game',
          });
        }
      }
    });

    newSocket.on('game:reset', (data: { roomId: string; room?: BingoRoom }) => {
      if (data?.room) {
        setRooms((prev) => prev.map((r) => (r.id === data.room!.id ? data.room! : r)));
        setActiveRoom((prev) => (prev && prev.id === data.room!.id ? data.room! : prev));
      }
      setUserTickets([]);
    });

    newSocket.on('system:maintenance_mode', (data: { enabled: boolean }) => {
      setIsMaintenanceMode(Boolean(data.enabled));
    });

    newSocket.on('settings:updated', (data: { settings?: any; registrationBonusCredit?: number }) => {
      if (data?.settings?.maintenanceMode !== undefined) {
        setIsMaintenanceMode(Boolean(data.settings.maintenanceMode));
      }
      if (typeof data?.registrationBonusCredit === 'number') {
        setRegistrationBonusCredit(data.registrationBonusCredit);
      }
    });

    newSocket.on('bonus:updated', (data: { bonusCredit?: number; registrationBonusCredit?: number }) => {
      if (typeof data?.registrationBonusCredit === 'number') {
        setRegistrationBonusCredit(data.registrationBonusCredit);
      }
    });

    newSocket.on('wallet:updated', (data: { userId: string; newBalance?: number; bonusBalance?: number }) => {
      if (data && data.userId === currentUser.id) {
        setCurrentUser((prev) => ({
          ...prev,
          walletBalance: typeof data.newBalance === 'number' ? data.newBalance : prev.walletBalance,
          bonusBalance: typeof data.bonusBalance === 'number' ? data.bonusBalance : prev.bonusBalance,
        }));
        // Refresh transaction list
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

    newSocket.on('ticket:bought', (data: { roomId: string; ticket: BingoTicket; userId: string }) => {
      if (data && data.userId === currentUser.id && data.ticket) {
        setUserTickets((prev) => {
          const exists = prev.some((t) => t.id === data.ticket.id);
          return exists ? prev.map((t) => (t.id === data.ticket.id ? data.ticket : t)) : [...prev, data.ticket];
        });
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
    };
  }, [language, currentUser.id]);

  // Fetch initial rooms, wallet transactions, leaderboard
  const refreshRooms = useCallback(() => {
    fetch(apiUrl('/api/rooms'))
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data)) {
          setRooms(data);
        }
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    refreshRooms();
    const interval = setInterval(refreshRooms, 5000);
    return () => clearInterval(interval);
  }, [refreshRooms]);

  // User Profile Refresh
  const refreshUserProfile = useCallback(() => {
    if (!currentUser.id) return;
    fetch(apiUrl(`/api/user/profile?userId=${currentUser.id}`))
      .then((res) => res.json())
      .then((profile) => {
        if (profile && profile.id) {
          setCurrentUser(profile);
        }
      })
      .catch(() => null);
  }, [currentUser.id]);

  useEffect(() => {
    refreshUserProfile();
  }, [refreshUserProfile]);

  const handleSelectRoom = (room: BingoRoom) => {
    setSelectedCardRoom(room);
    triggerHaptic('medium');
  };

  const handleJoinActiveGame = (room: BingoRoom, ticketCount: number = 0) => {
    setActiveRoom(room);
    setSelectedCardRoom(null);
    setActiveTab('active_game');
    triggerHaptic('medium');

    if (socket) {
      socket.emit('join_room', { roomId: room.id, userId: currentUser.id });
    }
  };

  const handleClaimBingo = (ticketId: string) => {
    if (!activeRoom) return;
    fetch(apiUrl(`/api/rooms/${activeRoom.id}/claim-bingo`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId, userId: currentUser.id }),
    })
      .then((res) => res.json())
      .then((resData) => {
        if (resData.success) {
          triggerHaptic('heavy');
        }
      })
      .catch(() => null);
  };

  return (
    <div className={`min-h-screen ${theme === 'golden' ? 'theme-golden' : theme === 'light' ? 'theme-light' : 'bg-slate-950'} text-slate-100 flex flex-col`}>
      {/* Top Simulator bar on desktop viewports */}
      <TelegramSimulatorBar
        currentUser={currentUser}
        demoUsers={DEMO_USERS}
        onSwitchUser={(user) => {
          setCurrentUser(user);
          setIsLoggedIn(true);
        }}
        onOpenBot={() => setIsBotOpen(true)}
        onlineUsersCount={onlineUsersCount}
      />

      {/* Main Header Bar */}
      <HeaderBar
        user={currentUser}
        isLoggedIn={isLoggedIn}
        registrationBonusCredit={registrationBonusCredit}
        onOpenDeposit={() => setActiveTab('wallet')}
        onOpenAuth={() => setIsAuthOpen(true)}
        language={language}
        theme={theme}
        onSelectTheme={handleSelectTheme}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-3 sm:p-4 pb-20">
        {isMaintenanceMode && (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 mb-4 flex items-center gap-3 text-amber-300">
            <Wrench className="w-5 h-5 shrink-0" />
            <div className="text-xs">
              <span className="font-bold">System Notice:</span> Scheduled maintenance in progress. Games will resume shortly.
            </div>
          </div>
        )}

        {/* Home Tab */}
        {activeTab === 'home' && !selectedCardRoom && (
          <HomeView
            rooms={rooms}
            user={currentUser}
            onSelectRoom={handleSelectRoom}
            onJoinRoom={handleJoinActiveGame}
            onNavigateTab={(t) => setActiveTab(t)}
            onCreatePrivateGroup={() => setIsCreateGroupOpen(true)}
            onJoinPrivateGroupCode={() => setIsJoinGroupCodeOpen(true)}
            onOpenPrivateGroupLobby={(grpId) => setActivePrivateGroupId(grpId)}
            onRefreshRooms={refreshRooms}
            language={language}
            onlineUsersCount={onlineUsersCount}
            isLoggedIn={isLoggedIn}
          />
        )}

        {/* Card Selection Grid */}
        {selectedCardRoom && (
          <CardSelectionView
            room={selectedCardRoom}
            user={currentUser}
            onBack={() => setSelectedCardRoom(null)}
            onProceedToGame={(ticketsCount) => handleJoinActiveGame(selectedCardRoom, ticketsCount)}
            onOpenDeposit={() => setActiveTab('wallet')}
            onUpdateBalance={(newBal) => setCurrentUser((prev) => ({ ...prev, walletBalance: newBal }))}
            language={language}
            socket={socket}
          />
        )}

        {/* Live Active Game */}
        {activeTab === 'active_game' && (
          <ActiveGameView
            room={activeRoom || rooms[0]}
            tickets={userTickets}
            user={currentUser}
            messages={chatMessages}
            onSendMessage={(txt) => {
              if (socket && activeRoom) {
                socket.emit('chat:send', { roomId: activeRoom.id, userId: currentUser.id, username: currentUser.username, text: txt });
              }
            }}
            onClaimBingo={handleClaimBingo}
            onReturnToCardSelection={() => {
              if (activeRoom) {
                setSelectedCardRoom(activeRoom);
                setActiveTab('home');
              }
            }}
            onPlayAgain={() => {
              if (activeRoom) {
                setSelectedCardRoom(activeRoom);
                setActiveTab('home');
              }
            }}
            language={language}
            socket={socket}
          />
        )}

        {/* Wallet & Banking Tab */}
        {activeTab === 'wallet' && (
          <WalletView
            user={currentUser}
            transactions={transactions}
            onUpdateBalance={(newBal) => setCurrentUser((prev) => ({ ...prev, walletBalance: newBal }))}
            language={language}
          />
        )}

        {/* Bonuses & Rewards Tab */}
        {activeTab === 'bonuses' && (
          <BonusesView
            user={currentUser}
            referralStat={referralStat}
            onUpdateBalance={(newBal) => setCurrentUser((prev) => ({ ...prev, walletBalance: newBal }))}
            onUpdateBonus={(newBonus) => setCurrentUser((prev) => ({ ...prev, bonusBalance: newBonus }))}
            language={language}
          />
        )}

        {/* Leaderboard Tab */}
        {activeTab === 'leaderboard' && (
          <LeaderboardView
            leaderboard={leaderboard}
            currentUser={currentUser}
            language={language}
          />
        )}

        {/* Game History Tab */}
        {activeTab === 'history' && (
          <GameHistoryView
            userId={currentUser.id}
            language={language}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      <Navigation
        activeTab={activeTab}
        onChangeTab={(tab) => {
          setSelectedCardRoom(null);
          setActiveTab(tab);
        }}
        hasActiveGameRoom={Boolean(activeRoom)}
        language={language}
      />

      {/* Modals */}
      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        currentUser={currentUser}
        isLoggedIn={isLoggedIn}
        onAuthSuccess={(user, token) => {
          setCurrentUser(user);
          setIsLoggedIn(true);
          setIsAuthOpen(false);
          localStorage.setItem('ahun_jwt_token', token);
        }}
        onLogout={() => {
          setIsLoggedIn(false);
          localStorage.removeItem('ahun_jwt_token');
          setCurrentUser(DEMO_USERS[0]);
        }}
      />

      <CreatePrivateGroupModal
        isOpen={isCreateGroupOpen}
        onClose={() => setIsCreateGroupOpen(false)}
        user={currentUser}
        onCreated={(grp) => {
          setIsCreateGroupOpen(false);
          setActivePrivateGroupId(grp.id);
        }}
        language={language}
      />

      <JoinPrivateGroupModal
        isOpen={isJoinGroupCodeOpen}
        onClose={() => setIsJoinGroupCodeOpen(false)}
        user={currentUser}
        onJoined={(grp) => {
          setIsJoinGroupCodeOpen(false);
          setActivePrivateGroupId(grp.id);
        }}
        language={language}
      />

      {activePrivateGroupId && (
        <PrivateGroupLobbyModal
          groupId={activePrivateGroupId}
          isOpen={Boolean(activePrivateGroupId)}
          onClose={() => setActivePrivateGroupId(null)}
          user={currentUser}
          language={language}
          socket={socket}
        />
      )}

      <TelegramBotModal
        isOpen={isBotOpen}
        onClose={() => setIsBotOpen(false)}
        language={language}
      />

      <RegistrationGateModal
        isOpen={isGateOpen}
        onClose={() => setIsGateOpen(false)}
        onOpenBot={() => {
          setIsGateOpen(false);
          setIsBotOpen(true);
        }}
        bonusAmount={registrationBonusCredit}
        language={language}
      />
    </div>
  );
}
