/**
 * Core Shared Types for Yabede Bingo Telegram Mini App & Admin Panel
 */

export type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'BANNED';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  photo_url?: string;
  is_premium?: boolean;
}

export interface ActiveSession {
  sessionId: string;
  refreshToken: string;
  deviceFingerprint?: string;
  ipAddress?: string;
  createdAt: string;
  lastActive: string;
}

export interface UserProfile {
  id: string;
  telegramId: number;
  phone?: string;
  role?: 'USER' | 'ADMIN';
  username: string;
  firstName: string;
  lastName?: string;
  photoUrl?: string;
  language: 'en' | 'am';
  referralCode: string;
  referredBy?: string;
  walletBalance: number;
  bonusBalance: number;
  vipLevel: number;
  status: UserStatus;
  createdAt: string;
  lastLogin?: string;
  deviceFingerprint?: string;
  totalWins: number;
  totalGamesPlayed: number;
  totalDeposited: number;
  totalWithdrawn: number;
  referralEarnings?: number;
  referralCount?: number;
  updatedAt?: string;
}

export interface PhoneUserAuth {
  phone: string;
  passwordHash: string;
  failedLoginAttempts: number;
  lockedUntil?: string | null;
  resetOtp?: string | null;
  resetOtpExpires?: string | null;
  activeSessions: ActiveSession[];
}

export type TransactionType =
  | 'DEPOSIT'
  | 'WITHDRAWAL'
  | 'TICKET_PURCHASE'
  | 'GAME_WIN'
  | 'HOST_BONUS'
  | 'REFERRAL_BONUS'
  | 'DAILY_BONUS'
  | 'SPIN_WIN'
  | 'REFUND'
  | 'GAME_REFUND'
  | 'ADMIN_ADJUSTMENT';

export type TransactionStatus = 'COMPLETED' | 'PENDING' | 'FAILED' | 'REJECTED';

export interface WalletTransaction {
  id: string;
  userId: string;
  username?: string;
  amount: number;
  balanceAfter: number;
  type: TransactionType;
  status: TransactionStatus;
  reference: string;
  description: string;
  gameReferenceId?: string;
  createdAt: string;
}

export type PaymentProviderType = 'MANUAL' | 'TELEBIRR_GATEWAY' | 'CBE_GATEWAY' | 'CHAPA_GATEWAY' | 'SANTIMPAY_GATEWAY';

export interface PaymentMethodConfig {
  id: string;
  name: string;               // e.g. "Telebirr", "CBE Birr", "Commercial Bank of Ethiopia (CBE)", "Awash Bank"
  logo: string;               // Icon or image URL
  description: string;        // Short description (e.g. "Transfer via Telebirr App or *127#")
  accountName: string;        // Admin recipient name
  phoneNumber?: string;       // Admin phone number for mobile money
  accountNumber?: string;     // Admin bank account number
  qrCodeUrl?: string;         // Admin QR code image
  instructions: string;       // Detailed step-by-step payment instructions
  status: 'ACTIVE' | 'INACTIVE';
  providerType: PaymentProviderType; // Default 'MANUAL'
  createdAt: string;
  updatedAt: string;
}

