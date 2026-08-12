import React, { useState } from 'react';
import { UserProfile } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import { KeyRound, ArrowRight, X, Link as LinkIcon } from 'lucide-react';

interface JoinPrivateGroupModalProps {
  user: UserProfile;
  isOpen: boolean;
  onClose: () => void;
  onJoined: (group: any) => void;
  language: 'en' | 'am';
}

export const JoinPrivateGroupModal: React.FC<JoinPrivateGroupModalProps> = ({
  user,
  isOpen,
  onClose,
  onJoined,
  language,
}) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError(null);

    try {
      let cleanCode = code.trim().toUpperCase();
      if (cleanCode.includes('group_')) {
        cleanCode = cleanCode.split('group_')[1];
      }

      const res = await fetch(apiUrl('/api/private-groups/join-code'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: cleanCode,
          userId: user.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to join group');
      }

      triggerHaptic('heavy');
      onJoined(data.group);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Invalid code or group is full');
      triggerHaptic('heavy');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-white">
                {language === 'am' ? 'በኮድ ወይም ሊንክ ይቀላቀሉ' : 'Join Private Group'}
              </h3>
              <p className="text-xs text-slate-400">
                {language === 'am' ? 'የ6-ዲጂት መጋበዣ ኮድ ያስገቡ' : 'Enter 6-character invitation code'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-2xl p-3 font-semibold">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-300 block mb-2">
              {language === 'am' ? 'የመጋበዣ ኮድ (Invitation Code)' : 'Group Invitation Code / Link'}
            </label>
            <div className="relative">
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. YABEDE77 or t.me/...code"
                maxLength={30}
                className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-center text-lg tracking-widest font-black text-amber-400 focus:outline-none focus:border-amber-500 placeholder:text-slate-600 uppercase"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !code.trim()}
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-sm shadow-xl shadow-amber-500/25 hover:brightness-110 active:scale-98 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Connecting...</span>
            ) : (
              <>
                <span>{language === 'am' ? 'ተቀላቀል' : 'Join Group Lobby'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
