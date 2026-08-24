import React, { useState, useEffect } from 'react';
import { BingoRoom, UserProfile, PrivateGroup, GroupInvitation } from '../types';
import { getRemainingSeconds } from '../lib/bingoUtils';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import {
  Play,
  Users,
  Trophy,
  Sparkles,
  Gift,
  Zap,
  ShieldCheck,
  Coins,
  PlusCircle,
  KeyRound,
  Globe,
  Lock,
  CheckCircle2,
  XCircle,
  ArrowRight,
  RefreshCw,
  Smartphone,
} from 'lucide-react';

interface HomeViewProps {
  rooms: BingoRoom[];
  user: UserProfile;
  onJoinRoom?: (room: BingoRoom, ticketCount: number) => void;
  onSelectRoom?: (room: BingoRoom) => void;
  onNavigateTab: (tab: 'bonuses' | 'wallet') => void;
  onCreatePrivateGroup: () => void;
  onJoinPrivateGroupCode: () => void;
  onOpenPrivateGroupLobby: (groupId: string) => void;
  onRefreshRooms?: () => void;
  onOpenPhoneVerification?: () => void;
  language: 'en' | 'am';
  onlineUsersCount?: number;
  isLoggedIn?: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  rooms,
  user,
  onJoinRoom,
  onSelectRoom,
  onNavigateTab,
  onCreatePrivateGroup,
  onJoinPrivateGroupCode,
  onOpenPrivateGroupLobby,
  onRefreshRooms,
  onOpenPhoneVerification,
  language,
  onlineUsersCount = 1,
  isLoggedIn = false,
}) => {
  const [activeMode, setActiveMode] = useState<'public' | 'private'>('public');
  const [myPrivateGroups, setMyPrivateGroups] = useState<PrivateGroup[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<GroupInvitation[]>([]);

  const publicRooms = rooms.filter(
    (room) =>
      !room.id.startsWith('grp_') &&
      !room.id.startsWith('private_') &&
      (room as any).type !== 'PRIVATE' &&
      !(room as any).isPrivate
  );

  const fetchPrivateGroups = async () => {
    try {
      const res = await fetch(apiUrl(`/api/private-groups/my-groups?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        setMyPrivateGroups(data.groups || []);
        setPendingInvitations(data.invitations || []);
      }
    } catch {
      // Ignore network polling interruptions
    }
  };

  useEffect(() => {
    fetchPrivateGroups();
    const interval = setInterval(fetchPrivateGroups, 4000);
    return () => clearInterval(interval);
  }, [user.id]);

  const handleRespondInvite = async (invitationId: string, action: 'ACCEPT' | 'DECLINE') => {
    try {
      const res = await fetch(apiUrl('/api/private-groups/respond-invite'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invitationId,
          userId: user.id,
          action,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        triggerHaptic('heavy');
        fetchPrivateGroups();
        if (action === 'ACCEPT' && data.group) {
          onOpenPrivateGroupLobby(data.group.id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 pb-24 w-full min-w-0">
      {/* Unverified Phone Verification Prompt Banner */}
      {isLoggedIn && !user?.phone && onOpenPhoneVerification && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/20 to-orange-500/15 border border-amber-500/40 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg shadow-amber-500/5 animate-in fade-in duration-300">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-white flex items-center gap-2">
                <span>{language === 'am' ? '📱 የቴሌግራም ስልክ ቁጥር ማረጋገጫ' : '📱 Telegram Phone Verification'}</span>
                <span className="text-[10px] bg-amber-500/30 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/40">
                  {language === 'am' ? 'አስፈላጊ' : 'Required'}
                </span>
              </h4>
              <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                {language === 'am'
                  ? 'አሸናፊ ሲሆኑ ገንዘብዎን ወዲያውኑ ወጪ (Withdraw) ለማድረግ እና ቦነስ ለማግኘት ስልክዎን ያረጋግጡ።'
                  : 'Verify your phone number via Telegram to enable instant withdrawals and bonus rewards.'}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              triggerHaptic('medium');
              onOpenPhoneVerification();
            }}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20 transition shrink-0 cursor-pointer"
          >
            <Smartphone className="w-4 h-4" />
            <span>{language === 'am' ? 'አሁን አረጋግጥ (Verify)' : 'Verify Phone Now'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mode Switcher: Public Rooms vs Private Group Bingo */}
      <div className="flex bg-slate-900 border border-slate-800 p-1 sm:p-1.5 rounded-2xl gap-1">
        <button
          onClick={() => {
            setActiveMode('public');
            triggerHaptic('light');
          }}
          className={`flex-1 py-2.5 sm:py-3 px-2 rounded-xl font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition min-w-0 ${
            activeMode === 'public'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Globe className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{language === 'am' ? 'የህዝብ ክፍሎች' : 'Public Arenas'}</span>
        </button>

        <button
          onClick={() => {
            setActiveMode('private');
            triggerHaptic('light');
          }}
          className={`flex-1 py-2.5 sm:py-3 px-2 rounded-xl font-black text-[11px] sm:text-xs flex items-center justify-center gap-1.5 transition min-w-0 relative ${
            activeMode === 'private'
              ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{language === 'am' ? 'የግል ግሩፕ' : 'Private Group'}</span>
          {pendingInvitations.length > 0 && (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping absolute top-2 right-2" />
          )}
        </button>
      </div>

      {/* Pending Invitations Alert Banner */}
      {pendingInvitations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-extrabold text-amber-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            <span>Pending Group Invitations ({pendingInvitations.length})</span>
          </h4>
          <div className="space-y-2">
            {pendingInvitations.map((inv, idx) => (
              <div
                key={inv.id || `inv-${idx}`}
                className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-3 sm:p-3.5 flex items-center justify-between gap-2 sm:gap-3 shadow-lg min-w-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-black text-white truncate">{inv.groupName}</div>
                  <div className="text-[10px] text-slate-300 truncate">
                    Invited by <span className="text-amber-300 font-bold">@{inv.hostName}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleRespondInvite(inv.id, 'DECLINE')}
                    className="p-2 rounded-xl bg-slate-800 text-red-400 hover:bg-slate-700 active:scale-95 transition"
                    title="Decline"
                  >
                    <XCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  <button
                    onClick={() => handleRespondInvite(inv.id, 'ACCEPT')}
                    className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-[11px] sm:text-xs shadow-md shadow-amber-500/20 flex items-center gap-1 active:scale-95 transition"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PUBLIC ROOMS TAB CONTENT */}
      {activeMode === 'public' && (
        <div id="all-arenas" className="space-y-3 sm:space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-1.5 sm:gap-2 truncate">
                <Zap className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
                <span className="truncate">{language === 'am' ? 'የጨዋታ ክፍሎች (Bingo Rooms)' : 'Active Bingo Arenas'}</span>
              </h3>
              <p className="text-[11px] sm:text-xs text-slate-400 truncate">
                {language === 'am' ? 'የሚፈልጉትን ክፍል ይምረጡና የቢንጎ ትኬት ይግዙ' : 'Choose a room and buy tickets to join the draw'}
              </p>
            </div>

            {onRefreshRooms && (
              <button
                onClick={() => {
                  triggerHaptic('light');
                  onRefreshRooms();
                }}
                title="Refresh Rooms"
                className="px-2.5 sm:px-3 py-1.5 rounded-xl sm:rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 active:scale-95 transition flex items-center gap-1.5 text-[11px] sm:text-xs font-bold cursor-pointer shrink-0 min-h-[36px]"
              >
                <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                <span>Refresh</span>
              </button>
            )}
          </div>

          {publicRooms.length === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-3">
              <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-slate-600 mx-auto" />
              <div className="text-xs sm:text-sm font-bold text-slate-300">
                {language === 'am' ? 'ምንም ክፍት የቢንጎ ክፍሎች የሉም' : 'No active games'}
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 max-w-xs mx-auto">
                {language === 'am'
                  ? 'በቅርቡ አዲስ ጨዋታዎች ይጀመራሉ ወይም የግል ግሩፕ ጨዋታ ይፍጠሩ!'
                  : 'New games will start shortly or you can create a private group game with your friends!'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              {publicRooms.map((room, idx) => {
              const isPlaying = room.status === 'PLAYING';

              return (
                <div
                  key={room.id || `room-${idx}`}
                  onClick={() => {
                    if (onJoinRoom) {
                      onJoinRoom(room, 0);
                    }
                    triggerHaptic('medium');
                  }}
                  className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-xl transition hover:shadow-amber-500/5 group relative overflow-hidden flex flex-col justify-between cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl sm:text-2xl group-hover:scale-105 transition-transform shrink-0">
                        {room.icon}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-extrabold text-white group-hover:text-amber-400 transition-colors truncate">
                          {room.name}
                        </h4>
                        <p className="text-[11px] sm:text-xs text-slate-400 truncate">{room.description}</p>
                        {room.gameReferenceId && (
                          <div className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-[9px] sm:text-[10px] font-mono font-bold text-amber-400 truncate max-w-[140px] sm:max-w-xs">
                            Ref: {room.gameReferenceId}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[9px] sm:text-[10px] font-black tracking-wide border shrink-0 ${
                        isPlaying
                          ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {isPlaying ? 'LIVE DRAWING' : `COUNTDOWN ${getRemainingSeconds(room)}s`}
                    </span>
                  </div>

                  {/* Details */}
                  <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-950/60 rounded-xl sm:rounded-2xl p-2.5 sm:p-3 my-3 sm:my-4 border border-slate-800/80 text-center">
                    <div>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 block">Ticket Price</span>
                      <span className="text-xs sm:text-sm font-extrabold text-emerald-400">
                        {room.ticketPrice} Birr
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 block">Prize Pool</span>
                      <span className="text-xs sm:text-sm font-extrabold text-amber-400 truncate block">
                        {(room.prizePool ?? 0).toLocaleString()} Birr
                      </span>
                    </div>

                    <div>
                      <span className="text-[9px] sm:text-[10px] text-slate-400 block">Players</span>
                      <span className="text-xs sm:text-sm font-extrabold text-slate-200">
                        {room.activePlayersCount}
                      </span>
                    </div>
                  </div>

                  {/* Select Card Action Button */}
                  <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectRoom) {
                          onSelectRoom(room);
                        }
                        triggerHaptic('heavy');
                      }}
                      className="w-full min-h-[44px] py-2.5 sm:py-3 px-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:brightness-110 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95 transition"
                    >
                      <Coins className="w-4 h-4" />
                      <span>{language === 'am' ? 'ካርድ ይምረጡ' : 'Select Bingo Card'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    )}

      {/* PRIVATE GROUP BINGO TAB CONTENT */}
      {activeMode === 'private' && (
        <div className="space-y-4 sm:space-y-5">
          {/* Action Header Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 sm:gap-3">
            <button
              onClick={() => {
                onCreatePrivateGroup();
                triggerHaptic('medium');
              }}
              className="min-h-[48px] py-3.5 px-4 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-amber-500 to-yellow-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xl shadow-amber-500/20 hover:brightness-110 transition active:scale-95"
            >
              <PlusCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>{language === 'am' ? 'አዲስ የግል ግሩፕ ይፍጠሩ' : 'Create Private Group'}</span>
            </button>

            <button
              onClick={() => {
                onJoinPrivateGroupCode();
                triggerHaptic('medium');
              }}
              className="min-h-[48px] py-3.5 px-4 rounded-2xl sm:rounded-3xl bg-slate-900 border border-slate-800 text-amber-400 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:border-amber-500/40 transition active:scale-95"
            >
              <KeyRound className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" />
              <span>{language === 'am' ? 'በኮድ ይቀላቀሉ' : 'Join with Code'}</span>
            </button>
          </div>

          {/* My Private Groups List */}
          <div className="space-y-3">
            <h3 className="text-sm sm:text-base font-black text-white flex items-center justify-between">
              <span>{language === 'am' ? 'የእኔ የግል ግሩፖች' : 'My Private Group Games'}</span>
              <span className="text-xs text-slate-400 font-medium">
                {myPrivateGroups.length} Active
              </span>
            </h3>

            {myPrivateGroups.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 text-center space-y-3">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto text-xl font-black">
                  🎟️
                </div>
                <h4 className="text-xs sm:text-sm font-black text-white">No active private groups</h4>
                <p className="text-[11px] sm:text-xs text-slate-400 max-w-xs mx-auto">
                  Create a private group or join using a 6-character code from a friend!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {myPrivateGroups.map((grp, idx) => (
                  <div
                    key={grp.id || `group-${idx}`}
                    className="bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 shadow-lg space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h4 className="text-xs sm:text-sm font-black text-white truncate">{grp.name}</h4>
                        <p className="text-[10px] text-slate-400 truncate">
                          Host: @{grp.hostName} • Code: <span className="text-amber-400 font-extrabold">{grp.code}</span>
                        </p>
                      </div>

                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-black border shrink-0 ${
                          grp.status === 'PLAYING'
                            ? 'bg-red-500/10 text-red-400 border-red-500/30 animate-pulse'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        }`}
                      >
                        {grp.status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 bg-slate-950 p-2.5 rounded-xl sm:rounded-2xl text-center border border-slate-800/80">
                      <div>
                        <span className="text-[9px] text-slate-400 block">Ticket Price</span>
                        <span className="text-xs font-black text-emerald-400">{grp.ticketPrice} Birr</span>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-400 block">Prize Pool</span>
                        <span className="text-xs font-black text-amber-400">{grp.prizePool} Birr</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        onOpenPrivateGroupLobby(grp.id);
                        triggerHaptic('medium');
                      }}
                      className="w-full min-h-[44px] py-2.5 rounded-xl sm:rounded-2xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-black text-xs flex items-center justify-center gap-1.5 active:scale-95 transition"
                    >
                      <span>Open Group Lobby</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