export interface DepositRequest {
  id: string;
  userId: string;
  userName: string;
  userTelegramId: number;
  paymentMethodId: string;
  paymentMethodName: string;
  amount: number;
  mobileNumber?: string;
  referenceCode: string;       // Transaction reference number
  screenshotUrl?: string;      // Receipt screenshot image/file URL or base64
  note?: string;               // User note
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'INFO_REQUESTED';
  rejectionReason?: string;
  adminNote?: string;
  processedByAdminId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WithdrawalRequest {
  id: string;
  userId: string;
  userName: string;
  userTelegramId: number;
  paymentMethodId: string;
  paymentMethodName: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  note?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string;
  processedByAdminId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'DEPOSIT_APPROVED' | 'DEPOSIT_REJECTED' | 'WITHDRAWAL_APPROVED' | 'WITHDRAWAL_REJECTED' | 'INFO_REQUESTED' | 'SYSTEM';
  read: boolean;
  createdAt: string;
}

export type WinningPattern =
  | 'ONE_LINE'
  | 'TWO_LINES'
  | 'FULL_HOUSE'
  | 'FOUR_CORNERS'
  | 'CORNERS'
  | 'ONE_LINE_FAST_AND_CORNERS'
  | 'ONE_LINE_AND_CORNERS';

export type RoomStatus =
  | 'WAITING'
  | 'COUNTDOWN'
  | 'STARTING'
  | 'PLAYING'
  | 'FINISHED'
  | 'RESETTING'
  | 'START_FAILED'
  | 'CANCELLED'
  | 'WAITING_HOST_DECISION';

export type PrizeDistributionRule = 'WINNER_100' | 'HOST_10_WINNER_90' | 'SPLIT_30_70';

export type GroupMemberStatus = 'INVITED' | 'JOINED' | 'READY' | 'DECLINED';

export type PrivateGroupStatus = 'LOBBY' | 'COUNTDOWN' | 'PLAYING' | 'FINISHED' | 'WAITING_HOST_DECISION' | 'CLOSED' | 'CANCELLED';

export interface PrivateGroup {
  id: string;
  gameReferenceId?: string;
  code: string;               // e.g. "BG9X2A"
  name: string;
  imageUrl?: string;
  hostId: string;
  hostName: string;
  ticketPrice: number;
  maxPlayers: number;
  playerCount?: number;
  maxTicketsPerPlayer: number;
  winningPattern: WinningPattern;
  prizeDistribution: PrizeDistributionRule;
  autoStartReady: boolean;
  allowSpectators: boolean;
  startTime?: string;
  status: PrivateGroupStatus;
  countdownSeconds: number;
  startedAt?: string;
  endsAt?: string;
  currentBall: number | null;
  drawnBalls: number[];
  prizePool: number;
  ticketsSold?: number;
  remainingTickets?: number;
  totalSales?: number;
  platformFee?: number;
  activePlayersCount?: number;
  hostDecisionTimeout?: number;
  lastWinners?: GameWinner[];
  cancelReason?: string;
  createdAt: string;
}

export interface GroupMember {
  groupId: string;
  userId: string;
  username: string;
  firstName: string;
  photoUrl?: string;
  status: GroupMemberStatus;
  ticketCount: number;
  joinedAt: string;
}

export interface GroupInvitation {
  id: string;
  groupId: string;
  groupName: string;
  groupCode?: string;
  hostId: string;
  hostName: string;
  invitedUserId: string;
  invitedUsername: string;
  status: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  createdAt: string;
}

export interface GroupMessage {
  id: string;
  groupId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: string;
  system?: boolean;
}

export interface CardReservation {
  id: string;          // e.g. "room_10_187"
  roomId: string;      // e.g. "room_10"
  gameReferenceId?: string; // e.g. "GM-10-10-854721"
  cardNumber: number;  // 1 to 400
  userId: string;
  username: string;
  status: 'RESERVED' | 'SOLD';
  purchasedAt?: string;
  reservedAt?: string;
  createdAt?: string;
  expiresAt?: number;
}

export interface BingoRoom {
  id: string;
  gameReferenceId?: string;
  name: string;
  description: string;
  icon: string;
  ticketPrice: number;
  minPlayers: number;
  maxPlayers: number;
  status: RoomStatus;
  currentBall: number | null;
  drawnBalls: number[];
  winningPatterns: WinningPattern[];
  prizePool: number;
  platformFee?: number;
  countdownSeconds: number;
  startedAt?: string;
  endsAt?: string;
  activePlayersCount: number;
  ticketsSold?: number;
  lastWinners?: GameWinner[];
  createdAt: string;
}

export interface RoomStats {
  roomId: string;
  gameReferenceId?: string;
  prizePool: number;
  platformFee: number;
  ticketsSold: number;
  totalSales: number;
  activePlayersCount: number;
  updatedAt?: string;
}

export interface BingoTicket {
  id: string;
  roomId: string;
  gameReferenceId?: string;
  cardNumber?: number;
  userId: string;
  username?: string;
  matrix: (number | 'FREE')[][]; // 5x5 grid
  daubed: boolean[][];           // 5x5 boolean grid
  status: 'ACTIVE' | 'BINGO_CLAIMED' | 'COMPLETED' | 'CANCELLED' | 'REFUND_PENDING' | 'REFUNDED';
  purchasePrice: number;
  boughtAt: string;
  refundedAt?: string;
  refundReason?: string;
  winningStatus?: 'WON' | 'LOST' | 'PENDING';
  prizeWon?: number;
}

export interface GameWinner {
  id: string;
  roomId: string;
  gameReferenceId?: string;
  ticketId?: string;
  userId: string;
  username: string;
  photoUrl?: string;
  cardNumber?: number;
  ticketPrice?: number;
  pattern: WinningPattern;
  prizeAmount: number;
  totalPrizePool?: number;
  wonAt: string;
}

export interface GameHistoryRecord {
  id: string;
  roomId: string;
  gameReferenceId?: string;
  roomName: string;
  roomIcon?: string;
  ticketPrice: number;
  userId: string;
  cardNumbers: number[];
  ticketsCount: number;
  outcome: 'WON' | 'LOST';
  winningPattern?: WinningPattern | null;
  prizeWon: number;
  totalPrizePool: number;
  totalPlayersCount: number;
  totalTicketsSold: number;
  drawnBallsCount: number;
  drawnBalls: number[];
  winners: GameWinner[];
  playedAt: string;
}

export interface BonusProgram {
  id: string;
  name: string;
  type: 'WELCOME' | 'REGISTRATION' | 'REFERRAL' | 'DEPOSIT' | 'DAILY' | 'PROMO' | 'SPIN';
  enabled: boolean;
  amountBirr: number;
  isPercentage?: boolean;
  minDepositBirr?: number;
  maxBonusBirr?: number;
  description: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  userId: string;
  username: string;
  text: string;
  timestamp: string;
  system?: boolean;
}

export interface LeaderboardEntry {
  userId: string;
  username: string;
  firstName: string;
  photoUrl?: string;
  vipLevel: number;
  score: number; // total wins, referrals, or profit
  totalWins: number;
  totalGamesPlayed: number;
  rank: number;
}

export interface ReferralStat {
  referralCode: string;
  totalReferredCount: number;
  totalEarnings: number;
  referrals: {
    userId: string;
    username: string;
    joinedAt: string;
    bonusEarned: number;
  }[];
}

export interface DailyBonusState {
  currentStreak: number;
  lastClaimedDate: string | null;
  canClaimToday: boolean;
  streakRewards: number[]; // Birr amounts for days 1 to 7
}

export interface SpinReward {
  id: string;
  label: string;
  amount: number;
  type: 'CASH' | 'BONUS' | 'VIP';
  color: string;
  probability: number;
}

export interface AuditLog {
  id: string;
  adminId: string;
  action: string;
  targetUserId?: string;
  details: string;
  description?: string;
  reason?: string;
  ipAddress?: string;
  gameReferenceId?: string;
  timestamp: string;
}

export interface SystemMetrics {
  totalUsers: number;
  onlineUsers: number;
  activeGames: number;
  totalDepositedToday: number;
  totalWithdrawnToday: number;
  pendingDepositsCount: number;
  pendingWithdrawalsCount: number;
  totalApprovedDepositsCount: number;
  totalRejectedDepositsCount: number;
  totalApprovedWithdrawalsCount: number;
  totalRejectedWithdrawalsCount: number;
  totalPlatformProfit: number;
  totalWalletLiability: number;
  systemUptimeSeconds?: number;
  redisClusterStatus?: string;
  lastLedgerAuditTimestamp?: string;
}

export interface SystemSettingsConfig {
  version?: number;
  updatedAt?: string;
  updatedBy?: string;

  // Game Settings
  countdownDurationSeconds: number;
  ballDrawIntervalSeconds: number;
  resultScreenDurationSeconds: number;
  maxCardsPerPlayer: number;
  maxPlayers: number;
  minPlayers: number;
  autoRestartGame: boolean;
  autoResetCards: boolean;
  prizePercentage: number;
  platformFeePercent: number;
  allowSpectators: boolean;
  cardReservationTimeoutSeconds: number;
  winningPatterns: string[];
  privateGroupMaxPlayers: number;
  privateGroupMaxTicketsPerPlayer: number;

  // Wallet Settings
  minDepositBirr: number;
  maxDepositBirr: number;
  minWithdrawalBirr: number;
  maxWithdrawalBirr: number;
  autoApproveDeposits: boolean;
  autoApproveWithdrawals: boolean;

  // Referral Settings
  referralRewardBirr: number;
  welcomeBonusBirr: number;
  maxReferralBonusBirr: number;

  // Security Settings
  maintenanceMode: boolean;
  enableRegistration: boolean;
  enableLogin: boolean;
  enableWithdrawals: boolean;
  enableDeposits: boolean;

  // Platform defaults
  ticketPrices: number[];
  announcements?: { id: string; title: string; message: string; createdAt: string }[];
}
