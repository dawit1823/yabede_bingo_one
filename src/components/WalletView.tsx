import React, { useEffect, useState } from 'react';
import { UserProfile, WalletTransaction, DepositRequest, WithdrawalRequest, PaymentMethodConfig } from '../types';
import { triggerHaptic, triggerNotificationHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  Copy,
  Check,
  Upload,
  AlertCircle,
  FileCheck,
  QrCode,
  ShieldAlert,
  Clock,
  CheckCircle2,
  XCircle,
  Info,
  RefreshCw,
  Image as ImageIcon,
  Smartphone,
} from 'lucide-react';

interface WalletViewProps {
  user: UserProfile;
  transactions: WalletTransaction[];
  onDeposit: (params: {
    paymentMethodId: string;
    amount: number;
    referenceCode: string;
    mobileNumber?: string;
    screenshotUrl?: string;
    note?: string;
  }) => Promise<void>;
  onWithdraw: (params: {
    paymentMethodId: string;
    paymentMethodName: string;
    amount: number;
    accountNumber: string;
    accountName: string;
    note?: string;
  }) => Promise<void>;
  onOpenPhoneVerification?: () => void;
  language: 'en' | 'am';
}

export const WalletView: React.FC<WalletViewProps> = ({
  user,
  transactions,
  onDeposit,
  onWithdraw,
  onOpenPhoneVerification,
  language,
}) => {
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>('deposit');

  // Dynamic Payment Methods loaded from server
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethodConfig[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodConfig | null>(null);

  // User Deposit Requests History
  const [userDeposits, setUserDeposits] = useState<DepositRequest[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // Deposit Form States
  const [depositAmount, setDepositAmount] = useState<number>(100);
  const [referenceCode, setReferenceCode] = useState<string>('');
  const [mobileNumber, setMobileNumber] = useState<string>(user?.phone || '');
  const [depositNote, setDepositNote] = useState<string>('');
  const [screenshotUrl, setScreenshotUrl] = useState<string>('');
  const [screenshotFileName, setScreenshotFileName] = useState<string>('');
  const [fileError, setFileError] = useState<string>('');
  const [isSubmittingDeposit, setIsSubmittingDeposit] = useState<boolean>(false);
  const [depositSuccessMsg, setDepositSuccessMsg] = useState<string | null>(null);

  // Withdrawal Form States
  const [withdrawAmount, setWithdrawAmount] = useState<number>(200);
  const [withdrawAccountNumber, setWithdrawAccountNumber] = useState<string>(user?.phone || '');
  const [withdrawAccountName, setWithdrawAccountName] = useState<string>('');
  const [withdrawNote, setWithdrawNote] = useState<string>('');
  const [isSubmittingWithdraw, setIsSubmittingWithdraw] = useState<boolean>(false);
  const [withdrawSuccessMsg, setWithdrawSuccessMsg] = useState<string | null>(null);

  // Copy state helper
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Auto-fill phone number when available
  useEffect(() => {
    if (user?.phone) {
      setMobileNumber((prev) => (prev ? prev : user.phone || ''));
      setWithdrawAccountNumber((prev) => (prev ? prev : user.phone || ''));
    }
  }, [user?.phone]);

  // Load Payment Methods & Deposit History
  const fetchPaymentMethods = async () => {
    try {
      const res = await fetch(apiUrl('/api/payment/methods'));
      if (res.ok) {
        const data = await res.json();
        setPaymentMethods(data.methods || []);
        if (data.methods && data.methods.length > 0) {
          setSelectedMethod(data.methods[0]);
        }
      }
    } catch {
      // Fallback default
    }
  };

  const fetchUserDeposits = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetch(apiUrl(`/api/user/deposits?userId=${user.id}`));
      if (res.ok) {
        const data = await res.json();
        setUserDeposits(data.deposits || []);
      }
    } catch {
      // Fallback
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchPaymentMethods();
    fetchUserDeposits();
  }, [user.id]);

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    triggerHaptic('light');
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Receipt Upload & File Validation
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError('');

    if (!file) return;

    // Validate File Type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowedTypes.includes(file?.type || '')) {
      setFileError('Invalid file type. Please upload a JPG, PNG, WEBP image or PDF receipt.');
      triggerNotificationHaptic('error');
      return;
    }

    // Validate File Size (Max 5MB)
    const maxSizeInBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeInBytes) {
      setFileError('File size exceeds 5MB limit. Please compress or choose a smaller image.');
      triggerNotificationHaptic('error');
      return;
    }

    setScreenshotFileName(file.name);

    // Read file as Base64 Data URL for instant receipt preview
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setScreenshotUrl(reader.result);
        triggerHaptic('medium');
      }
    };
    reader.readAsDataURL(file);
  };

  // Submit Deposit Request
  const handleSubmitDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethod) return;

    if (!referenceCode || referenceCode.trim().length < 4) {
      alert('Please enter a valid Transaction Reference Number (e.g. TLB129381)');
      return;
    }

    if (depositAmount <= 0) {
      alert('Please enter a valid deposit amount in Birr');
      return;
    }

    setIsSubmittingDeposit(true);
    setDepositSuccessMsg(null);

    try {
      await onDeposit({
        paymentMethodId: selectedMethod.id,
        amount: depositAmount,
        referenceCode: referenceCode.trim(),
        mobileNumber,
        screenshotUrl,
        note: depositNote,
      });

      triggerNotificationHaptic('success');
      setDepositSuccessMsg(
        `Your deposit request of ${depositAmount} Birr via ${selectedMethod.name} has been submitted! Reference: ${referenceCode.trim()}. Administrator is verifying your payment.`
      );

      // Reset form
      setReferenceCode('');
      setDepositNote('');
      setScreenshotUrl('');
      setScreenshotFileName('');

      fetchUserDeposits();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Deposit submission failed');
    } finally {
      setIsSubmittingDeposit(false);
    }
  };

  // Submit Withdrawal Request
  const handleSubmitWithdrawal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMethod) return;

    if (withdrawAmount <= 0) {
      alert('Please enter a valid withdrawal amount');
      return;
    }

    if (user.walletBalance < withdrawAmount) {
      alert('Insufficient wallet balance for withdrawal');
      return;
    }

    if (!withdrawAccountNumber) {
      alert('Please enter your Account or Phone number for receiving funds');
      return;
    }

    setIsSubmittingWithdraw(true);
    setWithdrawSuccessMsg(null);

    try {
      await onWithdraw({
        paymentMethodId: selectedMethod.id,
        paymentMethodName: selectedMethod.name,
        amount: withdrawAmount,
        accountNumber: withdrawAccountNumber,
        accountName: withdrawAccountName || user.firstName,
        note: withdrawNote,
      });

      triggerNotificationHaptic('success');
      setWithdrawSuccessMsg(
        `Withdrawal request of ${withdrawAmount} Birr to ${selectedMethod.name} (${withdrawAccountNumber}) submitted successfully! Your funds are on hold pending admin payout.`
      );

      setWithdrawNote('');
      fetchUserDeposits();
    } catch (err: any) {
      triggerNotificationHaptic('error');
      alert(err.message || 'Withdrawal submission failed');
    } finally {
      setIsSubmittingWithdraw(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Wallet Balance Card */}
      <div className="bg-gradient-to-br from-slate-900 via-amber-950/40 to-slate-950 border border-amber-500/30 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="flex items-center justify-between relative z-10">
          <div>
            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">
              {language === 'am' ? 'የኪስ ቦርሳ ቀሪ ሂሳብ' : 'Total Wallet Balance'}
            </span>
            <div className="text-3xl font-black text-white flex items-baseline gap-2 mt-1">
              <span>{(user?.walletBalance ?? 0).toLocaleString()}</span>
              <span className="text-amber-400 font-bold text-base">ETB / Birr</span>
            </div>

            {(user?.bonusBalance ?? 0) > 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-bold mt-2">
                🎁 +{user.bonusBalance} Birr Playable Bonus Balance
              </div>
            )}
          </div>

          <div className="w-14 h-14 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shadow-inner">
            <Wallet className="w-8 h-8" />
          </div>
        </div>

        {/* Security Banner */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center gap-2 text-[11px] text-slate-400">
          <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>
            Manual Verification System: Safe & Direct P2P transfers. All deposits & withdrawals verified by Admin.
          </span>
        </div>
      </div>

      {/* If user is not verified, prompt them to verify phone first */}
      {!user.phone ? (
        <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-amber-950/30 border border-amber-500/40 rounded-3xl p-6 text-center space-y-4 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="w-16 h-16 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-inner">
            <Smartphone className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">
              {language === 'am' ? 'የስልክ ቁጥር ማረጋገጫ ያስፈልጋል' : 'Phone Verification Required'}
            </h3>
            <p className="text-xs text-slate-300 max-w-md mx-auto mt-2 leading-relaxed">
              {language === 'am'
                ? 'የኪስ ቦርሳ እና የባንክ አገልግሎት ለመጠቀም፣ ገንዘብ ገቢ (Deposit) እና ወጪ (Withdraw) ለማድረግ እባክዎ መጀመሪያ ስልክ ቁጥርዎን ያረጋግጡ።'
                : 'To access Wallet & Banking services, make deposits, or request withdrawals, please verify your Ethiopian phone number first.'}
            </p>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center max-w-xs mx-auto">
            <button
              onClick={() => {
                triggerHaptic('medium');
                onOpenPhoneVerification?.();
              }}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/25 cursor-pointer active:scale-95"
            >
              <Smartphone className="w-4 h-4" />
              <span>{language === 'am' ? '📱 አሁን ስልክዎን ያረጋግጡ' : '📱 Verify Phone Number Now'}</span>
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Tabs Switcher */}
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
        <button
          onClick={() => {
            setActiveTab('deposit');
            triggerHaptic('light');
          }}
          className={`py-2.5 px-1 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 sm:gap-1.5 transition truncate ${
            activeTab === 'deposit'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{language === 'am' ? 'ገቢ' : 'Deposit'}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('withdraw');
            triggerHaptic('light');
          }}
          className={`py-2.5 px-1 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 sm:gap-1.5 transition truncate ${
            activeTab === 'withdraw'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{language === 'am' ? 'ወጪ' : 'Withdraw'}</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('history');
            triggerHaptic('light');
            fetchUserDeposits();
          }}
          className={`py-2.5 px-1 rounded-xl text-[11px] sm:text-xs font-black flex items-center justify-center gap-1 sm:gap-1.5 transition truncate ${
            activeTab === 'history'
              ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
          <span className="truncate">{language === 'am' ? 'ታሪክ' : 'History'}</span>
        </button>
      </div>

      {/* TAB 1: DEPOSIT FLOW */}
      {activeTab === 'deposit' && (
        <div className="space-y-6">
          {depositSuccessMsg && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 shadow-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-white text-sm">Deposit Submitted Successfully!</div>
                <div className="mt-1 leading-relaxed">{depositSuccessMsg}</div>
                <div className="mt-2 text-[11px] text-emerald-400">
                  Status: <strong className="bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded border border-amber-500/30">PENDING VERIFICATION</strong>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Payment Method Selection */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/40">
                1
              </span>
              <span>Select Payment Method</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {paymentMethods.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setSelectedMethod(m);
                    triggerHaptic('light');
                  }}
                  className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-2 ${
                    selectedMethod?.id === m.id
                      ? 'bg-amber-500/10 border-amber-500 text-white shadow-lg shadow-amber-500/10'
                      : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{m.logo}</span>
                    {selectedMethod?.id === m.id && (
                      <CheckCircle2 className="w-4 h-4 text-amber-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-black text-white leading-tight">{m.name}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-0.5">{m.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Step 2: Administrator Transfer Information */}
          {selectedMethod && (
            <div className="bg-slate-900 border border-amber-500/30 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/40">
                  2
                </span>
                <span>Administrator Account Details ({selectedMethod.name})</span>
              </h3>

              <div className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-3">
                <p className="text-xs text-slate-300">
                  Transfer your deposit amount to our official admin payment account outside the app:
                </p>

                {selectedMethod.accountName && (
                  <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Account Recipient Name</span>
                      <span className="text-xs font-black text-white">{selectedMethod.accountName}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedMethod.accountName, 'accountName')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-400 font-bold flex items-center gap-1"
                    >
                      {copiedField === 'accountName' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'accountName' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {selectedMethod.phoneNumber && (
                  <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Phone / Mobile Number</span>
                      <span className="text-xs font-mono font-black text-amber-300">{selectedMethod.phoneNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedMethod.phoneNumber!, 'phoneNumber')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-400 font-bold flex items-center gap-1"
                    >
                      {copiedField === 'phoneNumber' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'phoneNumber' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {selectedMethod.accountNumber && (
                  <div className="flex items-center justify-between bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Bank Account Number</span>
                      <span className="text-xs font-mono font-black text-amber-300">{selectedMethod.accountNumber}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleCopy(selectedMethod.accountNumber!, 'accountNumber')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-amber-400 font-bold flex items-center gap-1"
                    >
                      {copiedField === 'accountNumber' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === 'accountNumber' ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}

                {selectedMethod.qrCodeUrl && (
                  <div className="text-center pt-2">
                    <span className="text-[10px] text-slate-400 block mb-1">Scan QR Code to Transfer</span>
                    <img
                      src={selectedMethod.qrCodeUrl}
                      alt="Admin Payment QR Code"
                      className="w-32 h-32 mx-auto rounded-xl border border-amber-500/30 p-1 bg-white"
                    />
                  </div>
                )}

                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-xl text-[11px] text-amber-300 space-y-1">
                  <span className="font-bold block flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-amber-400" /> Instructions:
                  </span>
                  <p className="whitespace-pre-line text-slate-300 leading-relaxed">
                    {selectedMethod.instructions}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Deposit Submission Form */}
          {selectedMethod && (
            <form onSubmit={handleSubmitDeposit} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 text-xs font-black flex items-center justify-center border border-amber-500/40">
                  3
                </span>
                <span>Submit Deposit Transfer Details</span>
              </h3>

              {/* Deposit Amount Field */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Deposit Amount (ETB / Birr):
                </label>
                <div className="grid grid-cols-4 gap-2 mb-2">
                  {[50, 100, 250, 500].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => {
                        setDepositAmount(amt);
                        triggerHaptic('light');
                      }}
                      className={`py-1.5 rounded-xl border text-xs font-black transition ${
                        depositAmount === amt
                          ? 'bg-amber-500 text-slate-950 border-amber-400'
                          : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      {amt} Birr
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  required
                  min={10}
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-amber-400 font-mono font-black focus:outline-none focus:border-amber-500"
                  placeholder="Enter deposit amount in Birr"
                />
              </div>

              {/* Transaction Reference Number Field */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Transaction Reference Number <span className="text-amber-400">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={referenceCode}
                  onChange={(e) => setReferenceCode(e.target.value)}
                  placeholder="e.g. TLB8912301 or FT262071822"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <span className="text-[10px] text-slate-400 block mt-1">
                  Copy the reference code from your SMS or Mobile Banking receipt.
                </span>
              </div>

              {/* Optional Phone Number */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Sender Phone / Account Number (Optional):
                </label>
                <input
                  type="text"
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 0911223344"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Receipt Screenshot Upload */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Receipt Screenshot / Image (Optional but recommended):
                </label>

                <div className="border-2 border-dashed border-slate-800 hover:border-amber-500/50 rounded-2xl p-4 text-center bg-slate-950 transition relative">
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={handleFileUpload}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                  />

                  {screenshotUrl ? (
                    <div className="space-y-2">
                      <img
                        src={screenshotUrl}
                        alt="Receipt Screenshot Preview"
                        className="w-32 h-32 object-cover rounded-xl mx-auto border border-amber-500/40 shadow-md"
                      />
                      <span className="text-xs text-emerald-400 font-bold block">
                        ✅ Screenshot Attached: {screenshotFileName}
                      </span>
                      <span className="text-[10px] text-slate-400 block">Click to change receipt image</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <Upload className="w-6 h-6 text-slate-500 mx-auto" />
                      <span className="text-xs font-bold text-amber-400 block">
                        Upload Screenshot or Receipt PDF
                      </span>
                      <span className="text-[10px] text-slate-500 block">
                        JPG, PNG, WEBP, or PDF (Max size: 5MB)
                      </span>
                    </div>
                  )}
                </div>

                {fileError && (
                  <p className="text-xs text-red-400 font-bold mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {fileError}
                  </p>
                )}
              </div>

              {/* Optional User Note */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Note to Admin (Optional):
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  placeholder="e.g. Transferred via Abebe Kebede's Telebirr account"
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmittingDeposit}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/20 active:scale-95 transition disabled:opacity-50"
              >
                {isSubmittingDeposit ? 'Submitting Deposit Request...' : 'SUBMIT DEPOSIT FOR VERIFICATION'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* TAB 2: WITHDRAWAL FLOW */}
      {activeTab === 'withdraw' && (
        <div className="space-y-6">
          {/* Phone Verification Notice for Withdrawals */}
          {!user.phone && onOpenPhoneVerification && (
            <div className="bg-amber-500/15 border border-amber-500/40 text-amber-300 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
              <div className="flex items-start sm:items-center gap-3">
                <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-black text-white text-xs sm:text-sm">
                    {language === 'am' ? 'የስልክ ቁጥር ማረጋገጫ ያስፈልጋል' : 'Phone Verification Required'}
                  </div>
                  <div className="text-[11px] text-slate-300 mt-0.5">
                    {language === 'am'
                      ? 'ገንዘብ ወጪ ለማድረግ የቴሌግራም ስልክ ቁጥርዎን ማረጋገጥ አለብዎት።'
                      : 'Please verify your Telegram phone number before requesting a withdrawal.'}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenPhoneVerification();
                }}
                className="w-full sm:w-auto px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 shadow transition shrink-0 cursor-pointer"
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>{language === 'am' ? '📱 ስልክ አረጋግጥ' : '📱 Verify Phone Now'}</span>
              </button>
            </div>
          )}

          {withdrawSuccessMsg && (
            <div className="bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 p-4 rounded-2xl text-xs font-bold flex items-start gap-3 shadow-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-black text-white text-sm">Withdrawal Request Received</div>
                <div className="mt-1 leading-relaxed">{withdrawSuccessMsg}</div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmitWithdrawal} className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <ArrowUpRight className="w-5 h-5 text-amber-400" />
              <span>Withdraw Funds to Your Account</span>
            </h3>

            {/* Select Method */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Withdrawal Payment Gateway:
              </label>
              <select
                value={selectedMethod?.id || ''}
                onChange={(e) => {
                  const m = paymentMethods.find((pm) => pm.id === e.target.value);
                  if (m) setSelectedMethod(m);
                }}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
              >
                {paymentMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.accountName || 'Mobile / Bank'})
                  </option>
                ))}
              </select>
            </div>

            {/* Withdrawal Amount */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Withdrawal Amount (ETB / Birr):
              </label>
              <input
                type="number"
                required
                min={50}
                max={user.walletBalance}
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-amber-400 font-mono font-black focus:outline-none focus:border-amber-500"
              />
              <span className="text-[10px] text-slate-400 block mt-1">
                Available Wallet Balance: <strong className="text-emerald-400">{user.walletBalance} Birr</strong>
              </span>
            </div>

            {/* Account / Phone Number */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Recipient Account / Phone Number:
              </label>
              <input
                type="text"
                required
                value={withdrawAccountNumber}
                onChange={(e) => setWithdrawAccountNumber(e.target.value)}
                placeholder="e.g. 0911223344 or Bank Account Number"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Account Holder Name */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Recipient Full Name:
              </label>
              <input
                type="text"
                required
                value={withdrawAccountName}
                onChange={(e) => setWithdrawAccountName(e.target.value)}
                placeholder="e.g. Abebe Kebede"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            {/* Note */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Optional Note:
              </label>
              <input
                type="text"
                value={withdrawNote}
                onChange={(e) => setWithdrawNote(e.target.value)}
                placeholder="e.g. Emergency payout request"
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-amber-500"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingWithdraw || user.walletBalance < withdrawAmount}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-slate-950 font-black text-sm shadow-xl shadow-emerald-500/20 transition disabled:opacity-50"
            >
              {isSubmittingWithdraw ? 'Submitting Request...' : 'SUBMIT WITHDRAWAL REQUEST'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 3: STATUS & HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* User Deposit Requests Status List */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-amber-400" />
                <span>Your Payment Requests & Status</span>
              </h3>

              <button
                type="button"
                onClick={fetchUserDeposits}
                disabled={loadingHistory}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold flex items-center gap-1 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin text-amber-400' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {userDeposits.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-8">
                No deposit requests submitted yet.
              </div>
            ) : (
              <div className="space-y-3">
                {userDeposits.map((dep) => (
                  <div
                    key={dep.id}
                    className="bg-slate-950 rounded-2xl p-4 border border-slate-800 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-extrabold text-white flex items-center gap-2">
                        <span>{dep.paymentMethodName}</span>
                        <span className="text-amber-400 font-mono font-black">{dep.amount} Birr</span>
                      </div>

                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          dep.status === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : dep.status === 'REJECTED'
                            ? 'bg-red-500/20 text-red-400 border-red-500/40'
                            : 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse'
                        }`}
                      >
                        {dep.status}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 space-y-1">
                      <div>
                        Reference Code: <span className="text-amber-300 font-mono font-bold">{dep.referenceCode}</span>
                      </div>
                      <div>Submitted: {dep?.createdAt ? new Date(dep.createdAt).toLocaleString() : 'N/A'}</div>

                      {dep.rejectionReason && (
                        <div className="bg-red-500/10 border border-red-500/30 p-2 rounded-xl text-red-300 font-bold">
                          Rejection Reason: {dep.rejectionReason}
                        </div>
                      )}

                      {dep.adminNote && (
                        <div className="bg-amber-500/10 border border-amber-500/30 p-2 rounded-xl text-amber-300 font-bold">
                          Admin Note: {dep.adminNote}
                        </div>
                      )}

                      {dep.screenshotUrl && (
                        <div className="pt-1">
                          <a
                            href={dep.screenshotUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-400 underline font-bold flex items-center gap-1"
                          >
                            <ImageIcon className="w-3.5 h-3.5" /> View Uploaded Receipt Screenshot
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Wallet Ledger Transactions */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
            <h3 className="text-sm font-black text-white">Wallet Transaction Ledger</h3>

            <div className="space-y-2">
              {transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="bg-slate-950 rounded-2xl p-3.5 border border-slate-800/80 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-white flex items-center gap-1.5">
                      <span>{tx.description}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      Ref: {tx.reference} {tx.gameReferenceId ? `| Game Ref: ${tx.gameReferenceId}` : ''} | {new Date(tx.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <div className="text-right">
                    <span
                      className={`font-black font-mono block text-sm ${
                        tx.amount > 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Birr
                    </span>
                    <span className="text-[9px] text-slate-500">
                      Balance: {tx.balanceAfter} Birr
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
