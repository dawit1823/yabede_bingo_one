import React from 'react';
import { FileText, Server, Database, Shield, Terminal, Cpu } from 'lucide-react';

export const DocsView: React.FC = () => {
  return (
    <div className="space-y-6 pb-24 text-xs">
      {/* Header */}
      <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border border-indigo-500/30 rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center shadow-inner">
            <FileText className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Yabede Bingo System Documentation</h2>
            <p className="text-xs text-slate-300">
              Enterprise architecture, Docker environment, API Swagger reference, and deployment guide
            </p>
          </div>
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Cpu className="w-4 h-4 text-amber-400" />
          <span>System Architecture & Technology Stack</span>
        </h3>
        <p className="text-slate-300 leading-relaxed">
          Yabede Bingo is built on modern Clean Architecture and SOLID principles:
        </p>
        <ul className="list-disc list-inside text-slate-400 space-y-1 pl-2">
          <li><strong className="text-white">Frontend:</strong> React 19, TypeScript, Tailwind CSS v4, Telegram Mini App SDK wrapper, Web Audio API synth, Socket.IO client.</li>
          <li><strong className="text-white">Backend:</strong> Express.js server on Node.js, Socket.IO WebSockets, Cryptographically secure random 75-Ball bingo engine, Payment Abstraction layer.</li>
          <li><strong className="text-white">Payments:</strong> Native support for Telebirr, CBE Birr, Chapa, and SantimPay with server-side reference verification.</li>
          <li><strong className="text-white">Security:</strong> Telegram InitData HMAC-SHA256 signature verifier, JWT access tokens, immutable ledger transactions, and audit trail.</li>
        </ul>
      </div>

      {/* Docker & Deployment */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <span>Docker & Deployment Configuration</span>
        </h3>
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-[11px] text-amber-300 space-y-2 overflow-x-auto">
          <div># docker-compose.yml</div>
          <pre className="text-slate-300">{`version: '3.8'
services:
  yabede_bingo_app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - TELEGRAM_BOT_TOKEN=\${TELEGRAM_BOT_TOKEN}
    restart: always`}</pre>
        </div>
      </div>

      {/* Database Schema */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3 shadow-xl">
        <h3 className="text-sm font-black text-white flex items-center gap-2">
          <Database className="w-4 h-4 text-indigo-400" />
          <span>Core Database Schema (Prisma / SQL)</span>
        </h3>
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 font-mono text-[11px] text-emerald-400 space-y-2 overflow-x-auto">
          <div>// schema.prisma</div>
          <pre className="text-slate-300">{`model User {
  id              String   @id @default(uuid())
  telegramId      BigInt   @unique
  username        String
  firstName       String
  walletBalance   Float    @default(100.0)
  bonusBalance    Float    @default(50.0)
  vipLevel        Int      @default(1)
  status          String   @default("ACTIVE")
  createdAt       DateTime @default(now())
}

model WalletLedger {
  id              String   @id @default(uuid())
  userId          String
  amount          Float
  balanceAfter    Float
  type            String   // DEPOSIT, WITHDRAWAL, TICKET_PURCHASE, GAME_WIN
  reference       String   @unique
  createdAt       DateTime @default(now())
}`}</pre>
        </div>
      </div>
    </div>
  );
};
