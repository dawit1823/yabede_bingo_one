import React, { useState, useMemo, useRef } from 'react';
import { triggerHaptic } from '../lib/telegramSDK';
import { UserProfile, WinningPattern } from '../types';
import {
  BookOpen,
  Search,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Zap,
  Gamepad2,
  Wallet,
  Users,
  Gift,
  Trophy,
  History,
  Smartphone,
  ShieldCheck,
  Globe,
  Sun,
  Sunset,
  Moon,
  Volume2,
  HelpCircle,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Lock,
  Coins,
  QrCode,
  FileCheck,
  RefreshCw,
  ExternalLink,
  MessageSquare,
  KeyRound,
  PlusCircle,
  Copy,
  Check,
  Info,
} from 'lucide-react';

export interface HelpViewProps {
  user: UserProfile;
  isLoggedIn?: boolean;
  language: 'en' | 'am';
  onNavigateTab: (tab: 'home' | 'active_game' | 'wallet' | 'bonuses' | 'leaderboard' | 'history') => void;
  onOpenPhoneVerification?: () => void;
  onOpenAuth?: () => void;
  onCreatePrivateGroup?: () => void;
  onJoinPrivateGroupCode?: () => void;
}

interface HelpSection {
  id: string;
  icon: React.ElementType;
  badge?: { en: string; am: string; color: string };
  title: { en: string; am: string };
  subtitle: { en: string; am: string };
  keywords: string[];
  quickAction?: {
    label: { en: string; am: string };
    icon: React.ElementType;
    onClick: (props: HelpViewProps) => void;
  };
  secondaryAction?: {
    label: { en: string; am: string };
    icon: React.ElementType;
    onClick: (props: HelpViewProps) => void;
  };
  content: {
    overview: { en: string; am: string };
    steps?: Array<{
      stepNumber: string;
      title: { en: string; am: string };
      description: { en: string; am: string };
      tip?: { en: string; am: string };
    }>;
    statusExplanations?: Array<{
      status: string;
      label: { en: string; am: string };
      color: string;
      description: { en: string; am: string };
    }>;
    featureList?: Array<{
      title: { en: string; am: string };
      description: { en: string; am: string };
    }>;
    faqs?: Array<{
      q: { en: string; am: string };
      a: { en: string; am: string };
    }>;
  };
}

