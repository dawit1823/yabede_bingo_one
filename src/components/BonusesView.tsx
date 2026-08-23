import React from 'react';
import { UserProfile, ReferralStat } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { Users, Copy, Check } from 'lucide-react';

interface BonusesViewProps {
  user: UserProfile;
  referralStat?: ReferralStat;
  onSpinWheel?: () => Promise<number>;
  language: 'en' | 'am';
}

export const BonusesView: React.FC<BonusesViewProps> = ({
  user,
  referralStat,
}) => {
  const [copiedLink, setCopiedLink] = React.useState<boolean>(false);

  const referralLink = `https://t.me/yabede_bingo_bot?start=${user.referralCode}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* REFERRAL HUB */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>Referral & Invite Program</span>
            </h3>
            <p className="text-xs text-slate-400">
              Earn <span className="text-amber-400 font-bold">5% lifetime commission</span> on all friend deposits!
            </p>
          </div>
        </div>

        {/* Copy Referral Link Box */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">Your Telegram Invite Link:</label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <input
              type="text"
              readOnly
              value={referralLink}
              className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-2xl px-3.5 py-2.5 text-xs text-amber-300 font-mono focus:outline-none truncate"
            />
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyLink}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center justify-center gap-1.5 transition min-h-[40px] cursor-pointer"
              >
                {copiedLink ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join me on Yabede Bingo! 🎱 Play multiplayer 75-ball bingo and win Birr!')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => triggerHaptic('medium')}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition min-h-[40px] shadow-md shadow-amber-500/20"
              >
                <span>Share</span>
              </a>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950 rounded-2xl p-4 border border-slate-800 text-center">
          <div>
            <span className="text-xs text-slate-400 block">Total Friends Invited</span>
            <span className="text-lg font-black text-white">
              {referralStat?.totalReferredCount || 0}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">Total Commission Earned</span>
            <span className="text-lg font-black text-amber-400">
              {referralStat?.totalEarnings || 0} Birr
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
