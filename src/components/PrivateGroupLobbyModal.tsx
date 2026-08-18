import React, { useState, useEffect } from 'react';
import { UserProfile, PrivateGroup, GroupMember, GroupMessage, BingoRoom } from '../types';
import { CardSelectionView } from './CardSelectionView';
import { formatCardNumber } from '../lib/bingoUtils';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import {
  Users,
  Copy,
  Share2,
  Coins,
  Play,
  UserPlus,
  Trash2,
  Send,
  MessageSquare,
  ShieldCheck,
  X,
  CheckCircle2,
  Clock,
  Sparkles,
  Ban,
  RefreshCw
} from 'lucide-react';

interface PrivateGroupLobbyModalProps {
  user: UserProfile;
  groupId: string;
  isOpen: boolean;
  onClose: () => void;
  onPlayActiveGame: (group: PrivateGroup, tickets: any[]) => void;
  language: 'en' | 'am';
  socket?: any;
}

export const PrivateGroupLobbyModal: React.FC<PrivateGroupLobbyModalProps> = ({
  user,
  groupId,
  isOpen,
  onClose,
  onPlayActiveGame,
  language,
  socket,
}) => {
  const [group, setGroup] = useState<PrivateGroup | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [userTickets, setUserTickets] = useState<any[]>([]);
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [inviteInput, setInviteInput] = useState('');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [chatText, setChatText] = useState('');
  const [activeTab, setActiveTab] = useState<'lobby' | 'chat'>('lobby');
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showCardSelection, setShowCardSelection] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch initial details
  const fetchGroupDetails = async () => {
    try {
      const res = await fetch(apiUrl(`/api/private-groups/details/${groupId}`));
      if (res.ok) {
        const data = await res.json();
        if (data.group) {
          setGroup(data.group);
          setMembers(data.members || []);
          setMessages(data.messages || []);

          // Fetch user tickets for this private group
          const tktRes = await fetch(apiUrl(`/api/bingo/room-status/${groupId}?userId=${user.id}`));
          if (tktRes.ok) {
            const tktData = await tktRes.json();
            if (tktData && tktData.myTickets) {
              setUserTickets(tktData.myTickets);
            }
          }
        }
      }
    } catch {
      // Ignore network polling interruptions
    }
  };

  const handleManualRefreshGroup = async () => {
    if (isRefreshing) return;
    try {
      setIsRefreshing(true);
      triggerHaptic('light');
      await fetchGroupDetails();
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (isOpen && groupId) {
      fetchGroupDetails();
      const interval = setInterval(fetchGroupDetails, 3000);

      // Join socket room for this private group
      if (socket) {
        socket.emit('room:join', { roomId: groupId, userId: user.id });

        const handleGroupUpdated = (data: { group?: PrivateGroup; members?: GroupMember[] }) => {
          if (data.group && data.group.id === groupId) {
            setGroup(data.group);
            if (data.members) setMembers(data.members);
          }
        };

        const handleStatsUpdated = (data: { groupId?: string; prizePool?: number; ticketsSold?: number; activePlayersCount?: number }) => {
          if (data.groupId === groupId) {
            setGroup((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                prizePool: typeof data.prizePool === 'number' ? data.prizePool : prev.prizePool,
                ticketsSold: typeof data.ticketsSold === 'number' ? data.ticketsSold : prev.ticketsSold,
                activePlayersCount: typeof data.activePlayersCount === 'number' ? data.activePlayersCount : prev.activePlayersCount,
              };
            });
          }
        };

        const handleGroupStarted = (data: { groupId: string; group: PrivateGroup }) => {
          if (data.groupId === groupId && data.group) {
            setGroup(data.group);
            onPlayActiveGame(data.group, userTickets);
          }
        };

        const handleGroupCancelled = (data: { groupId: string; group?: PrivateGroup; reason?: string }) => {
          if (data.groupId === groupId) {
            if (data.group) setGroup(data.group);
            alert(`Private group game cancelled: ${data.reason || 'Cancelled by host'}. All tickets have been refunded.`);
            onClose();
          }
        };

        socket.on('private_group:updated', handleGroupUpdated);
        socket.on('private_group:stats_updated', handleStatsUpdated);
        socket.on('private_group:started', handleGroupStarted);
        socket.on('private_group:cancelled', handleGroupCancelled);

        return () => {
          clearInterval(interval);
          socket.emit('room:leave', { roomId: groupId, userId: user.id });
          socket.off('private_group:updated', handleGroupUpdated);
          socket.off('private_group:stats_updated', handleStatsUpdated);
          socket.off('private_group:started', handleGroupStarted);
          socket.off('private_group:cancelled', handleGroupCancelled);
        };
      }

      return () => clearInterval(interval);
    }
  }, [isOpen, groupId, socket, user.id]);

  if (!isOpen || !group) return null;

  if (showCardSelection && group) {
    const groupRoom: BingoRoom = {
      id: group.id,
      name: group.name,
      description: `Private Group Game (Code: ${group.code})`,
      icon: '🎟️',
      ticketPrice: group.ticketPrice,
      minPlayers: 2,
      maxPlayers: group.maxPlayers,
      status: group.status === 'LOBBY' ? 'WAITING' : group.status === 'COUNTDOWN' ? 'COUNTDOWN' : group.status === 'PLAYING' ? 'PLAYING' : 'FINISHED',
      currentBall: group.currentBall ?? null,
      drawnBalls: group.drawnBalls || [],
      winningPatterns: [group.winningPattern],
      prizePool: group.prizePool,
      countdownSeconds: group.countdownSeconds || 0,
      activePlayersCount: members.length,
      createdAt: group.createdAt,
    };

    return (
      <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col overflow-y-auto">
        <CardSelectionView
          room={groupRoom}
          user={user}
          onBack={() => {
            setShowCardSelection(false);
            fetchGroupDetails();
          }}
          onCardPurchased={(ticket) => {
            setUserTickets((prev) => {
              if (prev.some((t) => t.id === ticket.id)) return prev;
              return [...prev, ticket];
            });
            fetchGroupDetails();
          }}
          onCardDeselected={(cardNumber) => {
            setUserTickets((prev) => prev.filter((t) => !(t.roomId === group.id && t.cardNumber === cardNumber)));
            fetchGroupDetails();
          }}
          onEnterGame={() => {
            setShowCardSelection(false);
            onPlayActiveGame(group, userTickets);
          }}
          language={language}
          socket={socket}
        />
      </div>
    );
  }

  const isHost = group.hostId === user.id;
  const currentMember = members.find((m) => m.userId === user.id);
  const isReady = currentMember?.status === 'READY';
  const myTicketCount = currentMember?.ticketCount || 0;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(group.code);
    setCopiedCode(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleShareLink = () => {
    const inviteUrl = `https://t.me/yabede_bingo_bot/app?startapp=group_${group.code}`;
    if (navigator.share) {
      navigator.share({
        title: `Join my Bingo Game: ${group.name}`,
        text: `🎟️ Join my private Bingo game on Yabede Bingo! Code: ${group.code}. Ticket Price: ${group.ticketPrice} Birr.`,
        url: inviteUrl,
      });
    } else {
      navigator.clipboard.writeText(inviteUrl);
      alert('Invitation link copied to clipboard!');
    }
    triggerHaptic('medium');
  };

  const handleBuyTickets = async () => {
    setLoading(true);
    setActionError(null);

    try {
      const res = await fetch(apiUrl('/api/private-groups/buy-tickets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          userId: user.id,
          count: ticketQuantity,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to buy tickets');
      }

      triggerHaptic('heavy');
      setUserTickets((prev) => [...prev, ...data.tickets]);
      fetchGroupDetails();
    } catch (err: any) {
      setActionError(err.message || 'Ticket purchase failed');
      triggerHaptic('heavy');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleReady = async () => {
    setActionError(null);
    try {
      const res = await fetch(apiUrl('/api/private-groups/toggle-ready'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          userId: user.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to toggle ready state');
      }

      triggerHaptic('medium');
      fetchGroupDetails();
    } catch (err: any) {
      setActionError(err.message || 'Error toggling ready state');
    }
  };

  const handleStartGame = async () => {
    setActionError(null);
    try {
      const res = await fetch(apiUrl('/api/private-groups/start'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          hostUserId: user.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to start game');
      }

      triggerHaptic('heavy');
      fetchGroupDetails();
    } catch (err: any) {
      setActionError(err.message || 'Error starting game');
    }
  };

  const handleCancelGame = async () => {
    if (!confirm('Are you sure you want to cancel this game? All tickets will be 100% refunded to players.')) {
      return;
    }

    setActionError(null);
    try {
      const res = await fetch(apiUrl('/api/private-groups/cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          hostUserId: user.id,
          reason: 'Cancelled by Host',
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel game');
      }

      triggerHaptic('medium');
      fetchGroupDetails();
    } catch (err: any) {
      setActionError(err.message || 'Error cancelling game');
    }
  };

  const handleSendInvite = async () => {
    if (!inviteInput.trim()) return;
    setActionError(null);

    try {
      const res = await fetch(apiUrl('/api/private-groups/invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          invitedIdentifier: inviteInput.trim(),
          hostUserId: user.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Invitation failed');
      }

      triggerHaptic('light');
      setInviteInput('');
      setShowInviteModal(false);
      fetchGroupDetails();
    } catch (err: any) {
      setActionError(err.message || 'Failed to invite user');
    }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!confirm('Remove member and refund their tickets?')) return;

    try {
      const res = await fetch(apiUrl('/api/private-groups/remove-member'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          groupId: group.id,
          targetUserId,
          hostUserId: user.id,
        }),
      });

      if (res.ok) {
        triggerHaptic('medium');
        fetchGroupDetails();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSendChat = async () => {
    if (!chatText.trim()) return;

    const newMsg: GroupMessage = {
      id: `gmsg_${Date.now()}`,
      groupId: group.id,
      userId: user.id,
      username: user.username,
      text: chatText.trim(),
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, newMsg]);
    setChatText('');

    try {
      // Send chat
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-end sm:items-center justify-center p-2 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] flex flex-col justify-between overflow-hidden">
        {/* Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xl">
              🎟️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-white">{group.name}</h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-black tracking-wide border ${
                    group.status === 'PLAYING'
                      ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                      : group.status === 'COUNTDOWN'
                      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                      : group.status === 'CANCELLED'
                      ? 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  }`}
                >
                  {group.status}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Host: <span className="text-amber-300 font-bold">@{group.hostName}</span> • Code:{' '}
                <span className="text-emerald-400 font-extrabold">{group.code}</span>
                {group.gameReferenceId && (
                  <>
                    {' '}• Ref: <span className="text-amber-400 font-mono font-bold">{group.gameReferenceId}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleManualRefreshGroup}
              disabled={isRefreshing}
              title="Refresh Group Status"
              className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 active:scale-95 transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 text-amber-400 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={handleCopyCode}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs flex items-center gap-1"
            >
              <Copy className="w-4 h-4" />
              <span>{copiedCode ? 'Copied!' : 'Code'}</span>
            </button>

            <button
              onClick={handleShareLink}
              className="p-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-1 shadow-lg shadow-amber-500/20"
            >
              <Share2 className="w-4 h-4" />
              <span>Invite</span>
            </button>

            <button onClick={onClose} className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {actionError && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-2xl p-3 font-semibold">
            ⚠️ {actionError}
          </div>
        )}

        {/* Prize Pool & Game Status Banner */}
        <div className="bg-gradient-to-r from-amber-950/60 via-slate-950 to-emerald-950/60 border border-amber-500/30 rounded-2xl p-4 flex items-center justify-between shadow-inner">
          <div>
            <span className="text-[10px] text-slate-400 block font-bold uppercase tracking-wider">
              Group Prize Pool (100% Real Ticket Sales)
            </span>
            <div className="text-2xl font-black text-amber-400 flex items-center gap-1.5">
              <Coins className="w-6 h-6 text-amber-400 animate-bounce" />
              <span>{(group?.prizePool ?? 0).toLocaleString()} Birr</span>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-bold">
              Ticket Price: <span className="text-emerald-400 font-extrabold">{group.ticketPrice} Birr</span>
            </span>
            <span className="text-[10px] text-slate-400 block font-bold">
              Pattern: <span className="text-amber-300 font-extrabold">{group.winningPattern}</span>
            </span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-800">
          <button
            onClick={() => setActiveTab('lobby')}
            className={`flex-1 py-2 font-black text-xs flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'lobby'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Players Lobby ({members.length}/{group.maxPlayers})</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-2 font-black text-xs flex items-center justify-center gap-2 border-b-2 transition ${
              activeTab === 'chat'
                ? 'border-amber-400 text-amber-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>Group Chat ({messages.length})</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto pr-1 space-y-3 min-h-[220px]">
          {activeTab === 'lobby' ? (
            <div className="space-y-3">
              {/* Members List */}
              <div className="space-y-2">
                {members.map((m) => {
                  const mIsHost = m.userId === group.hostId;

                  return (
                    <div
                      key={m.userId}
                      className="bg-slate-950/80 border border-slate-800 rounded-2xl p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-amber-400 text-sm">
                          {m.firstName.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-white">{m.firstName}</span>
                            <span className="text-[10px] text-slate-400">(@{m.username})</span>
                            {mIsHost && (
                              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[9px] font-black">
                                HOST
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400">
                            Tickets Purchased: <span className="text-emerald-400 font-bold">{m.ticketCount}</span>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                            m.status === 'READY'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : m.status === 'JOINED'
                              ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                              : m.status === 'INVITED'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-red-500/20 text-red-300 border-red-500/40'
                          }`}
                        >
                          {m.status}
                        </span>

                        {isHost && !mIsHost && group.status === 'LOBBY' && (
                          <button
                            onClick={() => handleRemoveMember(m.userId)}
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800"
                            title="Remove member & refund tickets"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Host Actions Bar */}
              {isHost && group.status === 'LOBBY' && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex-1 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 border border-slate-700"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>Invite User</span>
                  </button>

                  <button
                    onClick={handleCancelGame}
                    className="py-2.5 px-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 text-red-400 font-bold text-xs flex items-center justify-center gap-1 border border-red-500/30"
                  >
                    <Ban className="w-4 h-4" />
                    <span>Cancel Game</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Group Chat Panel */
            <div className="space-y-2 flex flex-col h-full justify-between">
              <div className="space-y-2 max-h-[220px] overflow-y-auto">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`p-2.5 rounded-2xl text-xs ${
                      msg.system
                        ? 'bg-amber-500/10 border border-amber-500/20 text-amber-300 text-center font-bold'
                        : msg.userId === user.id
                        ? 'bg-amber-500/20 border border-amber-500/30 text-white ml-8'
                        : 'bg-slate-950 border border-slate-800 text-slate-200 mr-8'
                    }`}
                  >
                    {!msg.system && (
                      <div className="font-extrabold text-[10px] text-slate-400 mb-0.5">
                        @{msg.username}
                      </div>
                    )}
                    <div>{msg.text}</div>
                  </div>
                ))}
              </div>

              {/* Chat Input */}
              <div className="flex gap-2 pt-2">
                <input
                  type="text"
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                  placeholder="Type a group message..."
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={handleSendChat}
                  className="p-2 rounded-2xl bg-amber-500 text-slate-950 font-bold"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions / Controls */}
        <div className="border-t border-slate-800 pt-3 space-y-3">
          {group.status === 'LOBBY' && (
            <div className="space-y-3">
              {/* Pick Lucky Cards Button & Selected Badges */}
              <div className="bg-gradient-to-r from-amber-500/10 via-yellow-500/10 to-amber-500/10 rounded-2xl p-3 border border-amber-500/30 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🎯</span>
                    <div>
                      <h4 className="text-xs font-black text-amber-300">Choose Lucky Card Numbers</h4>
                      <p className="text-[10px] text-slate-400">Pick card numbers (1 - 400) before game starts</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowCardSelection(true)}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg shadow-amber-500/20 active:scale-95 transition flex items-center gap-1.5"
                  >
                    <span>Select Cards</span>
                    <Sparkles className="w-3.5 h-3.5 fill-slate-950" />
                  </button>
                </div>

                {userTickets.filter((t) => t.roomId === group.id).length > 0 && (
                  <div className="pt-2 border-t border-amber-500/20 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-slate-300">Selected Cards ({userTickets.filter((t) => t.roomId === group.id).length}):</span>
                    {userTickets
                      .filter((t) => t.roomId === group.id)
                      .map((t) => (
                        <span key={t.id || t.cardNumber} className="px-2 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 font-extrabold text-[10px]">
                          #{formatCardNumber(t.cardNumber || 1)}
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Quick Ticket Purchasing Section */}
              <div className="bg-slate-950 rounded-2xl p-3 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-300">Quick Buy:</span>
                  <div className="flex gap-1">
                    {[1, 2, 3].map((cnt) => (
                      <button
                        key={cnt}
                        onClick={() => setTicketQuantity(cnt)}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold border ${
                          ticketQuantity === cnt
                            ? 'bg-amber-500 text-slate-950 border-amber-400'
                            : 'bg-slate-800 text-slate-300 border-slate-700'
                        }`}
                      >
                        {cnt}x
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleBuyTickets}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition"
                >
                  {loading ? 'Buying...' : `Quick Buy (${group.ticketPrice * ticketQuantity} Birr)`}
                </button>
              </div>

              {/* Ready & Start Action Buttons */}
              <div className="flex gap-2">
                {myTicketCount > 0 && (
                  <button
                    onClick={handleToggleReady}
                    className={`flex-1 py-3 rounded-2xl font-black text-xs border transition ${
                      isReady
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-slate-800 text-slate-200 border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    {isReady ? '✓ You are READY' : 'Mark as READY'}
                  </button>
                )}

                {isHost && (
                  <button
                    onClick={handleStartGame}
                    className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-xs shadow-xl shadow-amber-500/25 hover:brightness-110 flex items-center justify-center gap-1.5"
                  >
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Start Game Now</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {group.status === 'PLAYING' && (
            <button
              onClick={() => onPlayActiveGame(group, userTickets)}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-red-500 to-amber-500 text-white font-black text-sm shadow-xl shadow-red-500/25 animate-pulse flex items-center justify-center gap-2"
            >
              <Sparkles className="w-5 h-5" />
              <span>GAME IS LIVE! Join Drawing Canvas</span>
            </button>
          )}
        </div>
      </div>

      {/* Host Invite User Sub-Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 max-w-sm w-full space-y-4">
            <h4 className="text-base font-black text-white">Invite Registered User</h4>
            <input
              type="text"
              value={inviteInput}
              onChange={(e) => setInviteInput(e.target.value)}
              placeholder="Username or Phone (e.g. @abebe_k)"
              className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowInviteModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 text-slate-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleSendInvite}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs"
              >
                Send Invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