export const HelpView: React.FC<HelpViewProps> = (props) => {
  const {
    user,
    isLoggedIn = false,
    language,
    onNavigateTab,
    onOpenPhoneVerification,
    onOpenAuth,
    onCreatePrivateGroup,
    onJoinPrivateGroupCode,
  } = props;

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    'quick-start': true,
    'playing-bingo': true,
  });
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const toggleSection = (id: string) => {
    triggerHaptic('light');
    setExpandedSections((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const expandAll = () => {
    triggerHaptic('medium');
    const allExpanded: Record<string, boolean> = {};
    HELP_SECTIONS.forEach((s) => {
      allExpanded[s.id] = true;
    });
    setExpandedSections(allExpanded);
  };

  const collapseAll = () => {
    triggerHaptic('light');
    setExpandedSections({});
  };

  const scrollToSection = (id: string) => {
    triggerHaptic('light');
    setExpandedSections((prev) => ({ ...prev, [id]: true }));
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Structured Knowledge Base Model
  const HELP_SECTIONS: HelpSection[] = useMemo(
    () => [
      {
        id: 'quick-start',
        icon: Sparkles,
        badge: { en: 'START HERE', am: 'ፈጣን ጅማሮ', color: 'bg-amber-500 text-slate-950' },
        title: { en: '🚀 Quick Start Guide', am: '🚀 ፈጣን መመሪያ' },
        subtitle: {
          en: 'Start playing multiplayer 75-Ball Bingo and win real Birr in under 60 seconds.',
          am: 'በ60 ሰከንድ ውስጥ የ75-ኳስ ቢንጎ ጨዋታ ይጀምሩና የብር ሽልማቶችን ያሸንፉ።',
        },
        keywords: ['quick start', 'how to start', 'beginner', 'guide', 'steps', 'fast', 'መነሻ', 'መመሪያ', 'እንዴት'],
        quickAction: {
          label: { en: 'Browse Game Arenas →', am: 'ወደ ጨዋታ ክፍሎች ሂድ →' },
          icon: Zap,
          onClick: (p) => p.onNavigateTab('home'),
        },
        content: {
          overview: {
            en: 'Welcome to Yabede Bingo! Our platform is a fast, real-time multiplayer 75-Ball Bingo game built specifically for Telegram Mini App users in Ethiopia with direct Telebirr and Commercial Bank of Ethiopia (CBE) integration.',
            am: 'እንኳን ወደ ያበደ ቢንጎ በደህና መጡ! በቴሌግራም ሚኒ አፕ በቀጥታ የሚሰራ የ75-ኳስ ፈጣን የቢንጎ ጨዋታ ሲሆን በቴሌብር እና በኢትዮጵያ ንግድ ባንክ (CBE) ፈጣን ክፍያዎችን ያከናውናል።',
          },
          steps: [
            {
              stepNumber: '01',
              title: { en: 'Telegram Launch & Profile', am: 'በቴሌግራም መግባት' },
              description: {
                en: 'Launch the Mini App directly from the @yabede_bingo_bot. Your Telegram identity (Name, Username, Photo) connects automatically.',
                am: 'የቴሌግራም ቦቱን (@yabede_bingo_bot) በመክፈት በቀጥታ ይግቡ። የመገለጫ መረጃዎ በራስ-ሰር ይገናኛል።',
              },
              tip: { en: 'Make sure to verify your phone number for instant withdrawals.', am: 'ገንዘብ ወጪ ለማድረግ ስልክዎን አስቀድመው ያረጋግጡ።' },
            },
            {
              stepNumber: '02',
              title: { en: 'Deposit Birr to Wallet', am: 'ሒሳብ መሙላት (Deposit)' },
              description: {
                en: 'Open the Wallet tab to deposit funds via Telebirr, CBE Birr, CBE Bank transfer, or Awash Bank. Funds are credited instantly upon verification.',
                am: 'በቦርሳ (Wallet) ገጽ በቴሌብር ወይም በሲቢኢ ባንክ የሚፈልጉትን መጠን ይሙሉ።',
              },
            },
            {
              stepNumber: '03',
              title: { en: 'Choose a Bingo Arena', am: 'የቢንጎ ክፍል መምረጥ' },
              description: {
                en: 'From the Home page, choose an active room (e.g., Bronze, Silver, Gold, Platinum, VIP) matching your preferred ticket price (10 Birr to 200+ Birr).',
                am: 'ከመነሻ ገጹ የሚመችዎትን ክፍል (10 ብር፣ 20 ብር፣ 50 ብር፣ 100 ብር ወይም 200 ብር) ይምረጡ።',
              },
            },
            {
              stepNumber: '04',
              title: { en: 'Select & Buy Your Bingo Cards', am: 'ካርድ መርጠው ይግዙ' },
              description: {
                en: 'Browse the 400-card grid, pick your lucky card numbers, and click "Buy Tickets" before the countdown timer hits zero.',
                am: 'ከ400 ካርዶች ውስጥ የሚፈልጉትን የካርድ ቁጥር ይምረጡና የሰዓቱ ቆጣሪ ከማለቁ በፊት ይግዙ።',
              },
            },
            {
              stepNumber: '05',
              title: { en: 'Follow Live Draw & Claim BINGO!', am: 'ቀጥታ ጨዋታ እና ቢንጎ' },
              description: {
                en: 'Watch the live 75-ball draw with audio voice callouts. Enable Auto-Daub or tap numbers manually. When you hit a winning pattern, tap the glowing BINGO button to claim your prize!',
                am: 'የሚወጡትን ኳሶች በድምፅ እና በቦርዱ ይከታተሉ። የአሸናፊነት መስመር ሲሞላ ቢንጎ (BINGO) የሚለውን ቁልፍ ተጭነው ሽልማቱን ይውሰዱ!',
              },
            },
          ],
        },
      },
      {
        id: 'playing-bingo',
        icon: Gamepad2,
        badge: { en: 'CORE RULES', am: 'የጨዋታ ደንብ', color: 'bg-emerald-500 text-white' },
        title: { en: '🎯 How to Play 75-Ball Bingo', am: '🎯 የ75-ኳስ ቢንጎ አጨዋወት' },
        subtitle: {
          en: 'Understand the 5×5 matrix, letter columns, winning lines, auto-dauber, and claiming prizes.',
          am: 'የ5x5 የካርድ ሰንጠረዥ፣ የፊደላት አደረጃጀት፣ የአሸናፊነት መስመሮች እና የቢንጎ ህግጋት።',
        },
        keywords: ['rules', 'how to play', 'matrix', 'columns', 'b-i-n-g-o', 'winning patterns', 'one line', 'corners', 'full house', 'daub', 'claim bingo', 'አጨዋወት', 'ደንብ', 'መስመር', 'ሙሉ ካርድ'],
        quickAction: {
          label: { en: 'Open Live Game →', am: 'የቀጥታ ጨዋታ ክፈት →' },
          icon: Gamepad2,
          onClick: (p) => p.onNavigateTab('active_game'),
        },
        content: {
          overview: {
            en: 'Yabede Bingo uses the standard 75-ball format. Every ticket contains a 5×5 grid with 24 numbered squares and 1 central FREE star space. Balls are drawn sequentially at random from 1 to 75.',
            am: 'ያበደ ቢንጎ ዓለም አቀፍ የ75-ኳስ ህግን ይከተላል። እያንዳንዱ ካርድ 5x5 ሰንጠረዥ ሲኖረው 24 ቁጥሮች እና 1 ነፃ (FREE) ኮከብ በመሃል ይዟል። ኳሶቹ ከ1 እስከ 75 በቅደም ተከተል ይወጣሉ።',
          },
          featureList: [
            {
              title: { en: 'Column B (Numbers 1 – 15)', am: 'አምድ B (ከ1 እስከ 15 ያሉ ቁጥሮች)' },
              description: {
                en: 'First column on the left. Contains 5 random numbers from 1 to 15.',
                am: 'በስተግራ የመጀመሪያው አምድ ሲሆን ከ1 እስከ 15 ያሉትን ቁጥሮች ይይዛል።',
              },
            },
            {
              title: { en: 'Column I (Numbers 16 – 30)', am: 'አምድ I (ከ16 እስከ 30 ያሉ ቁጥሮች)' },
              description: {
                en: 'Second column. Contains 5 random numbers from 16 to 30.',
                am: 'ሁለተኛው አምድ ሲሆን ከ16 እስከ 30 ያሉትን ቁጥሮች ይይዛል።',
              },
            },
            {
              title: { en: 'Column N (Numbers 31 – 45) + FREE Star', am: 'አምድ N (ከ31 እስከ 45) + ነፃ ኮከብ' },
              description: {
                en: 'Middle column. Contains 4 numbers plus the automatic FREE star space at the center.',
                am: 'የመሃል አምድ ሲሆን 4 ቁጥሮች እና በመሃል ላይ ነፃ (FREE) ኮከብ ይዟል።',
              },
            },
            {
              title: { en: 'Column G (Numbers 46 – 60)', am: 'አምድ G (ከ46 እስከ 60 ያሉ ቁጥሮች)' },
              description: {
                en: 'Fourth column. Contains 5 random numbers from 46 to 60.',
                am: 'አራተኛው አምድ ሲሆን ከ46 እስከ 60 ያሉትን ቁጥሮች ይይዛል።',
              },
            },
            {
              title: { en: 'Column O (Numbers 61 – 75)', am: 'አምድ O (ከ61 እስከ 75 ያሉ ቁጥሮች)' },
              description: {
                en: 'Fifth column on the right. Contains 5 random numbers from 61 to 75.',
                am: 'በስተቀኝ የመጨረሻው አምድ ሲሆን ከ61 እስከ 75 ያሉትን ቁጥሮች ይይዛል።',
              },
            },
          ],
          steps: [
            {
              stepNumber: '01',
              title: { en: 'Auto-Dauber & Manual Marking', am: 'በራስ-ሰር ማድመቅ (Auto-Daub)' },
              description: {
                en: 'By default, the Auto-Dauber is turned ON, which automatically highlights drawn numbers on all your active cards in real time. You can also tap individual cells manually.',
                am: 'የወጡ ቁጥሮችን ሲስተሙ በራሱ በካርድዎ ላይ ያደምቃል። በፈለጉት ጊዜ አጥፍተው በእጅዎ መጫን ይችላሉ።',
              },
            },
            {
              stepNumber: '02',
              title: { en: '5 Strict Winning Patterns', am: '5ቱ የአሸናፊነት ቅጦች (Winning Patterns)' },
              description: {
                en: 'You win as soon as your card completes any 1 of the 5 winning patterns: (1) Any Horizontal Row (all 5 cells in any of the 5 rows), (2) Any Vertical Column (all 5 cells in any column), (3) Main Diagonal (top-left to bottom-right), (4) Reverse Diagonal (top-right to bottom-left), or (5) Four Corners. The Center FREE cell is always automatically marked!',
                am: 'ከ5ቱ የአሸናፊነት ቅጦች አንዱን ሲያሟሉ ወዲያውኑ ያሸንፋሉ፡ (1) ማንኛውም አግድም ረድፍ (5ቱ ሙሉ ሴሎች)፣ (2) ማንኛውም ቁልቁል አምድ (5ቱ ሙሉ ሴሎች)፣ (3) ዋናው ገደልማ መስመር (ከግራ ከላይ ወደ ቀኝ ታች)፣ (4) ተቃራኒ ገደልማ መስመር (ከቀኝ ከላይ ወደ ግራ ታች)፣ ወይም (5) 4ቱ ማዕዘናት። የመሃሉ ነፃ ቦታ (FREE) ሁልጊዜ የበራ ነው!',
              },
            },
            {
              stepNumber: '03',
              title: { en: 'Claiming BINGO Instantly', am: 'ቢንጎ ማለት (Claim BINGO)' },
              description: {
                en: 'As soon as your card satisfies a winning pattern, the "CLAIM BINGO" button pulses with golden animations. Click it immediately to secure your victory and claim the prize pool.',
                am: 'ካርድዎ ሲሞላ ቢንጎ የሚለው ቁልፍ ያበራል። ወዲያውኑ በመጫን አሸናፊነትዎን ያረጋግጡና ሽልማቱን ወደ ቦርሳዎ ያስገቡ።',
              },
            },
          ],
        },
      },
      {
        id: 'cards-and-tickets',
        icon: Coins,
        badge: { en: 'CARDS & GRID', am: 'ካርዶች & ትኬት', color: 'bg-indigo-500 text-white' },
        title: { en: '🎟️ Card Selection & 400-Card Catalog', am: '🎟️ የካርድ ምርጫ እና ትኬት ግዢ' },
        subtitle: {
          en: 'How the 400 unique card catalog works, reservations holding, card previews, and buying multiple tickets.',
          am: 'ከ400 የካርድ ሰንጠረዦች ውስጥ መምረጥ፣ የጊዜያዊ ይዞታ (Reservation) እና የካርድ ቅድመ-ዕይታ።',
        },
        keywords: ['cards', '400 cards', 'selection', 'reservation', 'holding', 'buy tickets', 'preview matrix', 'colors', 'ካርዶች', 'ትኬት', 'ምርጫ', 'ማስያዝ'],
        quickAction: {
          label: { en: 'Go to Arenas to Select Cards →', am: 'ካርድ ለመምረጥ ወደ ክፍሎች ሂድ →' },
          icon: Zap,
          onClick: (p) => p.onNavigateTab('home'),
        },
        content: {
          overview: {
            en: 'Each Bingo room has a unique master set of 400 mathematically distinct Bingo cards (numbered #001 to #400). Every card has a completely unique combination of numbers generated with standard bingo algorithms.',
            am: 'እያንዳንዱ የቢንጎ ክፍል ከ#001 እስከ #400 የተዘጋጁ 400 የተለያየ የቁጥር ጥንቅር ያላቸው ካርዶችን ይዟል። ሁለት ተጫዋቾች አንድ አይነት ካርድ ሊኖራቸው አይችልም።',
          },
          statusExplanations: [
            {
              status: 'WHITE / SLATE',
              label: { en: 'Available Card', am: 'ክፍት ካርድ' },
              color: 'bg-slate-100 text-slate-900 border-slate-300',
              description: {
                en: 'The card is completely free. Tap it to reserve and preview its 5×5 number matrix.',
                am: 'ካርዱ አልተያዘም፤ በመንካት መምረጥና ቁጥሮቹን ማየት ይችላሉ።',
              },
            },
            {
              status: 'PULSING EMERALD',
              label: { en: 'Reserved by You', am: 'በእርስዎ የተያዘ' },
              color: 'bg-emerald-500 text-white border-emerald-300 animate-pulse',
              description: {
                en: 'You have selected this card. It is temporarily locked for you until you confirm purchase or the timer expires.',
                am: 'ካርዱ ለእርስዎ ለጊዜው ተይዟል፤ ግዢውን በማረጋገጥ የራስዎ ማድረግ ይችላሉ።',
              },
            },
            {
              status: 'SOLID EMERALD',
              label: { en: 'Purchased & Active', am: 'የተገዛ / ንቁ ትኬት' },
              color: 'bg-emerald-600 text-white border-emerald-400 font-black',
              description: {
                en: 'You have successfully bought this card for the upcoming round. It will be active in the live game.',
                am: 'ይህንን ካርድ ገዝተውታል፤ ጨዋታው ሲጀመር በቀጥታ ይጫወታሉ።',
              },
            },
            {
              status: 'AMBER / YELLOW',
              label: { en: 'Reserved by Other Player', am: 'በሌላ ሰው የተያዘ' },
              color: 'bg-amber-500 text-slate-950 border-amber-600',
              description: {
                en: 'Another player currently has this card selected. It is locked from selection.',
                am: 'ሌላ ተጫዋች ለጊዜው ይዞታል፤ ካልገዛው ተመልሶ ክፍት ይሆናል።',
              },
            },
            {
              status: 'RED / DARK',
              label: { en: 'Sold to Another Player', am: 'የተሸጠ ካርድ' },
              color: 'bg-red-600/90 text-white border-red-700',
              description: {
                en: 'Another player has confirmed payment for this card. It cannot be purchased for this round.',
                am: 'ይህ ካርድ ለሌላ ተጫዋች ተሽጧል፤ በዚህ ዙር ሊገዛ አይችልም።',
              },
            },
          ],
          steps: [
            {
              stepNumber: '01',
              title: { en: 'Card Matrix Preview Modal', am: 'የካርድ ቁጥሮች ቅድመ-ዕይታ' },
              description: {
                en: 'Tapping any card pops up the full 5×5 matrix with column headers B-I-N-G-O and number distribution before you commit your funds.',
                am: 'ማንኛውንም ካርድ ሲጫኑ የካርዱን 24 ቁጥሮች በቅድመ-ዕይታ ማየት ይችላሉ።',
              },
            },
            {
              stepNumber: '02',
              title: { en: 'Multi-Card Buying', am: 'ብዙ ካርዶችን በአንድ ላይ መግዛት' },
              description: {
                en: 'You can select multiple cards simultaneously (e.g. 2, 3, or 5 cards). The bottom floating dock calculates the total Birr required and buys them in one click.',
                am: 'በአንድ ዙር ከአንድ በላይ (ለምሳሌ 2፣ 3 ወይም 5) ካርዶችን መርጠው በአንድ ጊዜ መግዛት ይችላሉ።',
              },
            },
            {
              stepNumber: '03',
              title: { en: 'Holding Timer & Deselection', am: 'ካርድ መልቀቅ / መሰረዝ' },
              description: {
                en: 'If you change your mind, simply tap the card again or click the "X" button in your selected list to release the reservation.',
                am: 'ካርዱን ካልፈለጉት መልሰው በመጫን ወይም በመሰረዝ በቀላሉ መልቀቅ ይችላሉ።',
              },
            },
          ],
        },
      },
      {
        id: 'wallet-and-banking',
        icon: Wallet,
        badge: { en: 'TELEBIRR & CBE', am: 'ቴሌብር & ባንክ', color: 'bg-emerald-600 text-white' },
        title: { en: '💳 Wallet, Deposits & Withdrawals', am: '💳 የኪስ ቦርሳ፣ ገቢ እና ወጪ' },
        subtitle: {
          en: 'Complete guide to adding funds via Telebirr/CBE, submitting receipts, and requesting fast withdrawals.',
          am: 'በቴሌብር፣ በሲቢኢ ወይም በሌሎች ባንኮች ገንዘብ ማስገባት እና አሸናፊ ሲሆኑ ወጪ ማድረግ።',
        },
        keywords: ['wallet', 'deposit', 'withdraw', 'telebirr', 'cbe', 'commercial bank of ethiopia', 'awash', 'cbe birr', 'receipt', 'reference code', 'transaction', 'balance', 'ቦርሳ', 'ገቢ', 'ወጪ', 'ቴሌብር', 'ባንክ', 'ሒሳብ'],
        quickAction: {
          label: { en: 'Open Wallet & Banking →', am: 'ወደ ቦርሳ ገጽ ሂድ →' },
          icon: Wallet,
          onClick: (p) => p.onNavigateTab('wallet'),
        },
        secondaryAction: {
          label: { en: 'Verify Phone Number →', am: 'ስልክ ቁጥር አረጋግጥ →' },
          icon: Smartphone,
          onClick: (p) => p.onOpenPhoneVerification && p.onOpenPhoneVerification(),
        },
        content: {
          overview: {
            en: 'Your Yabede Bingo Wallet stores your active balance in Ethiopian Birr (ETB). We support all major Ethiopian financial providers including Telebirr, CBE Birr, Commercial Bank of Ethiopia (CBE), and Awash Bank.',
            am: 'የያበደ ቢንጎ ሒሳብዎ በኢትዮጵያ ብር (ETB) የሚቀመጥ ሲሆን በቴሌብር፣ በሲቢኢ ብር፣ በኢትዮጵያ ንግድ ባንክ እና በአዋሽ ባንክ ፈጣን ግብይቶችን ያከናውናል።',
          },
          steps: [
            {
              stepNumber: '01',
              title: { en: 'How to Deposit (Step-by-Step)', am: 'ገንዘብ እንዴት ማስገባት ይቻላል?' },
              description: {
                en: '1. Go to Wallet → Deposit tab.\n2. Select your payment provider (Telebirr or CBE).\n3. Copy the official merchant account number/phone.\n4. Transfer the desired amount via your Telebirr app or USSD (*127# / CBE Mobile Banking).\n5. Copy the transaction reference ID (TXID) from the SMS.\n6. Return to the Mini App, enter the amount & reference ID, optionally upload your receipt screenshot, and tap "Submit Deposit".',
                am: '1. የቦርሳ (Wallet) ገጽን ከፍተው Deposit የሚለውን ይምረጡ።\n2. የመክፈያ ዘዴዎን (ቴሌብር ወይም ሲቢኢ) ይምረጡ።\n3. የተቀመጠውን የሒሳብ ቁጥር ገልብጠው (Copy) በቴሌብር ወይም በባንክዎ ይላኩ።\n4. ከደረሰዎት አጭር የጽሁፍ መልዕክት (SMS) የግብይት ቁጥሩን (Transaction ID) ይቅዱ።\n5. ወደ ሚኒ አፑ ተመልሰው መጠኑን እና የግብይት ቁጥሩን አስገብተው ያረጋግጡ።',
              },
              tip: { en: 'Deposits are audited by administrators and credited rapidly.', am: 'የላኩት ገንዘብ በፍጥነት ተረጋግጦ ወደ ቦርሳዎ ይገባል።' },
            },
            {
              stepNumber: '02',
              title: { en: 'How to Withdraw Your Winnings', am: 'ገንዘብ ወጪ (Withdraw) ማድረግ' },
              description: {
                en: '1. Go to Wallet → Withdraw tab.\n2. Choose your payout method (Telebirr or CBE Bank).\n3. Enter the amount to withdraw, your registered mobile/account number, and full account holder name.\n4. Tap "Request Withdrawal". Payouts are reviewed and dispatched directly to your mobile wallet or bank account.',
                am: '1. የቦርሳ ገጽን ከፍተው Withdraw የሚለውን ይጫኑ።\n2. ገንዘቡ እንዲገባ የሚፈልጉበትን (ቴሌብር ወይም ሲቢኢ) ይምረጡ።\n3. የብር መጠኑን፣ ስልክ ቁጥርዎን እና ሙሉ ስምዎን አስገብተው ይጠይቁ።\n4. ክፍያው በቀጥታ ወደ ቴሌብርዎ ወይም ወደ ባንክ ሒሳብዎ ይተላለፋል።',
              },
              tip: { en: 'Phone verification is mandatory prior to withdrawing funds.', am: 'ገንዘብ ወጪ ለማድረግ የስልክ ቁጥር ማረጋገጫ አስቀድሞ ያስፈልጋል።' },
            },
            {
              stepNumber: '03',
              title: { en: 'Transaction Ledger & Statuses', am: 'የግብይት ታሪክ እና ሁኔታ' },
              description: {
                en: 'Switch to the "History" tab inside the Wallet to view all past deposits, withdrawals, ticket purchases, and game win payouts with their live status (COMPLETED, PENDING, REJECTED).',
                am: 'በቦርሳ ገጽ ውስጥ ባለው የሂሳብ ታሪክ (History) ያለፉትን ገቢዎች፣ ወጪዎችና ያሸነፏቸውን ሽልማቶች ሁኔታ መከታተል ይችላሉ።',
              },
            },
          ],
        },
      },
      {
        id: 'private-groups',
        icon: Lock,
        badge: { en: 'MULTIPLAYER', am: 'የግል ጨዋታ', color: 'bg-amber-500 text-slate-950' },
        title: { en: '🔒 Private Group Bingo with Friends', am: '🔒 ከጓደኞች ጋር የግል ግሩፕ ቢንጎ' },
        subtitle: {
          en: 'Create private custom rooms with 6-character codes, invite your friends, and host private rounds.',
          am: 'የራስዎን የግል ክፍል በ6-ዲጂት ኮድ ይፍጠሩ፣ ጓደኞችዎን ይጋብዙ እና አብረው ይጫወቱ።',
        },
        keywords: ['private group', 'friends', 'invite', 'host', 'code', 'lobby', 'custom ticket', 'play again', 'close group', 'የግል ግሩፕ', 'ጓደኞች', 'ኮድ', 'መጋበዝ'],
        quickAction: {
          label: { en: 'Create a Private Group →', am: 'አዲስ የግል ግሩፕ ፍጠር →' },
          icon: PlusCircle,
          onClick: (p) => p.onCreatePrivateGroup && p.onCreatePrivateGroup(),
        },
        secondaryAction: {
          label: { en: 'Join with Code →', am: 'በኮድ ተቀላቀል →' },
          icon: KeyRound,
          onClick: (p) => p.onJoinPrivateGroupCode && p.onJoinPrivateGroupCode(),
        },
        content: {
          overview: {
            en: 'Private Groups allow you to create your own exclusive Bingo arena. You decide the ticket price, share a 6-character room code with your friends or Telegram contacts, and start the live draw when everyone is ready!',
            am: 'የግል ግሩፕ ቢንጎ የራስዎን ክፍል ፈጥረው ከቤተሰብና ከጓደኞች ጋር ብቻ ለመጫወት ያስችላል። የትኬት ዋጋውን ይወስናሉ፣ ባለ 6-ፊደል ኮድ ለጓደኞችዎ ያጋራሉ፣ ሁሉም ሲዘጋጅ ጨዋታውን ይጀምራሉ።',
          },
          steps: [
            {
              stepNumber: '01',
              title: { en: 'Creating a Private Group', am: 'የግል ክፍል መፍጠር' },
              description: {
                en: 'Tap "Create Private Group" on the Home view. Set your group name (e.g., "Addis Champions") and select ticket price (10, 20, 50, 100, or 200 Birr).',
                am: 'በመነሻ ገጽ ላይ "Create Private Group" የሚለውን ይጫኑ። የስም እና የትኬት ዋጋ መርጠው ክፍሉን ይክፈቱ።',
              },
            },
            {
              stepNumber: '02',
              title: { en: 'Inviting Players & Join Codes', am: 'ተጫዋቾችን በኮድ መጋበዝ' },
              description: {
                en: 'Every private group has a unique 6-character code (e.g. "AB7X9Q"). Share this code with friends so they can join via "Join with Code", or send direct Telegram invites.',
                am: 'እያንዳንዱ ክፍል ባለ 6-ፊደል ልዩ ኮድ አለው። ኮዱን ለጓደኞችዎ በማጋራት እንዲቀላቀሉ ያድርጉ።',
              },
            },
            {
              stepNumber: '03',
              title: { en: 'Host Controls & Play Again', am: 'የአስተናጋጅ (Host) ስልጣን' },
              description: {
                en: 'The host has exclusive controls to start the game when minimum players have bought cards. After a round concludes, the host can trigger "Play Again" for another round or "Close Group".',
                am: 'ክፍሉን የከፈተው ሰው (Host) ተጫዋቾች ካርድ ሲገዙ ጨዋታውን የማስጀመር፣ ድጋሚ የማጫወት (Play Again) ወይም ክፍሉን የመዝጋት ሙሉ ስልጣን አለው።',
              },
            },
          ],
        },
      },
      {
        id: 'referrals-and-rewards',
        icon: Gift,
        badge: { en: 'EARN BIRR', am: 'ጉርሻ & ሽልማት', color: 'bg-purple-600 text-white' },
        title: { en: '🎁 Referral Program & Bonus Rewards', am: '🎁 የጓደኛ መጋበዣ እና ቦነስ' },
        subtitle: {
          en: 'Share your personal referral link, earn Birr bonuses per invited player, and track earnings.',
          am: 'የመጋበዣ ሊንክዎን በማጋራት ለእያንዳንዱ ለጋበዙት ጓደኛ የብር ጉርሻ ያግኙ።',
        },
        keywords: ['referral', 'invite', 'bonus', 'rewards', 'earn', 'share link', 'friends', 'ጉርሻ', 'መጋበዝ', 'ሽልማት', 'ቦነስ'],
        quickAction: {
          label: { en: 'Open Referral Hub →', am: 'የመጋበዣ ገጽ ክፈት →' },
          icon: Gift,
          onClick: (p) => p.onNavigateTab('bonuses'),
        },
        content: {
          overview: {
            en: 'Invite your friends to Yabede Bingo and earn instant cash rewards deposited directly into your bonus balance for every friend who registers and plays.',
            am: 'ጓደኞችዎ በያበደ ቢንጎ እንዲጫወቱ በመጋበዝ ለእያንዳንዱ አዲስ ተጠቃሚ ፈጣን የብር ቦነስ ያግኙ።',
          },
          steps: [
            {
              stepNumber: '01',
              title: { en: 'Copy Your Telegram Referral Link', am: 'የመጋበዣ ሊንክዎን ይቅዱ' },
              description: {
                en: 'Open the "Bonuses & Rewards" tab to find your personalized link (e.g., https://t.me/yabede_bingo_bot/app?startapp=YOUR_CODE).',
                am: 'በቦነስ (Bonuses) ገጽ ውስጥ የእርስዎን ልዩ የቴሌግራም መጋበዣ ሊንክ ያገኛሉ።',
              },
            },
            {
              stepNumber: '02',
              title: { en: 'Share to Telegram Groups & Channels', am: 'በቴሌግራም ያጋሩ' },
              description: {
                en: 'Tap "Share on Telegram" to instantly forward your invitation link to your Telegram chats, channels, or stories.',
                am: 'በቀጥታ ወደ ቴሌግራም ግሩፖች፣ ቻናሎች ወይም ለግል ጓደኞችዎ ያጋሩ።',
              },
            },
            {
              stepNumber: '03',
              title: { en: 'Automatic Registration & Payout', am: 'ቦነስ በራስ-ሰር ገቢ መሆን' },
              description: {
                en: 'When your friend launches the bot using your link, our system automatically binds them to your profile and credits your referral bonus immediately.',
                am: 'ጓደኛዎ በእርስዎ ሊንክ ሲገባ ሲስተሙ ወዲያውኑ አገናኝቶ የቦነስ ክፍያዎን ወደ ሒሳብዎ ያስገባል።',
              },
            },
          ],
        },
      },
      {
        id: 'telegram-and-account',
        icon: Smartphone,
        badge: { en: 'SECURITY', am: 'ደህንነት', color: 'bg-sky-500 text-white' },
        title: { en: '📱 Telegram Features & Phone Verification', am: '📱 የቴሌግራም አሰራር እና ስልክ ማረጋገጥ' },
        subtitle: {
          en: 'Telegram authentication, verifying Ethiopian phone numbers, security, and profile customization.',
          am: 'የቴሌግራም ደህንነት፣ የስልክ ቁጥር ማረጋገጫ እና የመገለጫ መረጃዎች።',
        },
        keywords: ['telegram', 'phone verification', 'auth', 'security', 'profile', 'avatar', 'ethiopian number', '09', '07', 'ቴሌግራም', 'ስልክ ማረጋገጥ', 'ደህንነት'],
        quickAction: {
          label: { en: 'Verify Phone Number →', am: 'ስልክ ቁጥር አረጋግጥ →' },
          icon: Smartphone,
          onClick: (p) => p.onOpenPhoneVerification && p.onOpenPhoneVerification(),
        },
        secondaryAction: {
          label: { en: 'View Profile & Account →', am: 'የመገለጫ ገጽ ክፈት →' },
          icon: ShieldCheck,
          onClick: (p) => p.onOpenAuth && p.onOpenAuth(),
        },
        content: {
          overview: {
            en: 'Yabede Bingo is natively built inside Telegram. Your Telegram session is cryptographically validated using Telegram WebApp initData to provide secure, frictionless access without needing tedious passwords.',
            am: 'ያበደ ቢንጎ በቀጥታ በቴሌግራም ውስጥ የተሰራ በመሆኑ ያለ ምንም የይለፍ ቃል በቴሌግራም አካውንትዎ ብቻ አስተማማኝ በሆነ መንገድ ይሰራል።',
          },
          steps: [
            {
              stepNumber: '01',
              title: { en: 'Instant Telegram Sign-In', am: 'በቴሌግራም በቀጥታ መግባት' },
              description: {
                en: 'Opening the Mini App automatically authenticates your Telegram ID, photo, and username securely.',
                am: 'ሚኒ አፑ ሲከፈት የቴሌግራም መታወቂያዎና መረጃዎ ወዲያውኑ ይገናኛል።',
              },
            },
            {
              stepNumber: '02',
              title: { en: 'Why Phone Verification is Required', am: 'ስልክ ማረጋገጥ ለምን አስፈለገ?' },
              description: {
                en: 'Linking your Ethiopian mobile number (09... or 07...) protects your funds, prevents multi-account exploitation, and enables instant Telebirr/CBE withdrawals.',
                am: 'የኢትዮጵያ ስልክ ቁጥርዎን (09... ወይም 07...) ማገናኘት የሒሳብዎን ደህንነት ለመጠበቅ እና አሸናፊ ሲሆኑ በቴሌብር/ባንክ ወጪ ለማድረግ የግድ ያስፈልጋል።',
              },
            },
            {
              stepNumber: '03',
              title: { en: 'Haptic Feedback & Sound Effects', am: 'ንዝረት እና የድምፅ ውጤቶች' },
              description: {
                en: 'The app supports native Telegram haptics for immersive tactile feedback on button presses and win alerts. Audio announcements are supported in both English and Amharic.',
                am: 'በጨዋታው ውስጥ ንዝረት (Haptics) እና በድምፅ ቁጥሮችን የሚጠራ የድምፅ ሲስተም (አማርኛ እና እንግሊዝኛ) ተካቷል።',
              },
            },
          ],
        },
      },
      {
        id: 'settings-and-customization',
        icon: Globe,
        badge: { en: 'SETTINGS', am: 'ማስተካከያ', color: 'bg-slate-700 text-white' },
        title: { en: '⚙️ Settings, Themes & Audio', am: '⚙️ ማስተካከያ፣ ቋንቋ እና ድምፅ' },
        subtitle: {
          en: 'Toggle Amharic/English, switch between Golden Hour, Daylight, and Midnight themes, and customize sound.',
          am: 'የቋንቋ ምርጫ (አማርኛ/English)፣ የቀለም ገጽታ (Themes) እና የድምፅ ማስተካከያ።',
        },
        keywords: ['settings', 'language', 'amharic', 'english', 'themes', 'dark mode', 'golden hour', 'daylight', 'audio', 'sound', 'voice caller', 'ማስተካከያ', 'ቋንቋ', 'አማርኛ', 'ድምፅ'],
        content: {
          overview: {
            en: 'Customize your gaming interface from the persistent header bar at the top of the app at any time.',
            am: 'በማንኛውም ሰዓት ከላይ ባለው የራስጌ አሞሌ (Header Bar) በኩል የመተግበሪያውን ገጽታና ድምፅ እንደፈለጉ ማስተካከል ይችላሉ።',
          },
          featureList: [
            {
              title: { en: 'Language Switcher (🇪🇹 Amharic / 🇬🇧 English)', am: 'የቋንቋ ምርጫ (🇪🇹 አማርኛ / 🇬🇧 English)' },
              description: {
                en: 'Tap the Globe icon in the header to switch the entire application and caller voice between Amharic and English instantly.',
                am: 'ከላይ ያለውን የግሎብ ምልክት በመጫን ሙሉ መተግበሪያውንና የድምፅ ጠሪውን ወደ አማርኛ ወይም እንግሊዝኛ መቀየር ይችላሉ።',
              },
            },
            {
              title: { en: 'Themes: Golden Hour, Daylight & Midnight', am: 'የቀለም ገጽታዎች (Themes)' },
              description: {
                en: 'Tap the Theme icon to cycle through: (1) Golden Hour (warm casino gold), (2) Daylight (high-contrast light mode), and (3) Midnight (deep sapphire dark mode).',
                am: 'የቀለም ገጽታውን በወርቃማ (Golden Hour)፣ በደማቅ ነጭ (Daylight) ወይም በጨለማ (Midnight) መቀያየር ይችላሉ።',
              },
            },
            {
              title: { en: 'Voice Caller & Audio Sound FX', am: 'የድምፅ ውጤቶች እና የቁጥር ጠሪ' },
              description: {
                en: 'Tap the Speaker icon in the header to mute or unmute game sounds, number callouts, and celebratory win fanfares.',
                am: 'የድምፅ ማጉያውን ምልክት በመጫን የቁጥር ጠሪውንና የጨዋታውን ድምፅ ማብራት ወይም ማጥፋት ይችላሉ።',
              },
            },
          ],
        },
      },
      {
        id: 'troubleshooting-and-faq',
        icon: HelpCircle,
        badge: { en: 'HELP & FAQ', am: 'ጥያቄ እና መልስ', color: 'bg-red-500/80 text-white' },
        title: { en: '❓ Troubleshooting & Frequently Asked Questions', am: '❓ የተለመዱ ችግሮች እና መፍትሔዎቻቸው' },
        subtitle: {
          en: 'Instant solutions to common queries regarding deposits, card reservations, withdrawals, and game connections.',
          am: 'ስለ ገቢ፣ ወጪ፣ ትኬቶች እና የኔትወርክ ግንኙነት ለሚነሱ ጥያቄዎች የተሰጡ ፈጣን ምላሾች።',
        },
        keywords: ['troubleshooting', 'faq', 'error', 'deposit not showing', 'cannot buy card', 'ticket reserved', 'withdrawal delay', 'network', 'ችግሮች', 'ጥያቄዎች', 'መልስ'],
        content: {
          overview: {
            en: 'Find immediate answers to common user questions below. If you encounter an issue, these steps will help you resolve it quickly.',
            am: 'ለተጠቃሚዎች በተደጋጋሚ ለሚነሱ ጥያቄዎችና ለሚያጋጥሙ ችግሮች ፈጣን መፍትሔዎች ከዚህ በታች ተዘርዝረዋል።',
          },
          faqs: [
            {
              q: {
                en: 'Why is a card shown in Amber or Red and cannot be clicked?',
                am: 'ካርዶች ቢጫ ወይም ቀይ ሆነው የማይነኩት ለምንድነው?',
              },
              a: {
                en: 'Amber indicates another player currently holds a temporary reservation on that card. Red indicates the card has already been bought by someone else for this round. Simply choose any white/available card from the 400 catalog.',
                am: 'ቢጫ የሚያሳየው ሌላ ተጫዋች ለጊዜው ይዞት እንደሆነ ሲሆን ቀይ ደግሞ ካርዱ ለሌላ ሰው መሸጡን ያመለክታል። ክፍት ከሆኑት ነጭ ካርዶች ውስጥ ሌላ መምረጥ ይችላሉ።',
              },
            },
            {
              q: {
                en: 'How long does a deposit take to reflect in my balance?',
                am: 'ያስገባሁት ገንዘብ ወደ ቦርሳዬ ለመግባት ምን ያህል ጊዜ ይወስዳል?',
              },
              a: {
                en: 'Deposits submitted with a valid Telebirr or CBE transaction reference ID are reviewed promptly by administrators and typically credited within 1 to 5 minutes.',
                am: 'ትክክለኛ የግብይት ቁጥር (Transaction ID) ያስገቡት ገንዘብ በአስተዳዳሪዎች ተረጋግጦ በ1 እስከ 5 ደቂቃ ውስጥ ወደ ቦርሳዎ ይገባል።',
              },
            },
            {
              q: {
                en: 'What should I do if my game disconnected during a live draw?',
                am: 'በቀጥታ ጨዋታ ወቅት የኔትወርክ መቆራረጥ ካጋጠመኝ ምን ይሆናል?',
              },
              a: {
                en: 'Do not worry! The Bingo engine is server-authoritative. If you bought tickets and have Auto-Daub enabled, your cards are continuously tracked on the server. If your card wins, your prize is automatically credited to your wallet balance even if you temporarily lose connection.',
                am: 'አይጨነቁ! ጨዋታው በዋናው ሰርቨር የሚመራ በመሆኑ ካርድ ገዝተው ከሆነ ኔትወርክ ቢቋረጥም እንኳን ካርድዎ ካሸነፈ ሽልማቱ በቀጥታ ወደ ቦርሳዎ ገቢ ይሆናል።',
              },
            },
            {
              q: {
                en: 'Can multiple players win in the same round?',
                am: 'በአንድ ዙር ከአንድ በላይ ሰዎች ሊያሸንፉ ይችላሉ?',
              },
              a: {
                en: 'Yes. If two or more players complete a winning pattern on the exact same drawn ball, the round prize pool is divided equally and paid out instantly to all verified winners.',
                am: 'አዎ፤ ሁለት ወይም ከዚያ በላይ ተጫዋቾች በአንድ ኳስ እኩል ካሸነፉ የሽልማቱ ገንዘብ ለእኩል ተካፍሎ ወደ ሒሳባቸው ይገባል።',
              },
            },
            {
              q: {
                en: 'How do I check my past games and winning verification?',
                am: 'ያለፉ ጨዋታዎችን እና የአሸናፊነት ማረጋገጫዎችን የት ማየት እችላለሁ?',
              },
              a: {
                en: 'Open the "Game History" tab from the menu. You can inspect every round you played, see all 75 drawn balls, view your 5×5 card matrices, and verify payouts.',
                am: 'ከምናሌው ውስጥ "Game History" የሚለውን ገጽ በመክፈት የተጫወቷቸውን ዙሮች፣ የወጡትን ኳሶች እና ያሸነፉትን ትኬት ማየት ይችላሉ።',
              },
            },
          ],
        },
      },
    ],
    []
  );

  // Filter sections by search and category
  const filteredSections = useMemo(() => {
    let list = HELP_SECTIONS;

    if (activeCategory !== 'all') {
      list = list.filter((s) => s.id === activeCategory);
    }

    if (!searchQuery.trim()) {
      return list;
    }

    const q = searchQuery.toLowerCase().trim();
    return list.filter((s) => {
      const matchTitle =
        s.title.en.toLowerCase().includes(q) || s.title.am.toLowerCase().includes(q);
      const matchSub =
        s.subtitle.en.toLowerCase().includes(q) || s.subtitle.am.toLowerCase().includes(q);
      const matchKeywords = s.keywords.some((k) => k.toLowerCase().includes(q));
      const matchOverview =
        s.content.overview.en.toLowerCase().includes(q) ||
        s.content.overview.am.toLowerCase().includes(q);
      const matchFaq = s.content.faqs?.some(
        (f) =>
          f.q.en.toLowerCase().includes(q) ||
          f.q.am.toLowerCase().includes(q) ||
          f.a.en.toLowerCase().includes(q) ||
          f.a.am.toLowerCase().includes(q)
      );

      return matchTitle || matchSub || matchKeywords || matchOverview || matchFaq;
    });
  }, [HELP_SECTIONS, searchQuery, activeCategory]);

  return (
    <div className="space-y-4 sm:space-y-6 pb-28 w-full min-w-0 animate-in fade-in duration-300">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-400 to-yellow-300 p-0.5 shadow-lg shadow-amber-500/20 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-amber-400">
                <BookOpen className="w-6 h-6" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-xl font-black text-white font-display tracking-tight">
                  {language === 'am' ? 'የተጠቃሚ መመሪያ & እርዳታ' : 'Help & User Manual'}
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-black uppercase font-mono">
                  Manual v2.6
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {language === 'am'
                  ? 'ስለ ያበደ ቢንጎ አጠቃቀም፣ ክፍያ፣ ደንቦች እና ጠቃሚ መረጃዎች ሙሉ ማብራሪያ'
                  : 'Complete official documentation, game mechanics, banking guide, and troubleshooting'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={expandAll}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-bold transition flex items-center gap-1 min-h-[36px]"
              title="Expand All"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span>{language === 'am' ? 'ሁሉንም ክፈት' : 'Expand All'}</span>
            </button>
            <button
              onClick={collapseAll}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] font-bold transition flex items-center gap-1 min-h-[36px]"
              title="Collapse All"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>{language === 'am' ? 'ሁሉንም ዝጋ' : 'Collapse All'}</span>
            </button>
          </div>
        </div>

        {/* Live Search Input Bar */}
        <div className="mt-4 pt-4 border-t border-slate-800/80">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                language === 'am'
                  ? 'በመመሪያው ውስጥ ይፈልጉ (ለምሳሌ፡ wallet, deposit, withdraw, bingo, referral)...'
                  : 'Search manual (e.g. wallet, deposit, withdraw, cards, winning rules, referrals)...'
              }
              className="w-full pl-10 pr-10 py-3 rounded-2xl bg-slate-950 border border-slate-800 hover:border-amber-500/40 focus:border-amber-400 text-xs sm:text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition shadow-inner"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1 rounded-full bg-slate-800 text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Chips Navigation / Table of Contents */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs">
        <button
          onClick={() => {
            setActiveCategory('all');
            triggerHaptic('light');
          }}
          className={`px-3 py-2 rounded-xl font-bold whitespace-nowrap transition shrink-0 min-h-[36px] flex items-center gap-1.5 border ${
            activeCategory === 'all'
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
              : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{language === 'am' ? 'ሁሉም ርዕሶች' : 'All Topics'}</span>
        </button>

        {HELP_SECTIONS.map((sec) => {
          const Icon = sec.icon;
          const isCurrent = activeCategory === sec.id;
          return (
            <button
              key={sec.id}
              onClick={() => {
                setActiveCategory(sec.id);
                scrollToSection(sec.id);
                triggerHaptic('light');
              }}
              className={`px-3 py-2 rounded-xl font-bold whitespace-nowrap transition shrink-0 min-h-[36px] flex items-center gap-1.5 border ${
                isCurrent
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20'
                  : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="truncate max-w-[140px]">
                {language === 'am' ? sec.title.am.replace(/^[^a-zA-Z0-9\u1200-\u137F]+/, '') : sec.title.en.replace(/^[^a-zA-Z0-9]+/, '')}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Filter Status */}
      {searchQuery && (
        <div className="flex items-center justify-between px-1 text-xs text-slate-400">
          <span>
            {language === 'am' ? 'የፍለጋ ውጤቶች ለ:' : 'Search results for:'}{' '}
            <strong className="text-amber-400">"{searchQuery}"</strong> ({filteredSections.length} found)
          </span>
          <button
            onClick={() => setSearchQuery('')}
            className="text-amber-400 hover:underline text-[11px] font-bold"
          >
            {language === 'am' ? 'ፍለጋ አጽዳ' : 'Clear search'}
          </button>
        </div>
      )}

      {/* HELP SECTIONS LIST ACCORDION */}
      <div className="space-y-4">
        {filteredSections.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
            <HelpCircle className="w-10 h-10 text-slate-600 mx-auto" />
            <h4 className="text-sm font-black text-white">
              {language === 'am' ? 'ምንም የተገኘ ውጤት የለም' : 'No matching help topics found'}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {language === 'am'
                ? 'እባክዎ ሌላ ቃል ይሞክሩ ወይም ሁሉንም ርዕሶች ይመልከቱ።'
                : 'Try searching with different terms like "wallet", "deposit", "bingo", or "referral".'}
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setActiveCategory('all');
              }}
              className="px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs"
            >
              {language === 'am' ? 'ሁሉንም አሳይ' : 'Reset Filters'}
            </button>
          </div>
        ) : (
          filteredSections.map((section) => {
            const Icon = section.icon;
            const isExpanded = expandedSections[section.id] !== false;

            return (
              <div
                key={section.id}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                id={section.id}
                className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl transition-all duration-200"
              >
                {/* Accordion Header Bar */}
                <div
                  onClick={() => toggleSection(section.id)}
                  className="p-4 sm:p-5 flex items-center justify-between gap-3 cursor-pointer select-none bg-slate-900 hover:bg-slate-800/60 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-sm">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm sm:text-base font-black text-white truncate">
                          {language === 'am' ? section.title.am : section.title.en}
                        </h3>
                        {section.badge && (
                          <span
                            className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0 ${section.badge.color}`}
                          >
                            {language === 'am' ? section.badge.am : section.badge.en}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 line-clamp-1">
                        {language === 'am' ? section.subtitle.am : section.subtitle.en}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-amber-400" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Accordion Body */}
                {isExpanded && (
                  <div className="px-4 sm:px-6 pb-6 pt-2 border-t border-slate-800/80 space-y-5 bg-slate-950/40 animate-in fade-in duration-200">
                    {/* Section Overview */}
                    <div className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-xs sm:text-sm text-slate-300 leading-relaxed">
                      {language === 'am' ? section.content.overview.am : section.content.overview.en}
                    </div>

                    {/* Interactive Direct Navigation Actions (CRITICAL) */}
                    {(section.quickAction || section.secondaryAction) && (
                      <div className="flex flex-wrap items-center gap-2.5 pt-1">
                        {section.quickAction && (
                          <button
                            onClick={() => {
                              triggerHaptic('medium');
                              section.quickAction?.onClick(props);
                            }}
                            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition min-h-[42px] cursor-pointer"
                          >
                            <section.quickAction.icon className="w-4 h-4" />
                            <span>{language === 'am' ? section.quickAction.label.am : section.quickAction.label.en}</span>
                          </button>
                        )}

                        {section.secondaryAction && (
                          <button
                            onClick={() => {
                              triggerHaptic('medium');
                              section.secondaryAction?.onClick(props);
                            }}
                            className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 font-bold text-xs flex items-center justify-center gap-2 active:scale-95 transition min-h-[42px] cursor-pointer"
                          >
                            <section.secondaryAction.icon className="w-4 h-4 text-amber-400" />
                            <span>{language === 'am' ? section.secondaryAction.label.am : section.secondaryAction.label.en}</span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Feature Highlights Grid */}
                    {section.content.featureList && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Zap className="w-3.5 h-3.5" />
                          <span>{language === 'am' ? 'ቁልፍ ዝርዝሮች' : 'Feature Breakdown'}</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {section.content.featureList.map((item, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 space-y-1"
                            >
                              <div className="text-xs font-black text-white flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                                <span>{language === 'am' ? item.title.am : item.title.en}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 leading-normal">
                                {language === 'am' ? item.description.am : item.description.en}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Numbered Step-by-Step Instructions */}
                    {section.content.steps && (
                      <div className="space-y-3">
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{language === 'am' ? 'ደረጃ በደረጃ መመሪያ' : 'Step-by-Step Instructions'}</span>
                        </h4>
                        <div className="space-y-2.5">
                          {section.content.steps.map((st, idx) => (
                            <div
                              key={idx}
                              className="p-3.5 sm:p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-start gap-3 sm:gap-4 shadow-sm"
                            >
                              <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-black text-amber-300 text-xs shrink-0 font-mono">
                                {st.stepNumber}
                              </div>
                              <div className="space-y-1 flex-1 min-w-0">
                                <h5 className="text-xs sm:text-sm font-black text-white">
                                  {language === 'am' ? st.title.am : st.title.en}
                                </h5>
                                <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                                  {language === 'am' ? st.description.am : st.description.en}
                                </p>
                                {st.tip && (
                                  <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-2 text-[10px] sm:text-[11px] text-amber-300 font-medium mt-2">
                                    <Sparkles className="w-3 h-3 text-amber-400 shrink-0" />
                                    <span>{language === 'am' ? st.tip.am : st.tip.en}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Visual Status Badges Explanations */}
                    {section.content.statusExplanations && (
                      <div className="space-y-2.5">
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5" />
                          <span>{language === 'am' ? 'የቀለማት እና የሁኔታዎች ትርጉም' : 'Visual Indicators & Color Badges'}</span>
                        </h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {section.content.statusExplanations.map((st, idx) => (
                            <div
                              key={idx}
                              className="p-3 rounded-2xl bg-slate-900 border border-slate-800 flex items-start gap-2.5"
                            >
                              <span
                                className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase border shrink-0 mt-0.5 ${st.color}`}
                              >
                                {st.status}
                              </span>
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-200">
                                  {language === 'am' ? st.label.am : st.label.en}
                                </div>
                                <p className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5">
                                  {language === 'am' ? st.description.am : st.description.en}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Frequently Asked Questions */}
                    {section.content.faqs && (
                      <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
                        <h4 className="text-xs font-black uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                          <HelpCircle className="w-3.5 h-3.5" />
                          <span>{language === 'am' ? 'ተደጋጋሚ ጥያቄዎች (FAQ)' : 'Frequently Asked Questions'}</span>
                        </h4>
                        <div className="space-y-2">
                          {section.content.faqs.map((faq, fIdx) => (
                            <div
                              key={fIdx}
                              className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800/90 space-y-1.5"
                            >
                              <div className="text-xs sm:text-sm font-black text-amber-300 flex items-start gap-2">
                                <span className="font-mono text-amber-400 shrink-0">Q:</span>
                                <span>{language === 'am' ? faq.q.am : faq.q.en}</span>
                              </div>
                              <p className="text-[11px] sm:text-xs text-slate-300 leading-relaxed pl-5">
                                {language === 'am' ? faq.a.am : faq.a.en}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Support & Community Footer Box */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 text-center space-y-3 shadow-xl">
        <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto">
          <MessageSquare className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-black text-white">
            {language === 'am' ? 'ተጨማሪ እርዳታ ይፈልጋሉ?' : 'Need More Assistance?'}
          </h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
            {language === 'am'
              ? 'የእኛ የድጋፍ ቡድን በቴሌግራም ቦቱ በኩል 24/7 ዝግጁ ነው። ማንኛውም ጥያቄ ካለዎት በቀጥታ ያነጋግሩን።'
              : 'Our 24/7 support channel is available directly through the official Telegram Bot (@yabede_bingo_bot).'}
          </p>
        </div>
        <div className="pt-1 flex justify-center">
          <a
            href="https://t.me/yabede_bingo_bot"
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => triggerHaptic('medium')}
            className="px-5 py-2.5 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-400 font-bold text-xs flex items-center gap-2 transition"
          >
            <ExternalLink className="w-4 h-4" />
            <span>{language === 'am' ? 'የቴሌግራም ቦት ክፈት' : 'Open Telegram Support Bot'}</span>
          </a>
        </div>
      </div>
    </div>
  );
};
