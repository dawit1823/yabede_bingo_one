import React from 'react';
import { Bot, ShieldAlert, ArrowRight, CheckCircle2, Lock } from 'lucide-react';
import { triggerHaptic } from '../lib/telegramSDK';

interface RegistrationGateModalProps {
  isOpen: boolean;
  onOpenBot: () => void;
}

export const RegistrationGateModal: React.FC<RegistrationGateModalProps> = ({
  isOpen,
  onOpenBot,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 text-center space-y-6 shadow-2xl relative overflow-hidden">
        {/* Glow backdrop effect */}
        <div className="absolute -top-12 -left-12 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-12 -right-12 w-40 h-40 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Icon Header */}
        <div className="relative mx-auto w-20 h-20 rounded-full bg-slate-950 border-2 border-amber-500/50 flex items-center justify-center shadow-xl">
          <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-inner">
            <Lock className="w-7 h-7" />
          </div>
          <span className="absolute -bottom-1 -right-1 bg-sky-500 text-slate-950 text-[10px] font-black p-1 rounded-full border border-slate-950">
            <Bot className="w-3.5 h-3.5" />
          </span>
        </div>

        {/* Text Content */}
        <div className="space-y-2">
          <h2 className="text-xl font-black text-white">Registration Required via Bot</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            All users must register through our official <span className="text-amber-400 font-bold">Telegram Bot</span> before accessing the Yabede Bingo Mini App.
          </p>
        </div>

        {/* Step Checklist */}
        <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-left text-xs space-y-2.5">
          <div className="flex items-center gap-2.5 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Secure 1-tap Phone Contact Sharing via Telegram</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Create a strong encrypted password (bcrypt)</span>
          </div>
          <div className="flex items-center gap-2.5 text-slate-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Instant 100 Birr Welcome Credit in Cloud Firestore</span>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2">
          <button
            onClick={() => {
              triggerHaptic('heavy');
              onOpenBot();
            }}
            className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 text-slate-950 font-black text-sm shadow-lg hover:brightness-110 active:scale-[0.98] transition flex items-center justify-center gap-2"
          >
            <Bot className="w-5 h-5" />
            <span>Launch Telegram Bot to Register</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-slate-500 font-mono">
          Firebase Authentication & Cloud Firestore Protected
        </p>
      </div>
    </div>
  );
};
