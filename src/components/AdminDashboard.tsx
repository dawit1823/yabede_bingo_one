import React, { useEffect, useState, useRef } from 'react';
import {
  AuditLog,
  DepositRequest,
  PaymentMethodConfig,
  SystemMetrics,
  UserProfile,
  WithdrawalRequest,
  BingoRoom,
  BingoTicket,
  GameWinner,
  WalletTransaction,
} from '../types';
import { triggerHaptic, triggerNotificationHaptic } from '../lib/telegramSDK';
import { generateCardMatrixByNumber, formatCardNumber } from '../lib/bingoUtils';
import { apiUrl } from '../lib/apiConfig';
import {
  ShieldCheck,
  Users,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  AlertCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  PlusCircle,
  Image as ImageIcon,
  Edit,
  Trash2,
  Filter,
  Search,
  Info,
  Gamepad2,
  Ticket,
  Trophy,
  Gift,
  Share2,
  Bell,
  FileBarChart,
  Settings,
  Receipt,
  ScrollText,
  UserCheck,
  LogOut,
  ChevronRight,
  Download,
  Lock,
  Unlock,
  Ban,
  Check,
  Save,
  ExternalLink,
  Eye,
  LayoutDashboard,
  Coins,
  Sparkles,
  X,
  CreditCard,
  Key,
  List,
  Clock,
  Send,
  FileSpreadsheet,
  Printer,
  Activity,
  AlertTriangle,
  History,
} from 'lucide-react';

interface AdminDashboardProps {
  metrics: SystemMetrics | null;
  pendingWithdrawals: WithdrawalRequest[];
  onProcessWithdrawal: (id: string, approve: boolean) => Promise<void>;
  onSearchUsers: (query: string) => Promise<UserProfile[]>;
  onAdjustBalance: (userId: string, amount: number, reason: string) => Promise<void>;
  auditLogs: AuditLog[];
  onLogout?: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  metrics,
  pendingWithdrawals: initialPendingWithdrawals,
  onProcessWithdrawal,
  onSearchUsers,
  onAdjustBalance,
  auditLogs: initialAuditLogs,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<
    | 'overview'
    | 'users'
    | 'games'
    | 'tickets'
    | 'wallet'
    | 'deposits'
    | 'withdrawals'
    | 'winners'
    | 'bonuses'
    | 'referrals'
    | 'notifications'
    | 'reports'
    | 'settings'
    | 'audit'
    | 'profile'
  >('overview');

  // System Settings State
  const [platformSettings, setPlatformSettings] = useState<any>({
    ticketPrices: [10, 50, 100, 200],
    platformFeePercent: 20,
    prizePercentage: 80,
    countdownDurationSeconds: 45,
    ballDrawIntervalSeconds: 3,
    resultScreenDurationSeconds: 15,
    maxCardsPerPlayer: 50,
    maxPlayers: 400,
    minPlayers: 1,
    cardReservationTimeoutSeconds: 60,
    autoRestartGame: true,
    autoResetCards: true,
    allowSpectators: true,
    referralRewardBirr: 25,
    welcomeBonusBirr: 100,
    minDepositBirr: 50,
    minWithdrawalBirr: 100,
  });
  const [isSettingsDirty, setIsSettingsDirty] = useState<boolean>(false);
  const isSettingsDirtyRef = useRef<boolean>(false);

