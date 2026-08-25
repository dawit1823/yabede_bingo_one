import React, { useState, useEffect } from 'react';
import { UserProfile, ReferralStat } from '../types';
import { triggerHaptic } from '../lib/telegramSDK';
import { apiUrl } from '../lib/apiConfig';
import { Users, Copy, Check, Smartphone, ArrowRight, Gift, UserCheck, Calendar } from 'lucide-react';

interface BonusesViewProps {
  user: UserProfile;
  referralStat?: ReferralStat;
  onSpinWheel?: () => Promise<number>;
  onOpenPhoneVerification?: () => void;
  language: 'en' | 'am';
}

export const BonusesView: React.FC<BonusesViewProps> = ({
  user,
  referralStat,
  onOpenPhoneVerification,
  language,
}) => {
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [referralRewardBirr, setReferralRewardBirr] = useState<number>(25);

  useEffect(() => {
    fetch(apiUrl('/api/system/settings'))
      .then((res) => res.json())
      .then((data) => {
        if (data) {
          if (typeof data.referralRewardBirr === 'number') {
            setReferralRewardBirr(data.referralRewardBirr);
          } else if (data.bonusPrograms && Array.isArray(data.bonusPrograms)) {
            const refProg = data.bonusPrograms.find(
              (p: any) => p.id === 'referral_bonus' || p.type === 'REFERRAL' || p.name === 'Friend Referral Reward'
            );
            if (refProg && typeof refProg.amountBirr === 'number') {
              setReferralRewardBirr(refProg.amountBirr);
            }
          }
        }
      })
      .catch(() => null);
  }, []);

  const referralLink = https://t.me/yabede_bingo_bot/app?startapp=${user.referralCode}`;


  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    triggerHaptic('light');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Phone Verification Bonus Box */}
      {!user.phone && onOpenPhoneVerification && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/20 to-orange-500/15 border border-amber-500/40 rounded-3xl p-5 sm:p-6 space-y-3 shadow-xl">
          <div className="flex items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white flex items-center gap-2">
                  <span>{language === 'am' ? 'የስልክ ቁጥር ማረጋገጫ' : 'Phone Verification'}</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-1.5 py-0.5 rounded border border-amber-500/30">
                    {language === 'am' ? 'ያልተረጋገጠ' : 'Pending'}
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  {language === 'am'
                    ? 'ስልክዎን በቴሌግራም ያረጋግጡና የኪስ ቦርሳዎን ደህንነት ያጠናክሩ።'
                    : 'Verify your phone number via Telegram to secure your wallet and withdrawals.'}
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                triggerHaptic('medium');
                onOpenPhoneVerification();
              }}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/20 transition shrink-0 cursor-pointer"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{language === 'am' ? 'አረጋግጥ' : 'Verify Now'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* REFERRAL HUB */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5 shadow-xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>{language === 'am' ? 'የጓደኛ መጋበዣ ፕሮግራም' : 'Referral & Invite Program'}</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {language === 'am' ? (
                <>
                  እያንዳንዱ የጋበዙት ጓደኛ ሲመዘገብ <span className="text-amber-400 font-bold">{referralRewardBirr} ብር</span> ፈጣን ጉርሻ ያግኙ!
                </>
              ) : (
                <>
                  Earn <span className="text-amber-400 font-bold">{referralRewardBirr} Birr</span> instant bonus for every friend who joins!
                </>
              )}
            </p>
          </div>
        </div>

        {/* Copy Referral Link Box */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-300 block">
            {language === 'am' ? 'የእርስዎ የቴሌግራም መጋበዣ ሊንክ:' : 'Your Telegram Invite Link:'}
          </label>
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
                <span>{copiedLink ? (language === 'am' ? 'ተቀድቷል' : 'Copied') : (language === 'am' ? 'ቅዳ' : 'Copy')}</span>
              </button>
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent('Join me on Yabede Bingo! 🎱 Play multiplayer 75-ball bingo and win Birr!')}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => triggerHaptic('medium')}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 transition min-h-[40px] shadow-md shadow-amber-500/20"
              >
                <span>{language === 'am' ? 'አጋራ' : 'Share'}</span>
              </a>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950 rounded-2xl p-4 border border-slate-800 text-center">
          <div>
            <span className="text-xs text-slate-400 block">{language === 'am' ? 'የተጋበዙ ጓደኞች' : 'Total Friends Invited'}</span>
            <span className="text-lg font-black text-white">
              {referralStat?.totalReferredCount ?? user.referralCount ?? 0}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">{language === 'am' ? 'የተገኘ አጠቃላይ ጉርሻ' : 'Total Rewards Earned'}</span>
            <span className="text-lg font-black text-amber-400">
              {referralStat?.totalEarnings ?? user.referralEarnings ?? 0} Birr
            </span>
          </div>
        </div>

        {/* Invited Friends List */}
        {referralStat?.referrals && referralStat.referrals.length > 0 && (
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span>{language === 'am' ? 'የተመዘገቡ ጓደኞች' : 'Invited Friends List'}</span>
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {referralStat.referrals.map((ref, idx) => (
                <div
                  key={ref.userId || idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/60 text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                      <Gift className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        {ref.username ? `@${ref.username}` : `Player ${ref.userId.slice(-4)}`}
                      </div>
                      {ref.joinedAt && (
                        <div className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Calendar className="w-2.5 h-2.5" />
                          <span>{new Date(ref.joinedAt).toLocaleDateString()}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="font-mono font-black text-amber-400 shrink-0">
                    +{ref.bonusEarned || referralRewardBirr} Birr
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

