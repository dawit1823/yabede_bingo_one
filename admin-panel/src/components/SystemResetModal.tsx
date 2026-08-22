import React, { useState } from 'react';
import {
  AlertTriangle,
  Flame,
  ShieldCheck,
  RefreshCw,
  CheckCircle,
  XCircle,
  X,
  Lock,
  Database,
  Trash2,
  List,
} from 'lucide-react';
import { adminFetch } from '../lib/adminApi';
import { apiUrl } from '@shared/apiConfig';

interface SystemResetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const SystemResetModal: React.FC<SystemResetModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [confirmationInput, setConfirmationInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [resetResult, setResetResult] = useState<{
    success: boolean;
    message: string;
    deletedCounts: Record<string, number>;
    preservedItems: string[];
    officialRooms: string[];
    timestamp: string;
  } | null>(null);

  if (!isOpen) return null;

  const isConfirmed = confirmationInput.trim() === 'RESET ALL DATA';

  const handleExecuteReset = async () => {
    if (!isConfirmed) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const res = await adminFetch(apiUrl('/api/admin/maintenance/reset-all-data'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmationPhrase: confirmationInput.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Data reset failed on server.');
      }

      setResetResult(data);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to execute system data reset.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setConfirmationInput('');
    setErrorMessage('');
    setResetResult(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border-2 border-rose-600/60 rounded-3xl p-6 sm:p-8 max-w-xl w-full shadow-2xl space-y-5 my-8 text-slate-200 animate-scale-up">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-rose-900/40 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-600/20 border border-rose-500/40 flex items-center justify-center text-rose-500">
              <Flame className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-black text-white tracking-wide flex items-center gap-2">
                <span>SYSTEM DATA RESET</span>
                <span className="text-[10px] font-extrabold bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded-full">
                  SUPERADMIN ONLY
                </span>
              </h2>
              <p className="text-xs text-rose-300 font-semibold">
                Permanent erasure of test/generated application datasets
              </p>
            </div>
          </div>
          {!isSubmitting && (
            <button
              onClick={handleClose}
              className="p-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Content: If result completed, show summary */}
        {resetResult ? (
          <div className="space-y-4 py-2">
            <div className="bg-emerald-500/10 border border-emerald-500/40 rounded-2xl p-4 flex items-start gap-3">
              <CheckCircle className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h4 className="text-sm font-black text-emerald-300">
                  Full System Reset Completed Successfully
                </h4>
                <p className="text-xs text-slate-300">{resetResult.message}</p>
                <div className="text-[11px] text-slate-400 font-mono pt-1">
                  Completed at: {new Date(resetResult.timestamp).toLocaleString()}
                </div>
              </div>
            </div>

            {/* Preserved Configurations */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Protected & Preserved Core Records</span>
              </h5>
              <ul className="text-xs text-slate-300 space-y-1 pl-5 list-disc">
                {resetResult.preservedItems?.map((item, idx) => (
                  <li key={idx} className="font-semibold text-emerald-200/90">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Recreated Official Rooms */}
            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 space-y-2">
              <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-amber-400" />
                <span>Re-initialized Official Rooms</span>
              </h5>
              <div className="flex flex-wrap gap-2 pt-1">
                {resetResult.officialRooms?.map((room, idx) => (
                  <span
                    key={idx}
                    className="text-xs font-bold px-2.5 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300"
                  >
                    {room}
                  </span>
                ))}
              </div>
            </div>

            {/* Close / Reload Button */}
            <button
              onClick={() => {
                handleClose();
                window.location.reload();
              }}
              className="w-full py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-lg flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reload Admin Dashboard & Refresh Data</span>
            </button>
          </div>
        ) : (
          /* Reset Form */
          <div className="space-y-4 text-xs">
            <div className="bg-rose-950/30 border border-rose-900/60 rounded-2xl p-4 text-rose-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>WARNING: This action is permanent and irreversible!</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                This process wipes all generated application data from Firestore and memory, restoring
                the system to a clean state ready for real users.
              </p>
            </div>

            {/* Detailed Collections List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-1.5">
                <div className="font-bold text-rose-400 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Will be Permanently Deleted:</span>
                </div>
                <ul className="text-[11px] text-slate-400 space-y-0.5 list-disc pl-4">
                  <li>Users, Profiles & UserAuth</li>
                  <li>Wallets & Transaction Ledgers</li>
                  <li>Deposits & Withdrawals History</li>
                  <li>Bingo Tickets & Card Matrices</li>
                  <li>Game History & Winner Records</li>
                  <li>Chat Messages & Notifications</li>
                  <li>Group Games & Group Members</li>
                  <li>Referral Records</li>
                </ul>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-3 space-y-1.5">
                <div className="font-bold text-emerald-400 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Guaranteed Preserved:</span>
                </div>
                <ul className="text-[11px] text-slate-400 space-y-0.5 list-disc pl-4">
                  <li>SuperAdmin Account & Admins</li>
                  <li>Firebase Auth Credentials</li>
                  <li>System Config (Platform fee, etc.)</li>
                  <li>Bonus Program Configurations</li>
                  <li>Payment Gateways (Telebirr, CBE)</li>
                  <li>Database Indexes & Rules</li>
                  <li>Re-created Official Bingo Rooms</li>
                </ul>
              </div>
            </div>

            {/* Confirmation input */}
            <div className="space-y-2 pt-2">
              <label className="block text-slate-300 font-bold">
                To confirm, type <span className="text-rose-400 font-black tracking-wider bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800 select-all">RESET ALL DATA</span> in the box below:
              </label>
              <input
                type="text"
                value={confirmationInput}
                onChange={(e) => setConfirmationInput(e.target.value)}
                placeholder="Type RESET ALL DATA to confirm"
                disabled={isSubmitting}
                className="w-full bg-slate-950 border-2 border-slate-700 focus:border-rose-500 rounded-xl px-4 py-2.5 text-white font-mono font-bold text-sm tracking-wider focus:outline-none"
              />
            </div>

            {errorMessage && (
              <div className="bg-rose-500/10 border border-rose-500/40 text-rose-300 rounded-xl p-3 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={!isConfirmed || isSubmitting}
                className={`px-6 py-2.5 rounded-xl font-black transition flex items-center gap-2 shadow-xl ${
                  isConfirmed && !isSubmitting
                    ? 'bg-rose-600 hover:bg-rose-500 text-white cursor-pointer active:scale-95 shadow-rose-900/50'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed opacity-50'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Executing Safe Reset...</span>
                  </>
                ) : (
                  <>
                    <Flame className="w-4 h-4" />
                    <span>Permanently Reset All Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