  const markSettingsDirty = () => {
    isSettingsDirtyRef.current = true;
    setIsSettingsDirty(true);
  };
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string>('');
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);

  // Announcement / Broadcaster State
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementMessage, setAnnouncementMessage] = useState('');
  const [announcementSending, setAnnouncementSending] = useState(false);

  // Admin Profile State
  const [adminProfileData, setAdminProfileData] = useState<any>({
    adminId: 'usr_admin_super',
    email: 'dawitsolomon1823@gmail.com',
    phone: '0918230227',
    displayName: 'Super Administrator',
    role: 'SuperAdmin',
    accountStatus: 'ACTIVE',
  });

  // Password Change Modal
  const [newPasswordInput, setNewPasswordInput] = useState('');
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState('');

  // Collections Data
  const [deposits, setDeposits] = useState<DepositRequest[]>([]);
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [adminPrivateGroups, setAdminPrivateGroups] = useState<any[]>([]);
  const [standardRooms, setStandardRooms] = useState<BingoRoom[]>([]);
  const [allUsersList, setAllUsersList] = useState<UserProfile[]>([]);
  const [allTicketsList, setAllTicketsList] = useState<BingoTicket[]>([]);
  const [allWinnersList, setAllWinnersList] = useState<GameWinner[]>([]);
  const [allTransactions, setAllTransactions] = useState<WalletTransaction[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(initialAuditLogs);
  const [dashboardMetrics, setDashboardMetrics] = useState<SystemMetrics | null>(metrics);
  const [reportsData, setReportsData] = useState<any>(null);
  const [bonusPrograms, setBonusPrograms] = useState<any[]>([]);
  const [referralStats, setReferralStats] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  // Filters & Searches
  const [depositStatusFilter, setDepositStatusFilter] = useState<string>('ALL');
  const [depositMethodFilter, setDepositMethodFilter] = useState<string>('ALL');
  const [depositSearchQuery, setDepositSearchQuery] = useState<string>('');

  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<string>('ALL');
  const [withdrawalSearchQuery, setWithdrawalSearchQuery] = useState<string>('');
  
  const [userSearchQuery, setUserSearchQuery] = useState<string>('');
  const [userStatusFilter, setUserStatusFilter] = useState<string>('ALL');

  // Ticket Filters
  const [ticketSearchQuery, setTicketSearchQuery] = useState<string>('');
  const [ticketRoomFilter, setTicketRoomFilter] = useState<string>('ALL');
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('ALL'); // 'ACTIVE_ROUND' | 'COMPLETED_ROUNDS' | 'ALL'
  const [ticketGameRefFilter, setTicketGameRefFilter] = useState<string>('');
  const [ticketUsernameFilter, setTicketUsernameFilter] = useState<string>('');
  const [ticketCardNumFilter, setTicketCardNumFilter] = useState<string>('');
  const [ticketStartDate, setTicketStartDate] = useState<string>('');
  const [ticketEndDate, setTicketEndDate] = useState<string>('');

  // Settings State & Confirmation
  const [settingsCategoryTab, setSettingsCategoryTab] = useState<'game' | 'wallet' | 'referral' | 'security'>('game');
  const [showSettingsConfirmModal, setShowSettingsConfirmModal] = useState<boolean>(false);
  const [settingsHistoryList, setSettingsHistoryList] = useState<any[]>([]);

  // Reports Filters
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');
  const [reportRoomId, setReportRoomId] = useState<string>('ALL');
  const [reportGameRefId, setReportGameRefId] = useState<string>('');
  const [reportUsername, setReportUsername] = useState<string>('');

  const [transactionTypeFilter, setTransactionTypeFilter] = useState<string>('ALL');
  const [transactionSearchQuery, setTransactionSearchQuery] = useState<string>('');
  const [transactionStartDate, setTransactionStartDate] = useState<string>('');
  const [transactionEndDate, setTransactionEndDate] = useState<string>('');
  const [walletStats, setWalletStats] = useState<any>(null);

  // Winner Filters & Stats
  const [winnerSearchQuery, setWinnerSearchQuery] = useState<string>('');
  const [winnerRoomFilter, setWinnerRoomFilter] = useState<string>('ALL');
  const [winnerStartDate, setWinnerStartDate] = useState<string>('');
  const [winnerEndDate, setWinnerEndDate] = useState<string>('');
  const [winnersStats, setWinnersStats] = useState<any>(null);

  const [auditSearchQuery, setAuditSearchQuery] = useState<string>('');

  // CSV Export Helper
  const exportToCSV = (filename: string, rows: object[]) => {
    if (!rows || rows.length === 0) {
      alert('No data to export.');
      return;
    }
    const keys = Object.keys(rows[0]);
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [
        keys.join(','),
        ...rows.map((row) =>
          keys.map((k) => `"${String((row as any)[k] ?? '').replace(/"/g, '""')}"`).join(',')
        ),
      ].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${filename}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Ticket Cancellation Handler
  const handleCancelTicket = async (ticketId: string) => {
    if (!window.confirm('Are you sure you want to cancel this ticket and refund the user?')) return;
    try {
      const res = await fetch(apiUrl('/api/admin/tickets/cancel'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, reason: 'Admin Manual Cancellation' }),
      });
      if (res.ok) {
        alert('Ticket cancelled and user refunded successfully.');
        fetchAdminData();
      } else {
        const err = await res.json();
        alert(`Error: ${err.error}`);
      }
    } catch {
      alert('Failed to cancel ticket.');
    }
  };

  // Modals & Dialogs
  const [selectedUserDetail, setSelectedUserDetail] = useState<any | null>(null);
  const [userModalTab, setUserModalTab] = useState<'overview' | 'txs' | 'deposits' | 'withdrawals' | 'tickets' | 'history'>('overview');

  const handleSaveBonusPrograms = async () => {
    try {
      const res = await fetch(apiUrl('/api/admin/bonuses'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programs: bonusPrograms }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save bonus configurations');
      }
      triggerNotificationHaptic('success');
      alert('🎁 Bonus programs successfully updated and saved to database!');
      if (data.bonusPrograms) {
        setBonusPrograms(data.bonusPrograms);
      }
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Failed to update bonus programs');
    }
  };

  const handlePrivateGroupAction = async (groupId: string, action: 'CANCEL' | 'RESET' | 'FORCE_START') => {
    const confirmMsg =
      action === 'CANCEL'
        ? 'Are you sure you want to cancel this private group and refund all player tickets?'
        : action === 'RESET'
        ? 'Reset this private group room back to lobby status?'
        : 'Force start game for this private group immediately?';

    if (!window.confirm(confirmMsg)) return;

    try {
      const res = await fetch(apiUrl('/api/admin/private-groups/action'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Private group action failed');
      }
      triggerNotificationHaptic('success');
      alert(data.message || 'Action executed successfully!');
      fetchAdminData();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Failed to execute private group action');
    }
  };

  const handleDeleteGameHistory = async (historyId: string) => {
    if (!window.confirm('Are you sure you want to permanently delete this game history record? This will not alter financial transaction history.')) {
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/admin/game-history/${historyId}`), {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete game history record');
      }
      triggerNotificationHaptic('success');
      alert('🗑️ Game history record deleted successfully.');
      if (selectedUserDetail) {
        handleOpenUserDetailModal(selectedUserDetail.user.id);
      }
      fetchAdminData();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Failed to delete game history record');
    }
  };
  const [userResetPasswordModal, setUserResetPasswordModal] = useState<UserProfile | null>(null);
  const [resetUserPasswordInput, setResetUserPasswordInput] = useState<string>('');

  const [selectedTicketForView, setSelectedTicketForView] = useState<BingoTicket | null>(null);
  const [selectedDepositForReceipt, setSelectedDepositForReceipt] = useState<DepositRequest | null>(null);

  const [approvingWithdrawal, setApprovingWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [approvalTxRef, setApprovalTxRef] = useState<string>('');

  const [rejectingDeposit, setRejectingDeposit] = useState<DepositRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');

  const [rejectingWithdrawal, setRejectingWithdrawal] = useState<WithdrawalRequest | null>(null);
  const [withdrawalRejectReason, setWithdrawalRejectReason] = useState<string>('');

  const [adjustingUser, setAdjustingUser] = useState<UserProfile | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(100);
  const [adjustReason, setAdjustReason] = useState<string>('VIP Bonus Adjustment');

  const [editingPaymentMethod, setEditingPaymentMethod] = useState<Partial<PaymentMethodConfig> | null>(null);
  const [creatingNewRoom, setCreatingNewRoom] = useState<boolean>(false);
  const [roomFormData, setRoomFormData] = useState<any>({
    name: '',
    description: '',
    ticketPrice: 50,
    minPlayers: 2,
    maxPlayers: 400,
    icon: '🟣',
  });

  // Fetch all Admin Data
  const fetchAdminData = async () => {
    setLoading(true);
    try {
      // 1. Metrics & Core Settings
      const res = await fetch(apiUrl('/api/admin/metrics'));
      if (res.ok) {
        const data = await res.json();
        setDashboardMetrics(data.metrics);
        setAuditLogs(data.auditLogs || []);
        setPaymentMethods(data.paymentMethods || []);
        if (data.settings && !isSettingsDirtyRef.current) setPlatformSettings(data.settings);
        if (data.adminProfile) setAdminProfileData(data.adminProfile);
      }

      // 2. Deposits
      const depRes = await fetch(
        apiUrl(`/api/admin/deposits?status=${depositStatusFilter}&methodId=${depositMethodFilter}&search=${encodeURIComponent(depositSearchQuery)}`)
      );
      if (depRes.ok) {
        const depData = await depRes.json();
        setDeposits(depData.deposits || []);
      }

      // 3. Withdrawals
      const wdRes = await fetch(apiUrl(`/api/admin/withdrawals?status=${withdrawalStatusFilter}&search=${encodeURIComponent(withdrawalSearchQuery)}`));
      if (wdRes.ok) {
        const wdData = await wdRes.json();
        setWithdrawals(wdData.withdrawals || []);
      }

      // 4. Users
      const uRes = await fetch(apiUrl(`/api/admin/users?q=${encodeURIComponent(userSearchQuery)}`));
      if (uRes.ok) {
        const uData = await uRes.json();
        setAllUsersList(uData.users || []);
      }

      // 5. Bingo Games & Private Groups
      const gamesRes = await fetch(apiUrl('/api/admin/games'));
      if (gamesRes.ok) {
        const gData = await gamesRes.json();
        setStandardRooms(gData.standardRooms || []);
        setAdminPrivateGroups(gData.privateGroups || []);
      }

      // 6. Tickets
      const tktRes = await fetch(
        apiUrl(`/api/admin/tickets?roomId=${ticketRoomFilter}&status=${ticketStatusFilter}&gameReferenceId=${encodeURIComponent(
          ticketGameRefFilter
        )}&username=${encodeURIComponent(ticketUsernameFilter)}&cardNumber=${encodeURIComponent(
          ticketCardNumFilter
        )}&startDate=${ticketStartDate}&endDate=${ticketEndDate}&search=${encodeURIComponent(ticketSearchQuery)}`)
      );
      if (tktRes.ok) {
        const tData = await tktRes.json();
        setAllTicketsList(tData.tickets || []);
      }

      // 7. Winners
      const winRes = await fetch(
        apiUrl(`/api/admin/winners?roomId=${winnerRoomFilter}&search=${encodeURIComponent(
          winnerSearchQuery
        )}&startDate=${winnerStartDate}&endDate=${winnerEndDate}`)
      );
      if (winRes.ok) {
        const winData = await winRes.json();
        setAllWinnersList(winData.winners || []);
        setWinnersStats(winData);
      }

      // 8. Transactions
      const txRes = await fetch(
        apiUrl(`/api/admin/transactions?type=${transactionTypeFilter}&search=${encodeURIComponent(
          transactionSearchQuery
        )}&startDate=${transactionStartDate}&endDate=${transactionEndDate}`)
      );
      if (txRes.ok) {
        const txData = await txRes.json();
        setAllTransactions(txData.transactions || []);
        if (txData.stats) setWalletStats(txData.stats);
      }

      // 9. Bonuses
      const bonusRes = await fetch(apiUrl('/api/admin/bonuses'));
      if (bonusRes.ok) {
        const bData = await bonusRes.json();
        setBonusPrograms(bData.bonusPrograms || []);
      }

      // 10. Referrals
      const refRes = await fetch(apiUrl('/api/admin/referrals'));
      if (refRes.ok) {
        const rData = await refRes.json();
        setReferralStats(rData.referralStats || []);
      }

      // 10b. Private Groups
      const pgRes = await fetch(apiUrl('/api/admin/private-groups'));
      if (pgRes.ok) {
        const pgData = await pgRes.json();
        setAdminPrivateGroups(pgData.groups || []);
      }

      // 11. Reports
      const repRes = await fetch(
        apiUrl(`/api/admin/reports?startDate=${reportStartDate}&endDate=${reportEndDate}&roomId=${reportRoomId}&gameReferenceId=${encodeURIComponent(
          reportGameRefId
        )}&username=${encodeURIComponent(reportUsername)}`)
      );
      if (repRes.ok) {
        const rData = await repRes.json();
        setReportsData(rData);
      }

      // 12. Settings & History
      const setRes = await fetch(apiUrl('/api/admin/settings'));
      if (setRes.ok) {
        const setData = await setRes.json();
        if (setData.settings && !isSettingsDirtyRef.current) setPlatformSettings(setData.settings);
        if (setData.history) setSettingsHistoryList(setData.history || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
    const interval = setInterval(() => {
      fetchAdminData();
    }, 12000);
    return () => clearInterval(interval);
  }, [
    activeTab,
    depositStatusFilter,
    depositMethodFilter,
    withdrawalStatusFilter,
    ticketRoomFilter,
    ticketStatusFilter,
    ticketGameRefFilter,
    ticketUsernameFilter,
    ticketCardNumFilter,
    ticketStartDate,
    ticketEndDate,
    transactionTypeFilter,
    transactionSearchQuery,
    transactionStartDate,
    transactionEndDate,
    winnerSearchQuery,
    winnerRoomFilter,
    winnerStartDate,
    winnerEndDate,
    reportStartDate,
    reportEndDate,
    reportRoomId,
    reportGameRefId,
    reportUsername,
  ]);

  // View User Full Details Modal
  const handleOpenUserDetailModal = async (userId: string) => {
    try {
      const res = await fetch(apiUrl(`/api/admin/users/${userId}`));
      if (res.ok) {
        const data = await res.json();
        setSelectedUserDetail(data);
        setUserModalTab('overview');
      }
    } catch {
      // ignore
    }
  };

  // Actions
  const handleResetAllBingoGames = async () => {
    if (!confirm('🚨 CRITICAL ACTION: Are you sure you want to remove and reset ALL existing bingo games, tickets, and card reservations?')) return;
    try {
      setLoading(true);
      const res = await fetch(apiUrl('/api/bingo/reset-all'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Reset failed');
      triggerNotificationHaptic('success');
      alert('✅ All existing bingo games, tickets, and card reservations wiped! Restored clean official rooms.');
      fetchAdminData();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Reset failed');
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDeposit = async (depositId: string) => {
    try {
      const res = await fetch(apiUrl('/api/admin/deposits/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ depositId, action: 'APPROVE', adminId: 'usr_admin' }),
      });
      if (!res.ok) throw new Error('Approval failed');
      triggerNotificationHaptic('success');
      alert('✅ Deposit verified and user wallet credited successfully!');
      setSelectedDepositForReceipt(null);
      fetchAdminData();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Approval failed');
    }
  };

  const handleConfirmRejectDeposit = async () => {
    if (!rejectingDeposit) return;
    try {
      const res = await fetch(apiUrl('/api/admin/deposits/verify'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          depositId: rejectingDeposit.id,
          action: 'REJECT',
          reason: rejectionReason || 'Receipt screenshot or reference code invalid.',
          adminId: 'usr_admin',
        }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      triggerNotificationHaptic('success');
      setRejectingDeposit(null);
      setSelectedDepositForReceipt(null);
      setRejectionReason('');
      fetchAdminData();
    } catch {
      triggerNotificationHaptic('error');
    }
  };

  const handleConfirmApproveWithdrawal = async () => {
    if (!approvingWithdrawal) return;
    try {
      const res = await fetch(apiUrl('/api/admin/withdrawals/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withdrawalId: approvingWithdrawal.id,
          approve: true,
          adminId: 'usr_admin',
          referenceCode: approvalTxRef || undefined,
        }),
      });
      if (!res.ok) throw new Error('Withdrawal processing failed');
      triggerNotificationHaptic('success');
      alert('✅ Payout approved and processed!');
      setApprovingWithdrawal(null);
      setApprovalTxRef('');
      fetchAdminData();
    } catch {
      triggerNotificationHaptic('error');
    }
  };

  const handleConfirmRejectWithdrawal = async () => {
    if (!rejectingWithdrawal) return;
    try {
      const res = await fetch(apiUrl('/api/admin/withdrawals/process'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          withdrawalId: rejectingWithdrawal.id,
          approve: false,
          reason: withdrawalRejectReason || 'Account details mismatch',
          adminId: 'usr_admin',
        }),
      });
      if (!res.ok) throw new Error('Rejection failed');
      triggerNotificationHaptic('success');
      setRejectingWithdrawal(null);
      setWithdrawalRejectReason('');
      fetchAdminData();
    } catch {
      triggerNotificationHaptic('error');
    }
  };

  const handleUserStatusChange = async (userId: string, newStatus: 'ACTIVE' | 'SUSPENDED' | 'BANNED') => {
    if (!confirm(`Are you sure you want to set user status to ${newStatus}?`)) return;
    try {
      const res = await fetch(apiUrl('/api/admin/users/status'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, status: newStatus }),
      });
      if (!res.ok) throw new Error('Status update failed');
      triggerNotificationHaptic('success');
      fetchAdminData();
      if (selectedUserDetail && selectedUserDetail.user.id === userId) {
        setSelectedUserDetail({
          ...selectedUserDetail,
          user: { ...selectedUserDetail.user, status: newStatus },
        });
      }
    } catch {
      triggerNotificationHaptic('error');
    }
  };

  const handleConfirmAdjustBalance = async () => {
    if (!adjustingUser) return;
    try {
      await onAdjustBalance(adjustingUser.id, adjustAmount, adjustReason);
      triggerNotificationHaptic('success');
      alert(`✅ Adjusted balance for @${adjustingUser.username} by ${adjustAmount} Birr!`);
      setAdjustingUser(null);
      fetchAdminData();
    } catch {
      triggerNotificationHaptic('error');
    }
  };

  const handleResetUserPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userResetPasswordModal || !resetUserPasswordInput) return;
    try {
      const res = await fetch(apiUrl('/api/admin/users/reset-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: userResetPasswordModal.id, newPassword: resetUserPasswordInput }),
      });
      if (!res.ok) throw new Error('Password reset failed');
      triggerNotificationHaptic('success');
      alert(`✅ Password reset successfully for user @${userResetPasswordModal.username}!`);
      setUserResetPasswordModal(null);
      setResetUserPasswordInput('');
    } catch (err: any) {
      alert(err.message || 'Password reset failed');
    }
  };

  const handleSavePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPaymentMethod || !editingPaymentMethod.name) return;
    try {
      const res = await fetch(apiUrl('/api/admin/payment-methods'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentMethod: editingPaymentMethod }),
      });
      if (!res.ok) throw new Error('Save payment method failed');
      triggerNotificationHaptic('success');
      alert('⚙️ Payment provider saved successfully!');
      setEditingPaymentMethod(null);
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to save payment method');
    }
  };

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(apiUrl('/api/admin/rooms/create'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomFormData),
      });
      if (!res.ok) throw new Error('Create room failed');
      triggerNotificationHaptic('success');
      alert(`🎉 Room ${roomFormData.name} created successfully!`);
      setCreatingNewRoom(false);
      setRoomFormData({ name: '', description: '', ticketPrice: 50, minPlayers: 2, maxPlayers: 400, icon: '🟣' });
      fetchAdminData();
    } catch (err: any) {
      alert(err.message || 'Failed to create room');
    }
  };

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementTitle || !announcementMessage) return;
    setAnnouncementSending(true);
    try {
      const res = await fetch(apiUrl('/api/admin/announcements'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: announcementTitle, message: announcementMessage }),
      });
      if (!res.ok) throw new Error('Broadcast failed');
      const data = await res.json();
      triggerNotificationHaptic('success');
      alert(`🚀 Broadcast successfully dispatched to ${data.recipientCount} users!`);
      setAnnouncementTitle('');
      setAnnouncementMessage('');
      fetchAdminData();
    } catch {
      triggerNotificationHaptic('error');
    } finally {
      setAnnouncementSending(false);
    }
  };

  const handlePromptSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setShowSettingsConfirmModal(true);
  };

  const handleExecuteSaveSettings = async () => {
    setIsSavingSettings(true);
    setSaveSuccessMessage('');
    try {
      const res = await fetch(apiUrl('/api/admin/settings'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(platformSettings),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Settings save failed');
      }
      if (data.settings) {
        setPlatformSettings(data.settings);
      }
      isSettingsDirtyRef.current = false;
      setIsSettingsDirty(false);
      setSaveSuccessMessage('⚙️ System settings successfully updated, saved to Firestore, and live across all game engine loops!');
      setTimeout(() => setSaveSuccessMessage(''), 6000);
      triggerNotificationHaptic('success');
      setShowSettingsConfirmModal(false);
      fetchAdminData();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Failed to save settings');
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSaveSettingsConfirmed = handleExecuteSaveSettings;

  const exportReportCSV = () => {
    if (!reportsData) return;
    const csvRows = [
      ['=== YABEDE BINGO FINANCIAL & SYSTEM PERFORMANCE REPORT ==='],
      ['Generated At', new Date().toLocaleString()],
      ['Date Range Filter', `${reportStartDate || 'All Time'} to ${reportEndDate || 'Present'}`],
      ['Game Room Filter', reportRoomId],
      [''],
      ['--- FINANCIAL SUMMARY ---'],
      ['Daily Revenue (Birr)', reportsData.financialReport?.dailyRevenue || 0],
      ['Weekly Revenue (Birr)', reportsData.financialReport?.weeklyRevenue || 0],
      ['Monthly Revenue (Birr)', reportsData.financialReport?.monthlyRevenue || 0],
      ['Platform Rake Profit (Birr)', reportsData.financialReport?.platformEarnings || 0],
      ['Total Prizes Distributed (Birr)', reportsData.financialReport?.prizePaid || 0],
      ['Total Deposit Volume (Birr)', reportsData.financialReport?.deposits?.totalAmount || 0],
      ['Total Deposit Count', reportsData.financialReport?.deposits?.totalCount || 0],
      ['Total Withdrawal Volume (Birr)', reportsData.financialReport?.withdrawals?.totalAmount || 0],
      ['Total Withdrawal Count', reportsData.financialReport?.withdrawals?.totalCount || 0],
      [''],
      ['--- GAME STATISTICS ---'],
      ['Total Games Played', reportsData.gameReport?.totalGamesPlayed || 0],
      ['Tickets / Cards Sold', reportsData.gameReport?.ticketsSold || 0],
      ['Total Prize Pools Generated', reportsData.gameReport?.prizePools || 0],
      ['Total Winners Count', reportsData.gameReport?.winnersCount || 0],
      ['Simultaneous Winners Rounds', reportsData.gameReport?.simultaneousWinnersCount || 0],
      ['10 Birr Room Games', reportsData.gameReport?.gamesPerRoom?.room_10 || 0],
      ['50 Birr Room Games', reportsData.gameReport?.gamesPerRoom?.room_50 || 0],
      ['100 Birr Room Games', reportsData.gameReport?.gamesPerRoom?.room_100 || 0],
      ['200 Birr Room Games', reportsData.gameReport?.gamesPerRoom?.room_200 || 0],
      ['Private Group Games', reportsData.gameReport?.gamesPerRoom?.PRIVATE || 0],
      [''],
      ['--- USER METRICS & LIABILITIES ---'],
      ['Total Registered Users', reportsData.userReport?.totalUsers || 0],
      ['New Users Today', reportsData.userReport?.newUsersToday || 0],
      ['New Users This Week', reportsData.userReport?.newUsersThisWeek || 0],
      ['Active Players', reportsData.userReport?.activeUsers || 0],
      ['Referral Users', reportsData.userReport?.referralUsers || 0],
      ['System Wallet Balance Liabilities (Birr)', reportsData.userReport?.totalWalletLiability || 0],
      [''],
      ['--- PERFORMANCE AVERAGES ---'],
      ['Avg Players Per Game', reportsData.performanceReport?.avgPlayersPerGame || 0],
      ['Avg Ticket Sales Per Game (Birr)', reportsData.performanceReport?.avgTicketSalesPerGame || 0],
      ['Avg Prize Pool Per Game (Birr)', reportsData.performanceReport?.avgPrizePoolPerGame || 0],
      ['Most Popular Game Room', reportsData.performanceReport?.mostPopularRoom || '10 Birr Room'],
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.map(item => `"${String(item).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `YabedeBingo_Financial_Report_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportReportExcel = () => {
    if (!reportsData) return;
    const excelRows = [
      'Field\tValue\tUnit',
      `Report Generated At\t${new Date().toLocaleString()}\tTimestamp`,
      `Daily Revenue\t${reportsData.financialReport?.dailyRevenue || 0}\tBirr`,
      `Weekly Revenue\t${reportsData.financialReport?.weeklyRevenue || 0}\tBirr`,
      `Monthly Revenue\t${reportsData.financialReport?.monthlyRevenue || 0}\tBirr`,
      `Platform Rake Profit\t${reportsData.financialReport?.platformEarnings || 0}\tBirr`,
      `Total Prizes Paid\t${reportsData.financialReport?.prizePaid || 0}\tBirr`,
      `Total Deposit Volume\t${reportsData.financialReport?.deposits?.totalAmount || 0}\tBirr`,
      `Total Withdrawal Volume\t${reportsData.financialReport?.withdrawals?.totalAmount || 0}\tBirr`,
      `Total Games Played\t${reportsData.gameReport?.totalGamesPlayed || 0}\tRounds`,
      `Total Tickets Sold\t${reportsData.gameReport?.ticketsSold || 0}\tTickets`,
      `Total Winners\t${reportsData.gameReport?.winnersCount || 0}\tWinners`,
      `Total Users\t${reportsData.userReport?.totalUsers || 0}\tAccounts`,
      `Total Wallet Balance Liability\t${reportsData.userReport?.totalWalletLiability || 0}\tBirr`,
    ].join('\n');

    const blob = new Blob([excelRows], { type: 'application/vnd.ms-excel' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `YabedeBingo_Financial_Report_${Date.now()}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportReportPrint = () => {
    window.print();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPasswordInput) return;
    try {
      const res = await fetch(apiUrl('/api/admin/profile/password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPasswordInput }),
      });
      if (!res.ok) throw new Error('Password update failed');
      triggerNotificationHaptic('success');
      setPasswordChangeSuccess('SuperAdmin password updated successfully!');
      setNewPasswordInput('');
    } catch {
      triggerNotificationHaptic('error');
    }
  };

  const exportUsersCSV = () => {
    const csvRows = [
      ['ID', 'Username', 'FirstName', 'Phone', 'Wallet Balance', 'Bonus Balance', 'Status', 'CreatedAt'],
      ...allUsersList.map((u) => [
        u.id,
        u.username,
        u.firstName,
        u.phone || '',
        u.walletBalance,
        u.bonusBalance,
        u.status,
        u.createdAt,
      ]),
    ];
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map((e) => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `YabedeBingo_Users_Export_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sidebarMenuItems = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, badge: null },
    { id: 'users', label: 'Users', icon: Users, badge: allUsersList.length },
    { id: 'games', label: 'Bingo Games', icon: Gamepad2, badge: standardRooms.length + adminPrivateGroups.length },
    { id: 'tickets', label: 'Tickets', icon: Ticket, badge: allTicketsList.length },
    { id: 'wallet', label: 'Wallet Ledger', icon: Wallet, badge: allTransactions.length || null },
    { id: 'deposits', label: 'Deposits', icon: ArrowDownLeft, badge: deposits.filter((d) => d.status === 'PENDING').length || null },
    { id: 'withdrawals', label: 'Withdrawals', icon: ArrowUpRight, badge: withdrawals.filter((w) => w.status === 'PENDING').length || null },
    { id: 'winners', label: 'Winners', icon: Trophy, badge: allWinnersList.length },
    { id: 'bonuses', label: 'Bonuses', icon: Gift, badge: bonusPrograms.length },
    { id: 'referrals', label: 'Referrals', icon: Share2, badge: null },
    { id: 'notifications', label: 'Broadcaster', icon: Bell, badge: null },
    { id: 'reports', label: 'Reports', icon: FileBarChart, badge: null },
    { id: 'settings', label: 'Settings', icon: Settings, badge: null },
    { id: 'audit', label: 'Audit Logs', icon: ScrollText, badge: auditLogs.length },
    { id: 'profile', label: 'Admin Profile', icon: UserCheck, badge: null },
  ];

  const filteredUsers = allUsersList.filter((u) => {
    if (userStatusFilter !== 'ALL' && u.status !== userStatusFilter) return false;
    if (userSearchQuery) {
      const q = userSearchQuery.toLowerCase();
      return (
        (u.username || '').toLowerCase().includes(q) ||
        (u.firstName || '').toLowerCase().includes(q) ||
        (u.phone || '').includes(q) ||
        (u.id || '').includes(q)
      );
    }
    return true;
  });

  const filteredAuditLogs = auditLogs.filter((log) => {
    if (auditSearchQuery) {
      const q = auditSearchQuery.toLowerCase();
      return (
        log.action.toLowerCase().includes(q) ||
        (log.description || '').toLowerCase().includes(q) ||
        (log.ipAddress || '').includes(q) ||
        (log.adminId || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row gap-4 pb-20">
      {/* SIDEBAR NAVIGATION */}
      <aside className="w-full md:w-64 bg-slate-900/90 border border-slate-800 rounded-3xl p-4 flex flex-col justify-between shrink-0 shadow-2xl">
        <div className="space-y-4">
          <div className="flex items-center justify-between px-2 py-2 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black shadow-inner">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-sm font-black text-white leading-tight">SuperAdmin</h1>
                <p className="text-[10px] text-amber-400 font-mono font-bold">Yabede Bingo Center</p>
              </div>
            </div>
            <button
              onClick={fetchAdminData}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 transition"
              title="Sync Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <nav className="flex md:flex-col flex-row overflow-x-auto md:overflow-y-auto no-scrollbar gap-1.5 md:gap-1 max-h-none md:max-h-[70vh] pb-1 md:pb-0 pr-1">
            {sidebarMenuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveTab(item.id as any);
                    triggerHaptic('light');
                  }}
                  className={`flex-shrink-0 md:w-full flex items-center justify-between px-3 py-2.5 rounded-2xl font-bold text-xs transition ${
                    isActive
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20 font-black'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60 bg-slate-950/40 md:bg-transparent border border-slate-800 md:border-none'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-slate-950' : 'text-slate-400'}`} />
                    <span className="whitespace-nowrap">{item.label}</span>
                  </div>
                  {item.badge !== null && item.badge > 0 && (
                    <span
                      className={`ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                        isActive
                          ? 'bg-slate-950 text-amber-400'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-4 border-t border-slate-800">
          <button
            onClick={() => {
              if (onLogout) onLogout();
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold transition"
          >
            <LogOut className="w-4 h-4" />
            <span>Exit Admin Panel</span>
          </button>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <main className="flex-1 space-y-6 overflow-x-hidden">
        {/* TAB 1: OVERVIEW DASHBOARD */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-br from-amber-950/80 via-slate-900 to-slate-950 border border-amber-500/40 rounded-3xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-inner shrink-0">
                  <ShieldCheck className="w-8 h-8" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-lg font-black text-white">SuperAdministrator Dashboard</h2>
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/50 text-[10px] font-mono font-bold text-emerald-400">
                      Live Firestore Sync
                    </span>
                  </div>
                  <p className="text-xs text-amber-200/90 font-mono font-semibold mt-1">
                    dawitsolomon1823@gmail.com • 0918230227
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={fetchAdminData}
                  className="px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-700 text-xs font-bold transition flex items-center gap-2"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh Real-time Metrics</span>
                </button>
              </div>
            </div>

            {/* Statistics Grid Cards */}
            {dashboardMetrics && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Total Registered Users</span>
                  <span className="text-xl font-black text-emerald-400">{dashboardMetrics.totalUsers}</span>
                  <span className="text-[10px] text-slate-500 block">
                    {dashboardMetrics.onlineUsers || allUsersList.filter((u) => u.status === 'ACTIVE').length} Active Accounts
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Today's Deposits</span>
                  <span className="text-xl font-black text-amber-400">{dashboardMetrics.totalDepositedToday} Birr</span>
                  <span className="text-[10px] text-slate-500 block">
                    {dashboardMetrics.pendingDepositsCount} Pending Verification
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Today's Payouts</span>
                  <span className="text-xl font-black text-indigo-400">{dashboardMetrics.totalWithdrawnToday} Birr</span>
                  <span className="text-[10px] text-slate-500 block">
                    {dashboardMetrics.pendingWithdrawalsCount} Pending Review
                  </span>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-1 shadow-lg">
                  <span className="text-[10px] text-slate-400 font-bold block uppercase">Platform Rake Profit</span>
                  <span className="text-xl font-black text-emerald-300">{dashboardMetrics.totalPlatformProfit} Birr</span>
                  <span className="text-[10px] text-slate-500 block">10% Rake Commission</span>
                </div>
              </div>
            )}

            {/* Quick Pending Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-white flex items-center gap-2">
                    <ArrowDownLeft className="w-4 h-4 text-amber-400" />
                    <span>Pending Deposits ({deposits.filter((d) => d.status === 'PENDING').length})</span>
                  </h3>
                  <button onClick={() => setActiveTab('deposits')} className="text-[10px] font-bold text-amber-400 hover:underline">
                    View All &rarr;
                  </button>
                </div>
                {deposits.filter((d) => d.status === 'PENDING').length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">🎉 All submitted deposit receipts verified!</p>
                ) : (
                  <div className="space-y-2">
                    {deposits
                      .filter((d) => d.status === 'PENDING')
                      .slice(0, 3)
                      .map((dep) => (
                        <div key={dep.id} className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-extrabold text-white">@{dep.userName}</span>
                            <span className="text-[10px] text-slate-400 block">{dep.paymentMethodName} • Ref: {dep.referenceCode}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-emerald-400">{dep.amount} Birr</span>
                            <button
                              onClick={() => setSelectedDepositForReceipt(dep)}
                              className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-[10px]"
                            >
                              Review
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 space-y-3 shadow-xl">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-white flex items-center gap-2">
                    <ArrowUpRight className="w-4 h-4 text-amber-400" />
                    <span>Pending Withdrawals ({withdrawals.filter((w) => w.status === 'PENDING').length})</span>
                  </h3>
                  <button onClick={() => setActiveTab('withdrawals')} className="text-[10px] font-bold text-amber-400 hover:underline">
                    View All &rarr;
                  </button>
                </div>
                {withdrawals.filter((w) => w.status === 'PENDING').length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">🎉 No pending withdrawal requests!</p>
                ) : (
                  <div className="space-y-2">
                    {withdrawals
                      .filter((w) => w.status === 'PENDING')
                      .slice(0, 3)
                      .map((wd) => (
                        <div key={wd.id} className="bg-slate-950 p-3 rounded-2xl border border-slate-800/80 flex items-center justify-between text-xs">
                          <div>
                            <span className="font-extrabold text-white">@{wd.userName}</span>
                            <span className="text-[10px] text-slate-400 block">{wd.paymentMethodName} • {wd.accountNumber}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-amber-400">{wd.amount} Birr</span>
                            <button
                              onClick={() => setApprovingWithdrawal(wd)}
                              className="px-2.5 py-1 rounded-xl bg-amber-500 text-slate-950 font-black text-[10px]"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: USERS MANAGEMENT */}
        {activeTab === 'users' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Users className="w-4 h-4 text-amber-400" />
                  <span>Registered Players Directory ({filteredUsers.length})</span>
                </h3>
                <button
                  onClick={exportUsersCSV}
                  className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[11px] flex items-center gap-1 border border-slate-700"
                >
                  <Download className="w-3 h-3 text-amber-400" />
                  <span>Export CSV</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={userStatusFilter}
                  onChange={(e) => setUserStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="ACTIVE">Active</option>
                  <option value="SUSPENDED">Suspended</option>
                  <option value="BANNED">Banned</option>
                </select>

                <div className="relative flex-1 md:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    placeholder="Search Username, Phone, or ID..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Player</th>
                    <th className="p-3">Phone</th>
                    <th className="p-3">Wallet</th>
                    <th className="p-3">Bonus</th>
                    <th className="p-3">Games / Wins</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredUsers.map((usr) => (
                    <tr key={usr.id} className="hover:bg-slate-800/40">
                      <td className="p-3 cursor-pointer" onClick={() => handleOpenUserDetailModal(usr.id)}>
                        <div className="font-extrabold text-white hover:text-amber-400 transition flex items-center gap-1.5">
                          <span>@{usr.username}</span>
                          <Eye className="w-3 h-3 text-slate-500" />
                        </div>
                        <div className="text-[10px] text-slate-400">{usr.firstName} {usr.lastName || ''}</div>
                      </td>
                      <td className="p-3 font-mono">{usr.phone || 'N/A'}</td>
                      <td className="p-3 font-bold text-emerald-400">{usr.walletBalance} Birr</td>
                      <td className="p-3 font-bold text-amber-400">{usr.bonusBalance} Birr</td>
                      <td className="p-3 font-mono text-[11px]">{usr.totalGamesPlayed || 0} / <span className="text-amber-400 font-bold">{usr.totalWins || 0}</span></td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            usr.status === 'ACTIVE'
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-400 border border-red-500/40'
                          }`}
                        >
                          {usr.status}
                        </span>
                      </td>
                      <td className="p-3 flex items-center gap-1.5 flex-wrap">
                        <button
                          onClick={() => setAdjustingUser(usr)}
                          className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold text-[10px]"
                        >
                          Credit/Debit
                        </button>
                        <button
                          onClick={() => setUserResetPasswordModal(usr)}
                          className="px-2 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold text-[10px]"
                        >
                          Reset PIN
                        </button>
                        {usr.status === 'ACTIVE' ? (
                          <button
                            onClick={() => handleUserStatusChange(usr.id, 'SUSPENDED')}
                            className="px-2 py-1 rounded-lg bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-[10px]"
                          >
                            Suspend
                          </button>
                        ) : (
                          <button
                            onClick={() => handleUserStatusChange(usr.id, 'ACTIVE')}
                            className="px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px]"
                          >
                            Activate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: BINGO GAMES MANAGEMENT */}
        {activeTab === 'games' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <Gamepad2 className="w-4 h-4 text-amber-400" />
                <span>Active Standard Arenas & Private Groups</span>
              </h3>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCreatingNewRoom(true)}
                  className="px-3.5 py-2 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>Create Bingo Room</span>
                </button>

                <button
                  onClick={handleResetAllBingoGames}
                  className="px-3.5 py-2 rounded-2xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400 font-extrabold text-xs transition flex items-center justify-center gap-2 shadow-lg"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Reset All Games</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {standardRooms.map((rm) => (
                <div key={rm.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-white text-sm flex items-center gap-2">
                      <span>{rm.icon}</span>
                      <span>{rm.name}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      {rm.gameReferenceId && (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono font-bold">
                          {rm.gameReferenceId}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-mono font-bold">
                        {rm.status}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400">{rm.description}</p>
                  <div className="flex justify-between font-mono text-[11px] text-slate-300 pt-1 border-t border-slate-800">
                    <span>Ticket: <strong>{rm.ticketPrice} Birr</strong></span>
                    <span>Prize Pool: <strong className="text-amber-400">{rm.prizePool} Birr</strong></span>
                    <span>Tickets Sold: <strong>{rm.ticketsSold || 0}</strong></span>
                  </div>
                </div>
              ))}
            </div>

            {/* Private Groups Management Section */}
            <div className="pt-6 border-t border-slate-800 space-y-3">
              <h4 className="text-xs font-black text-amber-300 uppercase tracking-wider flex items-center justify-between">
                <span>Private Group Bingo Rooms ({adminPrivateGroups.length})</span>
                <span className="text-[10px] text-slate-400 font-normal capitalize">Real-time Host Control & Ticket Refunds</span>
              </h4>

              {adminPrivateGroups.length === 0 ? (
                <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800/80 text-center text-slate-500 italic text-xs">
                  No active or historical private group rooms created yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {adminPrivateGroups.map((grp) => (
                    <div key={grp.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="font-extrabold text-white text-sm block">{grp.name}</span>
                          <span className="text-[10px] text-amber-400 font-mono font-bold">Code: {grp.code}</span>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                          grp.status === 'PLAYING' ? 'bg-emerald-500/20 text-emerald-400' :
                          grp.status === 'LOBBY' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-slate-800 text-slate-400'
                        }`}>
                          {grp.status}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-400 flex justify-between">
                        <span>Host: <strong className="text-white">@{grp.hostName}</strong></span>
                        <span>Players: <strong className="text-white">{grp.membersCount || grp.activePlayersCount || 0}/{grp.maxPlayers}</strong></span>
                      </div>

                      <div className="flex justify-between font-mono text-[11px] text-slate-300 pt-2 border-t border-slate-800/60">
                        <span>Ticket: <strong>{grp.ticketPrice} Birr</strong></span>
                        <span>Tickets Sold: <strong>{grp.ticketsCount || grp.ticketsSold || 0}</strong></span>
                        <span>Prize Pool: <strong className="text-amber-400">{grp.prizePool || 0} Birr</strong></span>
                      </div>

                      <div className="flex gap-2 pt-1">
                        {grp.status !== 'CANCELLED' && (
                          <button
                            onClick={() => handlePrivateGroupAction(grp.id, 'CANCEL')}
                            className="flex-1 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 text-[10px] font-bold transition"
                          >
                            Cancel & Refund
                          </button>
                        )}
                        {grp.status === 'LOBBY' && (
                          <button
                            onClick={() => handlePrivateGroupAction(grp.id, 'FORCE_START')}
                            className="flex-1 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold transition"
                          >
                            Force Start
                          </button>
                        )}
                        <button
                          onClick={() => handlePrivateGroupAction(grp.id, 'RESET')}
                          className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition"
                        >
                          Reset Room
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: TICKETS */}
        {activeTab === 'tickets' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Ticket className="w-4 h-4 text-amber-400" />
                  <span>Permanent Sold Bingo Tickets Ledger ({allTicketsList.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Every ticket is stored permanently in Firestore and survives game resets.
                </p>
              </div>

              {/* Status Counters */}
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-300 font-bold">
                  Total: <strong className="text-white">{allTicketsList.length}</strong>
                </span>
                <span className="px-3 py-1 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400 font-bold">
                  Active: <strong>{allTicketsList.filter((t) => t.status === 'ACTIVE').length}</strong>
                </span>
                <span className="px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-400 font-bold">
                  Winners: <strong>{allTicketsList.filter((t) => t.winningStatus === 'WON').length}</strong>
                </span>
              </div>
            </div>

            {/* Comprehensive Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800/80 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Round Status</label>
                <select
                  value={ticketStatusFilter}
                  onChange={(e) => setTicketStatusFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Rounds</option>
                  <option value="ACTIVE_ROUND">Active Round</option>
                  <option value="COMPLETED_ROUNDS">Completed Rounds</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1 font-sans">Game Room</label>
                <select
                  value={ticketRoomFilter}
                  onChange={(e) => setTicketRoomFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Rooms</option>
                  <option value="10">10 Birr Room</option>
                  <option value="50">50 Birr Room</option>
                  <option value="100">100 Birr Room</option>
                  <option value="200">200 Birr Room</option>
                  <option value="PRIVATE">Private Groups</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Game Ref ID</label>
                <input
                  type="text"
                  placeholder="e.g. REF-10-8472"
                  value={ticketGameRefFilter}
                  onChange={(e) => setTicketGameRefFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Username</label>
                <input
                  type="text"
                  placeholder="e.g. dawit12"
                  value={ticketUsernameFilter}
                  onChange={(e) => setTicketUsernameFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Card #</label>
                <input
                  type="text"
                  placeholder="1 - 400"
                  value={ticketCardNumFilter}
                  onChange={(e) => setTicketCardNumFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Start Date</label>
                <input
                  type="date"
                  value={ticketStartDate}
                  onChange={(e) => setTicketStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">End Date</label>
                <input
                  type="date"
                  value={ticketEndDate}
                  onChange={(e) => setTicketEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>
            </div>

            {/* Ticket Search Bar & Reset */}
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  placeholder="Quick search ticket ID, game ref, or username..."
                  value={ticketSearchQuery}
                  onChange={(e) => setTicketSearchQuery(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportToCSV('bingo_tickets_ledger', allTicketsList)}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => {
                    setTicketSearchQuery('');
                    setTicketRoomFilter('ALL');
                    setTicketStatusFilter('ALL');
                    setTicketGameRefFilter('');
                    setTicketUsernameFilter('');
                    setTicketCardNumFilter('');
                    setTicketStartDate('');
                    setTicketEndDate('');
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {/* Tickets Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Ticket ID</th>
                    <th className="p-3">Game Ref ID</th>
                    <th className="p-3">Room</th>
                    <th className="p-3">Player</th>
                    <th className="p-3">Card #</th>
                    <th className="p-3">Price</th>
                    <th className="p-3">Purchase Date</th>
                    <th className="p-3">Round Status</th>
                    <th className="p-3">Winning Status</th>
                    <th className="p-3">Prize Won</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {allTicketsList.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="p-6 text-center text-slate-500 italic">
                        No tickets matching the current filter criteria found.
                      </td>
                    </tr>
                  ) : (
                    allTicketsList.map((tkt) => {
                      const roomObj = standardRooms.find((r) => r.id === tkt.roomId);
                      const roomName = roomObj ? roomObj.name : tkt.roomId;
                      return (
                        <tr key={tkt.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono text-[10px] text-slate-400">{tkt.id}</td>
                          <td className="p-3 font-mono text-[10px] text-amber-400 font-bold">{tkt.gameReferenceId || 'N/A'}</td>
                          <td className="p-3 text-[11px] font-bold text-slate-200">{roomName}</td>
                          <td className="p-3 font-bold text-white">@{tkt.username}</td>
                          <td className="p-3 font-black text-amber-400">Card #{tkt.cardNumber}</td>
                          <td className="p-3 font-bold text-emerald-400">{tkt.purchasePrice} Birr</td>
                          <td className="p-3 text-[10px] text-slate-400">{new Date(tkt.boughtAt).toLocaleString()}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                tkt.status === 'ACTIVE'
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : tkt.status === ('CANCELLED' as any)
                                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {tkt.status === 'ACTIVE'
                                ? 'ACTIVE ROUND'
                                : tkt.status === ('CANCELLED' as any)
                                ? 'CANCELLED'
                                : 'COMPLETED'}
                            </span>
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                tkt.winningStatus === 'WON'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                  : tkt.winningStatus === 'LOST'
                                  ? 'bg-slate-800 text-slate-400'
                                  : 'bg-amber-500/10 text-amber-400'
                              }`}
                            >
                              {tkt.winningStatus || (tkt.status === 'ACTIVE' ? 'PENDING' : 'LOST')}
                            </span>
                          </td>
                          <td className="p-3 font-black text-emerald-400">
                            {tkt.prizeWon && tkt.prizeWon > 0 ? `${tkt.prizeWon} Birr` : '-'}
                          </td>
                          <td className="p-3">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => setSelectedTicketForView(tkt)}
                                className="px-2.5 py-1 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-[10px] flex items-center gap-1"
                              >
                                <Eye className="w-3 h-3" />
                                <span>Inspect</span>
                              </button>
                              {tkt.status === 'ACTIVE' && (
                                <button
                                  onClick={() => handleCancelTicket(tkt.id)}
                                  className="px-2.5 py-1 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 font-bold text-[10px] flex items-center gap-1"
                                >
                                  <X className="w-3 h-3" />
                                  <span>Cancel</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: WALLET LEDGER */}
        {activeTab === 'wallet' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-amber-400" />
                  <span>Financial Transactions Ledger ({allTransactions.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Complete double-entry accounting ledger of all wallet activities on the platform.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportToCSV('wallet_transactions_ledger', allTransactions)}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Wallet Stats Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Total Volume</span>
                <span className="text-sm font-black text-white">
                  {walletStats?.totalVolume ?? allTransactions.reduce((s, t) => s + Math.abs(t.amount), 0)} Birr
                </span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Deposits</span>
                <span className="text-sm font-black text-emerald-400">
                  +{walletStats?.totalDeposits ?? allTransactions.filter((t) => t.type === 'DEPOSIT').reduce((s, t) => s + t.amount, 0)} Birr
                </span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Withdrawals</span>
                <span className="text-sm font-black text-red-400">
                  -{walletStats?.totalWithdrawals ?? allTransactions.filter((t) => t.type === 'WITHDRAWAL').reduce((s, t) => s + Math.abs(t.amount), 0)} Birr
                </span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Ticket Sales</span>
                <span className="text-sm font-black text-amber-400">
                  {walletStats?.totalTicketSales ?? allTransactions.filter((t) => t.type === 'TICKET_PURCHASE').reduce((s, t) => s + Math.abs(t.amount), 0)} Birr
                </span>
              </div>
              <div className="bg-slate-950 p-3.5 rounded-2xl border border-slate-800 col-span-2 md:col-span-1">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Prizes Paid</span>
                <span className="text-sm font-black text-indigo-400">
                  {walletStats?.totalPrizePaid ?? allTransactions.filter((t) => t.type === 'GAME_WIN').reduce((s, t) => s + t.amount, 0)} Birr
                </span>
              </div>
            </div>

            {/* Wallet Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Transaction Type</label>
                <select
                  value={transactionTypeFilter}
                  onChange={(e) => setTransactionTypeFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Transaction Types</option>
                  <option value="DEPOSIT">Deposits</option>
                  <option value="WITHDRAWAL">Withdrawals</option>
                  <option value="TICKET_PURCHASE">Ticket Purchases</option>
                  <option value="GAME_WIN">Game Wins</option>
                  <option value="ADMIN_ADJUSTMENT">Admin Adjustments</option>
                  <option value="REFERRAL_BONUS">Referral Rewards</option>
                  <option value="WELCOME_BONUS">Welcome Bonuses</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Search User / Ref</label>
                <input
                  type="text"
                  placeholder="Search User or Ref..."
                  value={transactionSearchQuery}
                  onChange={(e) => setTransactionSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Start Date</label>
                <input
                  type="date"
                  value={transactionStartDate}
                  onChange={(e) => setTransactionStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">End Date</label>
                <input
                  type="date"
                  value={transactionEndDate}
                  onChange={(e) => setTransactionEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setTransactionTypeFilter('ALL');
                    setTransactionSearchQuery('');
                    setTransactionStartDate('');
                    setTransactionEndDate('');
                  }}
                  className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Reference</th>
                    <th className="p-3">User</th>
                    <th className="p-3">Type</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Balance After</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {allTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                        No transactions matching the current filter criteria found.
                      </td>
                    </tr>
                  ) : (
                    allTransactions.map((tx) => {
                      const uObj = allUsersList.find((u) => u.id === tx.userId);
                      const displayUser = uObj ? `@${uObj.username}` : tx.username ? `@${tx.username}` : tx.userId;
                      return (
                        <tr key={tx.id} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-mono text-[10px] text-slate-400">{tx.reference}</td>
                          <td className="p-3 font-bold text-white">{displayUser}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 font-mono text-[10px] font-bold">
                              {tx.type}
                            </span>
                          </td>
                          <td className={`p-3 font-black ${tx.amount >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} Birr
                          </td>
                          <td className="p-3 font-mono text-slate-300">{tx.balanceAfter} Birr</td>
                          <td className="p-3 text-[11px] text-slate-400">{tx.description}</td>
                          <td className="p-3 text-[10px] text-slate-500">{new Date(tx.createdAt).toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: DEPOSITS */}
        {activeTab === 'deposits' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <ArrowDownLeft className="w-4 h-4 text-amber-400" />
                <span>Deposit Verification Ledger ({deposits.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <select
                  value={depositStatusFilter}
                  onChange={(e) => setDepositStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Verification</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {deposits.map((dep) => (
                <div key={dep.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-extrabold text-white text-sm">@{dep.userName}</div>
                    <div className="text-slate-400">
                      Method: <strong className="text-amber-300">{dep.paymentMethodName}</strong> • Ref: <span className="font-mono text-white">{dep.referenceCode}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">Submitted: {new Date(dep.createdAt).toLocaleString()}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-emerald-400">{dep.amount} Birr</span>
                    <button
                      onClick={() => setSelectedDepositForReceipt(dep)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-xs flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Receipt</span>
                    </button>
                    {dep.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApproveDeposit(dep.id)}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => setRejectingDeposit(dep)}
                          className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-xs hover:bg-red-500/30 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {dep.status !== 'PENDING' && (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        dep.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {dep.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: WITHDRAWALS */}
        {activeTab === 'withdrawals' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <ArrowUpRight className="w-4 h-4 text-amber-400" />
                <span>Withdrawal & Payout Requests ({withdrawals.length})</span>
              </h3>

              <div className="flex items-center gap-2">
                <select
                  value={withdrawalStatusFilter}
                  onChange={(e) => setWithdrawalStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Review</option>
                  <option value="APPROVED">Approved & Paid</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {withdrawals.map((wd) => (
                <div key={wd.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="font-extrabold text-white text-sm">@{wd.userName}</div>
                    <div className="text-slate-400">
                      {wd.paymentMethodName} • Account: <span className="font-mono text-amber-300">{wd.accountNumber}</span> ({wd.accountName})
                    </div>
                    <div className="text-[10px] text-slate-500">Requested: {new Date(wd.createdAt).toLocaleString()}</div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-lg font-black text-amber-400">{wd.amount} Birr</span>
                    {wd.status === 'PENDING' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setApprovingWithdrawal(wd)}
                          className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition"
                        >
                          Approve Payout
                        </button>
                        <button
                          onClick={() => setRejectingWithdrawal(wd)}
                          className="px-3 py-1.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-xs hover:bg-red-500/30 transition"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {wd.status !== 'PENDING' && (
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold ${
                        wd.status === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {wd.status}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 8: WINNERS */}
        {activeTab === 'winners' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span>Bingo Game Champions & Winners ({allWinnersList.length})</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Historical archive of all jackpot and round winners across every Bingo arena.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportToCSV('bingo_winners_ledger', allWinnersList)}
                  className="px-3 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </button>
              </div>
            </div>

            {/* Winners Stats Summary */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Total Winners</span>
                <span className="text-lg font-black text-white">{winnersStats?.totalWinners || allWinnersList.length} Champions</span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Total Prize Pool Paid</span>
                <span className="text-lg font-black text-emerald-400">
                  {winnersStats?.totalPrizePaid || allWinnersList.reduce((sum, w) => sum + (w.prizeAmount || 0), 0)} Birr
                </span>
              </div>
              <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 font-bold uppercase block mb-1">Avg Prize Per Winner</span>
                <span className="text-lg font-black text-amber-400">
                  {allWinnersList.length > 0
                    ? Math.round(
                        (winnersStats?.totalPrizePaid || allWinnersList.reduce((sum, w) => sum + (w.prizeAmount || 0), 0)) /
                          allWinnersList.length
                      )
                    : 0}{' '}
                  Birr
                </span>
              </div>
            </div>

            {/* Winners Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 bg-slate-950 p-3.5 rounded-2xl border border-slate-800 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Search Winner / Ref</label>
                <input
                  type="text"
                  placeholder="e.g. dawit12 or REF-..."
                  value={winnerSearchQuery}
                  onChange={(e) => setWinnerSearchQuery(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1 font-sans">Game Room</label>
                <select
                  value={winnerRoomFilter}
                  onChange={(e) => setWinnerRoomFilter(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                >
                  <option value="ALL">All Rooms</option>
                  <option value="10">10 Birr Room</option>
                  <option value="50">50 Birr Room</option>
                  <option value="100">100 Birr Room</option>
                  <option value="200">200 Birr Room</option>
                  <option value="PRIVATE">Private Groups</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">Start Date</label>
                <input
                  type="date"
                  value={winnerStartDate}
                  onChange={(e) => setWinnerStartDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold block mb-1">End Date</label>
                <input
                  type="date"
                  value={winnerEndDate}
                  onChange={(e) => setWinnerEndDate(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-white"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={() => {
                    setWinnerSearchQuery('');
                    setWinnerRoomFilter('ALL');
                    setWinnerStartDate('');
                    setWinnerEndDate('');
                  }}
                  className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs"
                >
                  Reset Filters
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto rounded-2xl border border-slate-800">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">Winner</th>
                    <th className="p-3">Game Ref ID</th>
                    <th className="p-3">Prize Won</th>
                    <th className="p-3">Room</th>
                    <th className="p-3">Pattern</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {allWinnersList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-slate-500 italic">
                        No winning records matching the current filter criteria found.
                      </td>
                    </tr>
                  ) : (
                    allWinnersList.map((win, idx) => {
                      const roomObj = standardRooms.find((r) => r.id === win.roomId);
                      const roomName = roomObj ? roomObj.name : win.roomId;
                      return (
                        <tr key={idx} className="hover:bg-slate-800/40 transition">
                          <td className="p-3 font-extrabold text-white">@{win.username}</td>
                          <td className="p-3 font-mono text-[10px] text-amber-400 font-bold">{win.gameReferenceId || 'N/A'}</td>
                          <td className="p-3 font-black text-emerald-400">{win.prizeAmount} Birr</td>
                          <td className="p-3 font-bold text-slate-300">{roomName}</td>
                          <td className="p-3 font-mono text-[10px] text-indigo-300">{win.pattern}</td>
                          <td className="p-3 text-[10px] text-slate-400">{new Date(win.wonAt).toLocaleString()}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 9: BONUSES */}
        {activeTab === 'bonuses' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Gift className="w-4 h-4 text-amber-400" />
                  <span>Bonus Management Engine & Configurator</span>
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Configure real-time player bonuses, welcome credits, referral payouts, and deposit matches. Saved directly to database.
                </p>
              </div>

              <button
                onClick={handleSaveBonusPrograms}
                className="px-4 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                <span>Save Bonus Configs</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {bonusPrograms.map((b, idx) => (
                <div key={b.id || idx} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="font-extrabold text-white text-sm">{b.name}</span>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <span className="text-[10px] font-bold text-slate-400">{b.enabled ? 'ENABLED' : 'DISABLED'}</span>
                      <input
                        type="checkbox"
                        checked={b.enabled ?? true}
                        onChange={(e) => {
                          const updated = [...bonusPrograms];
                          updated[idx] = { ...updated[idx], enabled: e.target.checked };
                          setBonusPrograms(updated);
                        }}
                        className="w-4 h-4 rounded bg-slate-900 border-slate-800 text-amber-500 focus:ring-amber-500"
                      />
                    </label>
                  </div>

                  <p className="text-slate-400 text-[11px] leading-relaxed">{b.description}</p>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div>
                      <label className="text-[10px] text-slate-400 font-bold block mb-1">
                        {b.isPercentage ? 'Match % Value:' : 'Reward Amount (Birr):'}
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={b.amountBirr || 0}
                        onChange={(e) => {
                          const updated = [...bonusPrograms];
                          updated[idx] = { ...updated[idx], amountBirr: Number(e.target.value) };
                          setBonusPrograms(updated);
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-bold text-xs"
                      />
                    </div>

                    {b.minDepositBirr !== undefined && (
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Min Deposit (Birr):</label>
                        <input
                          type="number"
                          min="0"
                          value={b.minDepositBirr || 0}
                          onChange={(e) => {
                            const updated = [...bonusPrograms];
                            updated[idx] = { ...updated[idx], minDepositBirr: Number(e.target.value) };
                            setBonusPrograms(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-bold text-xs"
                        />
                      </div>
                    )}

                    {b.maxBonusBirr !== undefined && (
                      <div>
                        <label className="text-[10px] text-slate-400 font-bold block mb-1">Max Bonus Cap (Birr):</label>
                        <input
                          type="number"
                          min="0"
                          value={b.maxBonusBirr || 0}
                          onChange={(e) => {
                            const updated = [...bonusPrograms];
                            updated[idx] = { ...updated[idx], maxBonusBirr: Number(e.target.value) };
                            setBonusPrograms(updated);
                          }}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-white font-bold text-xs"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 10: REFERRALS */}
        {activeTab === 'referrals' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Share2 className="w-4 h-4 text-amber-400" />
              <span>Referral Program & Leaderboard</span>
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Code</th>
                    <th className="p-3">Invites</th>
                    <th className="p-3">Converted</th>
                    <th className="p-3">Earnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {referralStats.map((ref) => (
                    <tr key={ref.userId}>
                      <td className="p-3 font-extrabold text-white">@{ref.username}</td>
                      <td className="p-3 font-mono text-amber-300">{ref.referralCode}</td>
                      <td className="p-3 font-bold">{ref.totalInvites}</td>
                      <td className="p-3 text-emerald-400 font-bold">{ref.successfulReferrals}</td>
                      <td className="p-3 font-black text-amber-400">{ref.earnings} Birr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 11: BROADCASTER NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl max-w-xl">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-400" />
              <span>Send Platform Broadcast Announcement</span>
            </h3>

            <form onSubmit={handleSendBroadcast} className="space-y-3 text-xs">
              <div>
                <label className="text-[11px] text-slate-400 block font-bold mb-1">Announcement Title:</label>
                <input
                  type="text"
                  value={announcementTitle}
                  onChange={(e) => setAnnouncementTitle(e.target.value)}
                  placeholder="e.g. 🎁 Weekend Double Bonus Event!"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] text-slate-400 block font-bold mb-1">Message Content:</label>
                <textarea
                  value={announcementMessage}
                  onChange={(e) => setAnnouncementMessage(e.target.value)}
                  placeholder="Type message to broadcast to all users in app and via Telegram..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white h-24"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={announcementSending}
                className="w-full py-2.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition"
              >
                {announcementSending ? 'Broadcasting...' : '📢 Send Broadcast Now'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 12: REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-base font-black text-white flex items-center gap-2">
                    <FileBarChart className="w-5 h-5 text-amber-400" />
                    <span>Real-Time Platform Financial & System Reports</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Calculated directly from live Firestore collections and ledger balances.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={exportReportCSV}
                    className="px-3.5 py-2 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition shadow-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={exportReportExcel}
                    className="px-3.5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition shadow-lg"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5" />
                    <span>Export Excel (.xls)</span>
                  </button>
                  <button
                    onClick={exportReportPrint}
                    className="px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-1.5 transition shadow-lg"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print PDF</span>
                  </button>
                </div>
              </div>

              {/* Report Filters */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 bg-slate-950 p-4 rounded-2xl border border-slate-800 text-xs">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Start Date</label>
                  <input
                    type="date"
                    value={reportStartDate}
                    onChange={(e) => setReportStartDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">End Date</label>
                  <input
                    type="date"
                    value={reportEndDate}
                    onChange={(e) => setReportEndDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Game Room</label>
                  <select
                    value={reportRoomId}
                    onChange={(e) => setReportRoomId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                  >
                    <option value="ALL">All Rooms</option>
                    <option value="room_10">10 Birr Room</option>
                    <option value="room_50">50 Birr Room</option>
                    <option value="room_100">100 Birr Room</option>
                    <option value="room_200">200 Birr Room</option>
                    <option value="PRIVATE">Private Groups</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Game Ref ID</label>
                  <input
                    type="text"
                    placeholder="Ref ID..."
                    value={reportGameRefId}
                    onChange={(e) => setReportGameRefId(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white font-mono"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">Username</label>
                  <input
                    type="text"
                    placeholder="Username..."
                    value={reportUsername}
                    onChange={(e) => setReportUsername(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5 text-white"
                  />
                </div>
              </div>

              {/* REPORT METRICS & CHARTS */}
              {reportsData && (
                <div className="space-y-6 pt-2">
                  {/* 1. FINANCIAL REPORTS SECTION */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Coins className="w-4 h-4" />
                      <span>1. Financial & Revenue Report</span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Daily Net Revenue</span>
                        <span className="text-lg font-black text-emerald-400">{reportsData.financialReport?.dailyRevenue || 0} Birr</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Weekly Net Revenue</span>
                        <span className="text-lg font-black text-emerald-400">{reportsData.financialReport?.weeklyRevenue || 0} Birr</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Monthly Net Revenue</span>
                        <span className="text-lg font-black text-emerald-400">{reportsData.financialReport?.monthlyRevenue || 0} Birr</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Platform Rake Profit</span>
                        <span className="text-lg font-black text-indigo-400">{reportsData.financialReport?.platformEarnings || 0} Birr</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Total Prizes Distributed</span>
                        <span className="text-lg font-black text-amber-400">{reportsData.financialReport?.prizePaid || 0} Birr</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Verified Deposit Volume</span>
                        <span className="text-lg font-black text-emerald-400">
                          {reportsData.financialReport?.deposits?.totalAmount || 0} Birr
                        </span>
                        <span className="text-[10px] text-slate-500 block">({reportsData.financialReport?.deposits?.totalCount || 0} deposits)</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 col-span-2">
                        <span className="text-slate-400 block text-[10px]">Approved Withdrawal Volume</span>
                        <span className="text-lg font-black text-amber-400">
                          {reportsData.financialReport?.withdrawals?.totalAmount || 0} Birr
                        </span>
                        <span className="text-[10px] text-slate-500 block">({reportsData.financialReport?.withdrawals?.totalCount || 0} payouts)</span>
                      </div>
                    </div>
                  </div>

                  {/* 2. GAME REPORTS SECTION */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Gamepad2 className="w-4 h-4" />
                      <span>2. Game & Round Performance Report</span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Total Games Played</span>
                        <span className="text-lg font-black text-white">{reportsData.gameReport?.totalGamesPlayed || 0}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Tickets / Cards Sold</span>
                        <span className="text-lg font-black text-amber-400">{reportsData.gameReport?.ticketsSold || 0}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Total Prize Pools</span>
                        <span className="text-lg font-black text-emerald-400">{reportsData.gameReport?.prizePools || 0} Birr</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Simultaneous Winners</span>
                        <span className="text-lg font-black text-indigo-400">{reportsData.gameReport?.simultaneousWinnersCount || 0} rounds</span>
                      </div>
                    </div>

                    {/* Room Breakdown Bars */}
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-slate-300 font-extrabold text-xs block mb-2">Games Played Per Room Breakdown</span>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-xs">
                        {Object.entries(reportsData.gameReport?.gamesPerRoom || {}).map(([rmKey, count]: [string, any]) => (
                          <div key={rmKey} className="bg-slate-900 p-3 rounded-xl border border-slate-800">
                            <span className="text-[10px] text-slate-400 block font-mono uppercase">{rmKey.replace('_', ' ')}</span>
                            <span className="text-base font-black text-amber-400">{count} Games</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 3. USER REPORTS SECTION */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4" />
                      <span>3. User Registration & Liabilities Report</span>
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Total Registered Players</span>
                        <span className="text-lg font-black text-white">{reportsData.userReport?.totalUsers || 0}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">New Users Today</span>
                        <span className="text-lg font-black text-emerald-400">{reportsData.userReport?.newUsersToday || 0}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">Referred Users</span>
                        <span className="text-lg font-black text-indigo-400">{reportsData.userReport?.referralUsers || 0}</span>
                      </div>
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                        <span className="text-slate-400 block text-[10px]">System Wallet Liabilities</span>
                        <span className="text-lg font-black text-red-400">{reportsData.userReport?.totalWalletLiability || 0} Birr</span>
                      </div>
                    </div>
                  </div>

                  {/* 4. PERFORMANCE & CARD FREQUENCY REPORT */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Activity className="w-4 h-4" />
                      <span>4. Performance & Popularity Metrics</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                        <span className="text-slate-300 font-extrabold block">Averages & Activity</span>
                        <div className="space-y-1.5 text-slate-400">
                          <div className="flex justify-between">
                            <span>Average Players Per Game:</span>
                            <strong className="text-white">{reportsData.performanceReport?.avgPlayersPerGame || 0}</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Average Ticket Sales Per Game:</span>
                            <strong className="text-amber-400">{reportsData.performanceReport?.avgTicketSalesPerGame || 0} Birr</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Average Prize Pool Per Game:</span>
                            <strong className="text-emerald-400">{reportsData.performanceReport?.avgPrizePoolPerGame || 0} Birr</strong>
                          </div>
                          <div className="flex justify-between">
                            <span>Most Popular Arena:</span>
                            <strong className="text-indigo-400">{reportsData.performanceReport?.mostPopularRoom || '10 Birr Room'}</strong>
                          </div>
                        </div>
                      </div>

                      {/* Top 10 Card Numbers */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                        <span className="text-slate-300 font-extrabold block">Top Purchased Card Numbers</span>
                        {(reportsData.performanceReport?.mostPurchasedCards || []).length === 0 ? (
                          <div className="text-slate-500 text-[11px] py-3 text-center italic">
                            No card purchase records available for this filter.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {(reportsData.performanceReport?.mostPurchasedCards || []).slice(0, 5).map((c: any) => (
                              <div key={c.cardNumber} className="flex items-center justify-between text-[11px]">
                                <span className="text-amber-300 font-bold">Card #{c.cardNumber}</span>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 bg-slate-900 h-2 rounded-full overflow-hidden">
                                    <div
                                      className="bg-amber-500 h-full rounded-full"
                                      style={{ width: `${Math.min(100, c.count * 10)}%` }}
                                    />
                                  </div>
                                  <span className="font-bold text-white">{c.count} purchases</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 5. RECENT TRANSACTIONS & ACTIVITY LEDGER TABLE */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                      <Receipt className="w-4 h-4" />
                      <span>5. Transaction & Financial Ledger Breakdown</span>
                    </h4>
                    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden text-xs">
                      {(reportsData.recentLedger || []).length === 0 ? (
                        <div className="p-8 text-center text-slate-500 text-xs italic">
                          No transaction records found matching the selected date or filter criteria.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse text-xs">
                            <thead>
                              <tr className="bg-slate-900/80 text-slate-400 border-b border-slate-800 text-[11px]">
                                <th className="p-3 font-bold">Date & Time</th>
                                <th className="p-3 font-bold">User</th>
                                <th className="p-3 font-bold">Type</th>
                                <th className="p-3 font-bold">Amount</th>
                                <th className="p-3 font-bold">Description</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 text-slate-300">
                              {(reportsData.recentLedger || []).map((tx: any) => (
                                <tr key={tx.id} className="hover:bg-slate-900/40 transition">
                                  <td className="p-3 whitespace-nowrap text-slate-400 font-mono text-[11px]">
                                    {tx.createdAt ? new Date(tx.createdAt).toLocaleString() : 'N/A'}
                                  </td>
                                  <td className="p-3 font-bold text-white">{tx.username}</td>
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                        tx.type === 'DEPOSIT' || tx.type === 'WINNINGS'
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : tx.type === 'WITHDRAWAL'
                                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                          : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                                      }`}
                                    >
                                      {tx.type}
                                    </span>
                                  </td>
                                  <td className="p-3 font-black text-white">{tx.amount} Birr</td>
                                  <td className="p-3 text-slate-400 max-w-xs truncate">{tx.description || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 13: SYSTEM SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            {/* Category Tab Bar */}
            <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
              <button
                onClick={() => setSettingsCategoryTab('game')}
                className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition flex items-center gap-2 ${
                  settingsCategoryTab === 'game'
                    ? 'bg-amber-500 text-slate-950 shadow-lg'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Game Settings</span>
              </button>

              <button
                onClick={() => setSettingsCategoryTab('wallet')}
                className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition flex items-center gap-2 ${
                  settingsCategoryTab === 'wallet'
                    ? 'bg-amber-500 text-slate-950 shadow-lg'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Wallet & Payments</span>
              </button>

              <button
                onClick={() => setSettingsCategoryTab('referral')}
                className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition flex items-center gap-2 ${
                  settingsCategoryTab === 'referral'
                    ? 'bg-amber-500 text-slate-950 shadow-lg'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Gift className="w-3.5 h-3.5" />
                <span>Referral & Rewards</span>
              </button>

              <button
                onClick={() => setSettingsCategoryTab('security')}
                className={`px-4 py-2 rounded-2xl font-extrabold text-xs transition flex items-center gap-2 ${
                  settingsCategoryTab === 'security'
                    ? 'bg-amber-500 text-slate-950 shadow-lg'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Security & Toggles</span>
              </button>
            </div>

            {/* Success banner if saved */}
            {saveSuccessMessage && (
              <div className="bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-2xl p-4 text-xs font-bold flex items-center justify-between gap-2 shadow-lg animate-fade-in">
                <span>{saveSuccessMessage}</span>
                <button onClick={() => setSaveSuccessMessage('')} className="text-emerald-400 hover:text-white font-extrabold text-sm">✕</button>
              </div>
            )}

            {/* Editable Settings Form */}
            <form onSubmit={handlePromptSaveSettings} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-6 shadow-xl">
              {/* CATEGORY 1: GAME SETTINGS */}
              {settingsCategoryTab === 'game' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4 text-amber-400" />
                    <span>Bingo Game Mechanics & Engine Controls</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Countdown Duration (seconds):</label>
                      <input
                        type="number"
                        min="5"
                        value={platformSettings.countdownDurationSeconds ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, countdownDurationSeconds: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Lobby countdown timer before game starts.</p>
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Ball Draw Interval (seconds):</label>
                      <input
                        type="number"
                        min="1"
                        value={platformSettings.ballDrawIntervalSeconds ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, ballDrawIntervalSeconds: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Time between consecutive random ball calls.</p>
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Result Screen Duration (seconds):</label>
                      <input
                        type="number"
                        min="1"
                        value={platformSettings.resultScreenDurationSeconds ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, resultScreenDurationSeconds: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Celebration overlay delay before room resets.</p>
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Max Cards Per Player:</label>
                      <input
                        type="number"
                        min="1"
                        value={platformSettings.maxCardsPerPlayer ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, maxCardsPerPlayer: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Max Players Per Room:</label>
                      <input
                        type="number"
                        min="1"
                        value={platformSettings.maxPlayers ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, maxPlayers: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Min Players To Start:</label>
                      <input
                        type="number"
                        min="1"
                        value={platformSettings.minPlayers ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, minPlayers: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Card Reservation Timeout (sec):</label>
                      <input
                        type="number"
                        min="5"
                        value={platformSettings.cardReservationTimeoutSeconds ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, cardReservationTimeoutSeconds: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Platform Rake Fee (%):</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={platformSettings.platformFeePercent ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                          const prize = val === '' ? '' : 100 - Number(val);
                          setPlatformSettings((prev: any) => ({
                            ...prev,
                            platformFeePercent: val,
                            prizePercentage: prize,
                          }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">House commission percentage from ticket sales.</p>
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Winner Prize Share (%):</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={platformSettings.prizePercentage ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.min(100, Math.max(0, Number(e.target.value)));
                          const fee = val === '' ? '' : 100 - Number(val);
                          setPlatformSettings((prev: any) => ({
                            ...prev,
                            prizePercentage: val,
                            platformFeePercent: fee,
                          }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">Direct payout allocation for round winner(s).</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={platformSettings.autoRestartGame ?? true}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, autoRestartGame: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                      />
                      <span>Auto Restart Games When Round Finishes</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={platformSettings.autoResetCards ?? true}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, autoResetCards: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                      />
                      <span>Clear Transient Reservations on Reset</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={platformSettings.allowSpectators ?? true}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, allowSpectators: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                      />
                      <span>Allow Non-Playing Spectators</span>
                    </label>
                  </div>
                </div>
              )}

              {/* CATEGORY 2: WALLET SETTINGS */}
              {settingsCategoryTab === 'wallet' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <span>Deposit & Withdrawal Wallet Constraints</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Minimum Deposit (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.minDepositBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, minDepositBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Maximum Deposit (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.maxDepositBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, maxDepositBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Minimum Withdrawal (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.minWithdrawalBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, minWithdrawalBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Maximum Withdrawal (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.maxWithdrawalBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, maxWithdrawalBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-6 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={platformSettings.autoApproveDeposits ?? false}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, autoApproveDeposits: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                      />
                      <span>Auto Approve Valid Deposits</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-200">
                      <input
                        type="checkbox"
                        checked={platformSettings.autoApproveWithdrawals ?? false}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, autoApproveWithdrawals: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-950 border-slate-800"
                      />
                      <span>Auto Approve Small Withdrawals</span>
                    </label>
                  </div>
                </div>
              )}

              {/* CATEGORY 3: REFERRAL SETTINGS */}
              {settingsCategoryTab === 'referral' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Gift className="w-4 h-4 text-amber-400" />
                    <span>Referral Program & Signup Rewards</span>
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Referral Reward (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.referralRewardBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, referralRewardBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">New Player Welcome Gift (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.welcomeBonusBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, welcomeBonusBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>

                    <div>
                      <label className="text-slate-400 font-bold block mb-1">Max Referral Bonus Limit (Birr):</label>
                      <input
                        type="number"
                        value={platformSettings.maxReferralBonusBirr ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Number(e.target.value);
                          setPlatformSettings((prev: any) => ({ ...prev, maxReferralBonusBirr: val }));
                          markSettingsDirty();
                        }}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* CATEGORY 4: SECURITY SETTINGS */}
              {settingsCategoryTab === 'security' && (
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-white flex items-center gap-2">
                    <Lock className="w-4 h-4 text-amber-400" />
                    <span>System Toggles & Maintenance Controls</span>
                  </h3>

                  {platformSettings.maintenanceMode && (
                    <div className="bg-amber-500/20 border border-amber-500/40 p-4 rounded-2xl flex items-center gap-3 text-amber-300 text-xs">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-400" />
                      <span>
                        <strong>MAINTENANCE MODE IS ENABLED:</strong> Non-admin players will be blocked from joining games or depositing until turned off.
                      </span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 text-xs">
                    <label className="flex items-center gap-3 p-3.5 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platformSettings.maintenanceMode ?? false}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, maintenanceMode: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-800"
                      />
                      <div>
                        <span className="font-extrabold text-white block">Maintenance Mode</span>
                        <span className="text-[10px] text-slate-500">Temporarily restrict public app access for maintenance.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3.5 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platformSettings.enableRegistration ?? true}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, enableRegistration: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-800"
                      />
                      <div>
                        <span className="font-extrabold text-white block">Allow New User Registrations</span>
                        <span className="text-[10px] text-slate-500">Enable or disable new user account creation.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3.5 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platformSettings.enableDeposits ?? true}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, enableDeposits: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-800"
                      />
                      <div>
                        <span className="font-extrabold text-white block">Enable Wallet Deposits</span>
                        <span className="text-[10px] text-slate-500">Allow players to submit deposit receipts.</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-3 p-3.5 bg-slate-950 rounded-2xl border border-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={platformSettings.enableWithdrawals ?? true}
                        onChange={(e) => {
                          setPlatformSettings((prev: any) => ({ ...prev, enableWithdrawals: e.target.checked }));
                          markSettingsDirty();
                        }}
                        className="w-4 h-4 rounded text-amber-500 bg-slate-900 border-slate-800"
                      />
                      <div>
                        <span className="font-extrabold text-white block">Enable Payout Withdrawals</span>
                        <span className="text-[10px] text-slate-500">Allow players to request wallet withdrawals.</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <div className="pt-4 border-t border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-xl flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  <span>Review & Save System Configuration</span>
                </button>
              </div>
            </form>

            {/* AUDIT LOG & CHANGE HISTORY FOR SETTINGS */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <span>System Settings Change History Log ({settingsHistoryList.length})</span>
              </h3>

              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 font-bold uppercase text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="p-3">Timestamp</th>
                      <th className="p-3">Admin Email</th>
                      <th className="p-3">Client IP</th>
                      <th className="p-3">Modified Fields & Values</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-950/40">
                    {settingsHistoryList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-4 text-center text-slate-500 italic">
                          No settings history recorded yet.
                        </td>
                      </tr>
                    ) : (
                      settingsHistoryList.map((hist, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/40">
                          <td className="p-3 text-[10px] text-slate-400 font-mono">
                            {new Date(hist.timestamp).toLocaleString()}
                          </td>
                          <td className="p-3 font-bold text-white">{hist.updatedBy}</td>
                          <td className="p-3 font-mono text-[10px] text-amber-300">{hist.ipAddress || '127.0.0.1'}</td>
                          <td className="p-3 text-[11px]">
                            <div className="flex flex-wrap gap-1.5">
                              {(() => {
                                let changeItems: Array<{ field: string; oldValue: any; newValue: any }> = [];
                                if (hist.changes) {
                                  let raw = hist.changes;
                                  if (typeof raw === 'string') {
                                    try { raw = JSON.parse(raw); } catch { raw = {}; }
                                  }
                                  if (Array.isArray(raw)) {
                                    changeItems = raw.map((c: any) => ({
                                      field: c.field || c.key || 'setting',
                                      oldValue: c.oldValue !== undefined ? c.oldValue : c.old !== undefined ? c.old : 'N/A',
                                      newValue: c.newValue !== undefined ? c.newValue : c.new !== undefined ? c.new : 'N/A',
                                    }));
                                  } else if (typeof raw === 'object' && raw !== null) {
                                    changeItems = Object.entries(raw).map(([key, val]: [string, any]) => ({
                                      field: key,
                                      oldValue: val?.oldValue !== undefined ? val.oldValue : val?.old !== undefined ? val.old : 'N/A',
                                      newValue: val?.newValue !== undefined ? val.newValue : val?.new !== undefined ? val.new : 'N/A',
                                    }));
                                  }
                                }

                                if (changeItems.length === 0) {
                                  return <span className="text-slate-500 italic text-[10px]">No recorded field changes</span>;
                                }

                                return changeItems.map((c, cIdx) => (
                                  <span
                                    key={cIdx}
                                    className="px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 text-[10px]"
                                  >
                                    <strong>{c.field}</strong>: <span className="line-through text-red-400">{String(c.oldValue)}</span> &rarr;{' '}
                                    <span className="text-emerald-400 font-bold">{String(c.newValue)}</span>
                                  </span>
                                ));
                              })()}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payment Providers Config */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-amber-400" />
                  <span>Configured Payment Providers ({paymentMethods.length})</span>
                </h3>

                <button
                  onClick={() => setEditingPaymentMethod({ status: 'ACTIVE', providerType: 'MANUAL', logo: '📱' })}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5"
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Add Payment Provider</span>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {paymentMethods.map((pm) => (
                  <div key={pm.id} className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-white text-sm flex items-center gap-2">
                        <span>{pm.logo}</span>
                        <span>{pm.name}</span>
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        pm.status === 'ACTIVE' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                      }`}>
                        {pm.status}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400">{pm.description}</p>
                    <div className="text-[11px] text-amber-300 font-mono">
                      Account: {pm.accountNumber || pm.phoneNumber || 'N/A'} ({pm.accountName})
                    </div>
                    <div className="pt-2 flex justify-end">
                      <button
                        onClick={() => setEditingPaymentMethod(pm)}
                        className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-[10px] flex items-center gap-1"
                      >
                        <Edit className="w-3 h-3" />
                        <span>Edit Provider</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 14: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <ScrollText className="w-4 h-4 text-amber-400" />
                <span>System Security Audit Logs ({filteredAuditLogs.length})</span>
              </h3>

              <input
                type="text"
                placeholder="Search action, IP, admin..."
                value={auditSearchQuery}
                onChange={(e) => setAuditSearchQuery(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white"
              />
            </div>

            <div className="space-y-2">
              {filteredAuditLogs.map((log) => (
                <div key={log.id} className="bg-slate-950 p-3 rounded-2xl border border-slate-800 text-xs flex justify-between items-center">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-white">{log.action}</span>
                      {log.gameReferenceId && (
                        <span className="font-mono text-[9px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold">
                          {log.gameReferenceId}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400">{log.description}</p>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono">{new Date(log.timestamp).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 15: ADMIN PROFILE */}
        {activeTab === 'profile' && (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl max-w-xl">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-amber-400" />
              <span>SuperAdministrator Credentials</span>
            </h3>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div>Email: <strong className="text-amber-300 font-mono">dawitsolomon1823@gmail.com</strong></div>
              <div>Phone: <strong className="text-white font-mono">0918230227</strong></div>
              <div>Role: <strong className="text-emerald-400 font-mono">SuperAdmin</strong></div>
            </div>

            <form onSubmit={handleChangePassword} className="space-y-3 text-xs pt-2">
              <h4 className="font-bold text-white">Change Account Password</h4>
              {passwordChangeSuccess && (
                <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 font-bold">{passwordChangeSuccess}</div>
              )}
              <input
                type="password"
                placeholder="Enter new password..."
                value={newPasswordInput}
                onChange={(e) => setNewPasswordInput(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                required
              />
              <button
                type="submit"
                className="w-full py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs hover:bg-amber-400 transition"
              >
                Update Admin Password
              </button>
            </form>
          </div>
        )}
      </main>

      {/* USER FULL DETAIL MODAL */}
      {selectedUserDetail && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedUserDetail(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center font-black text-lg">
                {selectedUserDetail.user.firstName?.[0] || 'U'}
              </div>
              <div>
                <h3 className="text-base font-black text-white">@{selectedUserDetail.user.username}</h3>
                <p className="text-xs text-slate-400">{selectedUserDetail.user.firstName} {selectedUserDetail.user.lastName || ''} • Phone: {selectedUserDetail.user.phone || 'N/A'}</p>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">Wallet Balance</span>
                <span className="text-base font-black text-emerald-400">{selectedUserDetail.user.walletBalance} Birr</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">Bonus Balance</span>
                <span className="text-base font-black text-amber-400">{selectedUserDetail.user.bonusBalance} Birr</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">Total Deposited</span>
                <span className="text-base font-black text-indigo-400">{selectedUserDetail.user.totalDeposited || 0} Birr</span>
              </div>
              <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800">
                <span className="text-[10px] text-slate-400 block font-bold">Total Withdrawn</span>
                <span className="text-base font-black text-teal-400">{selectedUserDetail.user.totalWithdrawn || 0} Birr</span>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="flex gap-2 border-b border-slate-800 pb-2 overflow-x-auto">
              <button
                onClick={() => setUserModalTab('overview')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap ${userModalTab === 'overview' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              >
                Overview & Actions
              </button>
              <button
                onClick={() => setUserModalTab('txs')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap ${userModalTab === 'txs' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              >
                Transactions ({selectedUserDetail.transactions?.length || 0})
              </button>
              <button
                onClick={() => setUserModalTab('tickets')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap ${userModalTab === 'tickets' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              >
                Tickets ({selectedUserDetail.tickets?.length || 0})
              </button>
              <button
                onClick={() => setUserModalTab('history')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs whitespace-nowrap ${userModalTab === 'history' ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-300'}`}
              >
                Game History ({selectedUserDetail.history?.length || 0})
              </button>
            </div>

            {userModalTab === 'overview' && (
              <div className="space-y-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 space-y-1">
                  <div>Status: <strong className="text-amber-400">{selectedUserDetail.user.status}</strong></div>
                  <div>Role: <strong className="text-slate-200">{selectedUserDetail.user.role || 'USER'}</strong></div>
                  <div>Referral Code: <strong className="text-indigo-400 font-mono">{selectedUserDetail.user.referralCode}</strong></div>
                  <div>Joined: {new Date(selectedUserDetail.user.createdAt).toLocaleString()}</div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => {
                      setAdjustingUser(selectedUserDetail.user);
                      setSelectedUserDetail(null);
                    }}
                    className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs"
                  >
                    Adjust Wallet Balance
                  </button>
                  <button
                    onClick={() => {
                      setUserResetPasswordModal(selectedUserDetail.user);
                      setSelectedUserDetail(null);
                    }}
                    className="flex-1 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold text-xs"
                  >
                    Reset Password
                  </button>
                </div>
              </div>
            )}

            {userModalTab === 'txs' && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedUserDetail.transactions?.map((tx: any) => (
                  <div key={tx.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-extrabold text-white">{tx.type}</span>
                      <p className="text-[10px] text-slate-400">{tx.description}</p>
                    </div>
                    <span className={`font-black ${tx.amount >= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} Birr
                    </span>
                  </div>
                ))}
              </div>
            )}

            {userModalTab === 'tickets' && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedUserDetail.tickets?.map((tkt: any) => (
                  <div key={tkt.id} className="bg-slate-950 p-2.5 rounded-xl border border-slate-800 text-xs flex justify-between items-center">
                    <div>
                      <span className="font-extrabold text-amber-400">Card #{tkt.cardNumber}</span>
                      <p className="text-[10px] text-slate-400">Room: {tkt.roomId}</p>
                    </div>
                    <span className="font-bold text-emerald-400">{tkt.purchasePrice} Birr</span>
                  </div>
                ))}
              </div>
            )}

            {userModalTab === 'history' && (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {(!selectedUserDetail.history || selectedUserDetail.history.length === 0) ? (
                  <p className="text-slate-500 text-xs italic text-center py-4">No game history records found for this user.</p>
                ) : (
                  selectedUserDetail.history.map((rec: any) => (
                    <div key={rec.id} className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs flex justify-between items-center gap-2">
                      <div>
                        <div className="font-extrabold text-white flex items-center gap-1.5">
                          <span>{rec.roomName || rec.roomId}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold ${
                            rec.isWinner ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
                          }`}>
                            {rec.isWinner ? 'WON' : 'PLAYED'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono">
                          Ref: {rec.gameReferenceId || 'N/A'} • Cards: {rec.ticketCount || 1} • {new Date(rec.playedAt || rec.createdAt).toLocaleString()}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`font-black ${rec.isWinner ? 'text-emerald-400' : 'text-amber-400'}`}>
                          {rec.isWinner ? `+${rec.wonAmount || rec.prizeWon} Birr` : `-${rec.spentAmount || rec.ticketPrice} Birr`}
                        </span>
                        <button
                          onClick={() => handleDeleteGameHistory(rec.id)}
                          className="p-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30 transition"
                          title="Delete game history record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* INSPECT TICKET CARD MATRIX MODAL */}
      {selectedTicketForView && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/50 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedTicketForView(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center space-y-1">
              <h3 className="text-base font-black text-amber-300">
                Card #{selectedTicketForView.cardNumber} Matrix
              </h3>
              <p className="text-xs text-slate-400">
                Purchased by @{selectedTicketForView.username} • {selectedTicketForView.purchasePrice} Birr
              </p>
              {selectedTicketForView.gameReferenceId && (
                <p className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 py-1 px-2 rounded-lg border border-amber-500/20 inline-block">
                  Ref: {selectedTicketForView.gameReferenceId}
                </p>
              )}
            </div>

            {/* 5x5 Grid Representation */}
            <div className="grid grid-cols-5 gap-1.5 p-2 bg-slate-950 rounded-2xl border border-slate-800">
              {['B', 'I', 'N', 'G', 'O'].map((letter) => (
                <div key={letter} className="text-center font-black text-amber-400 text-sm py-1 border-b border-slate-800">
                  {letter}
                </div>
              ))}
              {generateCardMatrixByNumber(selectedTicketForView.cardNumber || 1).map((row, rIdx) =>
                row.map((cell, cIdx) => (
                  <div
                    key={`${rIdx}-${cIdx}`}
                    className={`h-10 rounded-xl flex items-center justify-center text-xs font-mono font-bold ${
                      cell === 'FREE'
                        ? 'bg-amber-500 text-slate-950 font-black'
                        : 'bg-slate-900 text-slate-100 border border-slate-800'
                    }`}
                  >
                    {cell}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* INSPECT DEPOSIT RECEIPT MODAL */}
      {selectedDepositForReceipt && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl relative">
            <button
              onClick={() => setSelectedDepositForReceipt(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-black text-white">Deposit Submission Receipt</h3>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <div>Depositor: <strong className="text-white">@{selectedDepositForReceipt.userName}</strong></div>
              <div>Payment Method: <strong className="text-amber-400">{selectedDepositForReceipt.paymentMethodName}</strong></div>
              <div>Reference Code: <strong className="text-emerald-400 font-mono">{selectedDepositForReceipt.referenceCode}</strong></div>
              <div>Amount: <strong className="text-xl text-amber-400 font-black">{selectedDepositForReceipt.amount} Birr</strong></div>
              <div>Submitted At: {new Date(selectedDepositForReceipt.createdAt).toLocaleString()}</div>
            </div>

            {selectedDepositForReceipt.screenshotUrl ? (
              <div className="rounded-2xl overflow-hidden border border-slate-800">
                <img src={selectedDepositForReceipt.screenshotUrl} alt="Receipt Screenshot" className="w-full h-auto max-h-60 object-contain bg-black" />
              </div>
            ) : (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center text-slate-500 text-xs">
                No screenshot attached. Reference code verified against banking records.
              </div>
            )}

            {selectedDepositForReceipt.status === 'PENDING' && (
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => handleApproveDeposit(selectedDepositForReceipt.id)}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-black text-xs hover:bg-emerald-400 transition"
                >
                  Approve Deposit
                </button>
                <button
                  onClick={() => {
                    setRejectingDeposit(selectedDepositForReceipt);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-red-500/20 text-red-300 border border-red-500/40 font-bold text-xs hover:bg-red-500/30 transition"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* APPROVE WITHDRAWAL CONFIRMATION MODAL */}
      {approvingWithdrawal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Approve Payout: @{approvingWithdrawal.userName}</h3>
            <p className="text-xs text-slate-400">
              Payout Amount: <strong className="text-amber-400 font-black">{approvingWithdrawal.amount} Birr</strong> to {approvingWithdrawal.paymentMethodName} ({approvingWithdrawal.accountNumber}).
            </p>

            <div>
              <label className="text-[10px] text-slate-400 block font-bold mb-1">Bank Reference Code (Optional):</label>
              <input
                type="text"
                placeholder="e.g. TXN-839210293"
                value={approvalTxRef}
                onChange={(e) => setApprovalTxRef(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono"
              />
            </div>

            <div className="flex gap-2">
              <button onClick={() => setApprovingWithdrawal(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
                Cancel
              </button>
              <button onClick={handleConfirmApproveWithdrawal} className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">
                Confirm Payout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT DEPOSIT MODAL */}
      {rejectingDeposit && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Reject Deposit Submission</h3>
            <textarea
              placeholder="Reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white h-24"
            />
            <div className="flex gap-2">
              <button onClick={() => setRejectingDeposit(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
                Cancel
              </button>
              <button onClick={handleConfirmRejectDeposit} className="flex-1 py-2 rounded-xl bg-red-500 text-white font-black text-xs">
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT WITHDRAWAL MODAL */}
      {rejectingWithdrawal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Reject Payout Request</h3>
            <textarea
              placeholder="Reason for rejection..."
              value={withdrawalRejectReason}
              onChange={(e) => setWithdrawalRejectReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white h-24"
            />
            <div className="flex gap-2">
              <button onClick={() => setRejectingWithdrawal(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
                Cancel
              </button>
              <button onClick={handleConfirmRejectWithdrawal} className="flex-1 py-2 rounded-xl bg-red-500 text-white font-black text-xs">
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST BALANCE MODAL */}
      {adjustingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Adjust Wallet Balance: @{adjustingUser.username}</h3>
            <div>
              <label className="text-[10px] text-slate-400 block font-bold">Amount Delta (Birr):</label>
              <input
                type="number"
                value={adjustAmount}
                onChange={(e) => setAdjustAmount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-amber-400 font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 block font-bold">Reason:</label>
              <input
                type="text"
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setAdjustingUser(null)} className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold">
                Cancel
              </button>
              <button onClick={handleConfirmAdjustBalance} className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">
                Confirm Adjustment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* USER RESET PASSWORD MODAL */}
      {userResetPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Reset PIN/Password for @{userResetPasswordModal.username}</h3>
            <form onSubmit={handleResetUserPassword} className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">New 6-Digit Password/PIN:</label>
                <input
                  type="password"
                  value={resetUserPasswordInput}
                  onChange={(e) => setResetUserPasswordInput(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-bold"
                  required
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUserResetPasswordModal(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs">
                  Reset Password
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PAYMENT METHOD MODAL */}
      {editingPaymentMethod && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Configure Payment Provider</h3>
            <form onSubmit={handleSavePaymentMethod} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Provider Name:</label>
                <input
                  type="text"
                  value={editingPaymentMethod.name || ''}
                  onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, name: e.target.value })}
                  placeholder="e.g. Telebirr, CBE Birr..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Account Holder Name:</label>
                <input
                  type="text"
                  value={editingPaymentMethod.accountName || ''}
                  onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, accountName: e.target.value })}
                  placeholder="e.g. Dawit Solomon"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Account or Phone Number:</label>
                <input
                  type="text"
                  value={editingPaymentMethod.accountNumber || editingPaymentMethod.phoneNumber || ''}
                  onChange={(e) =>
                    setEditingPaymentMethod({
                      ...editingPaymentMethod,
                      accountNumber: e.target.value,
                      phoneNumber: e.target.value,
                    })
                  }
                  placeholder="e.g. 0918230227 or 1000..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-mono font-bold"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Instructions:</label>
                <textarea
                  value={editingPaymentMethod.instructions || ''}
                  onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, instructions: e.target.value })}
                  placeholder="Step-by-step payment instructions..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white h-20"
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Status:</label>
                <select
                  value={editingPaymentMethod.status || 'ACTIVE'}
                  onChange={(e) => setEditingPaymentMethod({ ...editingPaymentMethod, status: e.target.value as any })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white"
                >
                  <option value="ACTIVE">Active</option>
                  <option value="INACTIVE">Inactive</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingPaymentMethod(null)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 font-black">
                  Save Provider
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SETTINGS CONFIRMATION MODAL */}
      {showSettingsConfirmModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 font-bold">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-black text-white">Confirm System Settings Changes</h3>
                <p className="text-xs text-slate-400">Review updated parameters before saving permanently to Firestore.</p>
              </div>
            </div>

            <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Pending Modifications List:
              </span>
              <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
                {Object.entries(platformSettings).map(([key, val]) => (
                  <div key={key} className="flex items-center justify-between py-1 border-b border-slate-900 text-[11px]">
                    <span className="text-slate-300 font-mono">{key}</span>
                    <strong className="text-amber-400">{String(val)}</strong>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowSettingsConfirmModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition"
              >
                Cancel & Review
              </button>
              <button
                type="button"
                onClick={handleSaveSettingsConfirmed}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition shadow-lg"
              >
                Confirm & Apply Settings
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE ROOM MODAL */}
      {creatingNewRoom && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-sm font-black text-white">Create New Bingo Arena</h3>
            <form onSubmit={handleCreateRoom} className="space-y-3 text-xs">
              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Room Name:</label>
                <input
                  type="text"
                  value={roomFormData.name}
                  onChange={(e) => setRoomFormData({ ...roomFormData, name: e.target.value })}
                  placeholder="e.g. VIP Mega Arena"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  required
                />
              </div>

              <div>
                <label className="text-[10px] text-slate-400 block font-bold mb-1">Ticket Price (Birr):</label>
                <input
                  type="number"
                  value={roomFormData.ticketPrice}
                  onChange={(e) => setRoomFormData({ ...roomFormData, ticketPrice: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white font-bold"
                  required
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreatingNewRoom(false)}
                  className="flex-1 py-2 rounded-xl bg-slate-800 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button type="submit" className="flex-1 py-2 rounded-xl bg-amber-500 text-slate-950 font-black">
                  Create Room
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
