import React, { useState, useEffect, useRef } from 'react';
import { apiUrl } from '@shared/apiConfig';
import { Bot, Send, Smartphone, ShieldCheck, Check, Key, User, HelpCircle, X, RefreshCw } from 'lucide-react';
import { triggerHaptic } from '../lib/telegramSDK';
import { UserProfile } from '@shared/types';

interface BotMessageItem {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  buttons?: { text: string; request_contact?: boolean; callback_data?: string; url?: string }[];
  time: string;
}

interface TelegramBotModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: UserProfile;
  onAuthSuccess?: (user: UserProfile) => void;
}

export const TelegramBotModal: React.FC<TelegramBotModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onAuthSuccess,
}) => {
  const [messages, setMessages] = useState<BotMessageItem[]>([]);
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [chatId, setChatId] = useState<number>(currentUser.telegramId || 100001);
  const [sessionState, setSessionState] = useState<string>('IDLE');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      const activeId = currentUser.telegramId || 100001;
      setChatId(activeId);
      // Fetch initial start or session
      sendMessageToBot('/start', activeId);
    }
  }, [isOpen, currentUser]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessageToBot = async (textToSend: string, customChatId?: number, contactPayload?: any) => {
    const targetChatId = customChatId || chatId;
    setLoading(true);

    const userMsgTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (textToSend && !contactPayload) {
      setMessages((prev) => [
        ...prev,
        {
          id: `usr_${Date.now()}`,
          sender: 'user',
          text: textToSend,
          time: userMsgTime,
        },
      ]);
    } else if (contactPayload) {
      setMessages((prev) => [
        ...prev,
        {
          id: `usr_contact_${Date.now()}`,
          sender: 'user',
          text: `📱 Shared Contact: ${contactPayload.phone_number}`,
          time: userMsgTime,
        },
      ]);
    }

    try {
      const res = await fetch(apiUrl('/api/telegram/simulator'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: targetChatId,
          text: textToSend,
          contact: contactPayload,
          from: {
            id: targetChatId,
            first_name: currentUser.firstName || 'Abebe',
            last_name: currentUser.lastName || 'Kebede',
            username: currentUser.username || 'abebe_k',
            language_code: 'am',
          },
        }),
      });

      const data = await res.json();
      if (data.success && data.botResponse) {
        const botResp = data.botResponse;
        setSessionState(data.sessionState || 'IDLE');

        let buttons: any[] = [];
        if (botResp.replyMarkup?.keyboard) {
          buttons = botResp.replyMarkup.keyboard.flat();
        } else if (botResp.replyMarkup?.inline_keyboard) {
          buttons = botResp.replyMarkup.inline_keyboard.flat();
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `bot_${Date.now()}`,
            sender: 'bot',
            text: botResp.text,
            buttons,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ]);

        // If registration completed or user logged in, check user profile
        if (botResp.text && (botResp.text.includes('Registration Completed') || botResp.text.includes('Login Successful'))) {
          const profileRes = await fetch(apiUrl(`/api/user/profile?userId=usr_tg_${targetChatId}`));
          if (profileRes.ok) {
            const pData = await profileRes.json();
            if (pData.user && onAuthSuccess) {
              onAuthSuccess(pData.user);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to communicate with bot simulator:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendText = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim() || loading) return;
    const txt = inputText.trim();
    setInputText('');
    triggerHaptic('light');
    sendMessageToBot(txt);
  };

  const handleButtonClick = (btn: { text: string; request_contact?: boolean; callback_data?: string; url?: string }) => {
    triggerHaptic('medium');

    if (btn.request_contact) {
      // Simulate sharing phone contact directly from Telegram
      const defaultPhone = currentUser.phone || '+251911223344';
      sendMessageToBot('', undefined, {
        phone_number: defaultPhone,
        first_name: currentUser.firstName || 'Abebe',
        last_name: currentUser.lastName || 'Kebede',
        user_id: chatId,
      });
      return;
    }

    if (btn.url) {
      onClose();
      return;
    }

    const commandMap: Record<string, string> = {
      cmd_register: '/register',
      cmd_login: '/login',
      cmd_forgot: '/forgot',
      cmd_profile: '/profile',
      cmd_wallet: '/wallet',
      cmd_invitations: '/invitations',
      cmd_help: '/help',
    };

    const textToSend = (btn.callback_data && commandMap[btn.callback_data]) || btn.text;
    sendMessageToBot(textToSend);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md h-[88vh] max-h-[640px] min-h-[380px] flex flex-col shadow-2xl overflow-hidden relative">
        {/* Header Bar */}
        <div className="bg-slate-950 px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white font-black shadow-lg shadow-sky-500/20">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-white text-sm flex items-center gap-1.5">
                <span>Yabede Bingo Official Bot</span>
                <span className="bg-sky-500/20 text-sky-400 text-[10px] px-1.5 py-0.2 rounded border border-sky-500/30">
                  @yabede_bingo_bot
                </span>
              </div>
              <div className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Registration Gateway • Active</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => {
                setMessages([]);
                sendMessageToBot('/start');
              }}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
              title="Restart Bot Session (/start)"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Command Shortcuts Bar */}
        <div className="bg-slate-900/90 px-3 py-2 border-b border-slate-800 flex items-center gap-1.5 overflow-x-auto text-[11px] font-bold scrollbar-none">
          <button
            onClick={() => sendMessageToBot('/start')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 whitespace-nowrap"
          >
            /start
          </button>
          <button
            onClick={() => sendMessageToBot('/register')}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap"
          >
            /register
          </button>
          <button
            onClick={() => sendMessageToBot('/login')}
            className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 whitespace-nowrap"
          >
            /login
          </button>
          <button
            onClick={() => sendMessageToBot('/profile')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 whitespace-nowrap"
          >
            /profile
          </button>
          <button
            onClick={() => sendMessageToBot('/wallet')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 whitespace-nowrap"
          >
            /wallet
          </button>
          <button
            onClick={() => sendMessageToBot('/help')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 whitespace-nowrap"
          >
            /help
          </button>
        </div>

        {/* Chat Messages Log */}
        <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-slate-950/50">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div
                className={`max-w-[88%] p-3.5 rounded-2xl text-xs leading-relaxed space-y-2 shadow-md ${
                  m.sender === 'user'
                    ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-semibold rounded-br-none'
                    : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                }`}
              >
                <div
                  dangerouslySetInnerHTML={{ __html: m.text.replace(/\n/g, '<br/>') }}
                />

                {/* Buttons attached to message */}
                {m.buttons && m.buttons.length > 0 && (
                  <div className="pt-2 flex flex-col gap-1.5">
                    {m.buttons.map((btn, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleButtonClick(btn)}
                        className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition flex items-center justify-center gap-2 shadow-sm ${
                          btn.request_contact
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-black hover:brightness-110 shadow-emerald-500/20'
                            : btn.url
                            ? 'bg-amber-500 text-slate-950 font-black hover:bg-amber-400'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                        }`}
                      >
                        {btn.request_contact && <Smartphone className="w-4 h-4" />}
                        <span>{btn.text}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-[10px] text-slate-500 px-1 mt-0.5">{m.time}</span>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2 text-slate-400 text-xs py-2 px-3 bg-slate-900/60 rounded-xl w-fit border border-slate-800 animate-pulse">
              <Bot className="w-4 h-4 text-sky-400 animate-spin" />
              <span>Bot is typing response...</span>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* Input Bar */}
        <form onSubmit={handleSendText} className="p-3 bg-slate-950 border-t border-slate-800 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              sessionState === 'AWAITING_CONTACT'
                ? 'Tap "📱 Share My Contact" button above...'
                : sessionState === 'AWAITING_PASSWORD'
                ? 'Type password (min 8 chars, 1 uppercase, 1 lowercase, 1 number, 1 special)...'
                : 'Type a message or command...'
            }
            className="flex-1 bg-slate-900 border border-slate-800 text-white rounded-xl px-3.5 py-2.5 text-xs focus:outline-none focus:border-amber-500/60 transition placeholder:text-slate-500"
          />
          <button
            type="submit"
            disabled={!inputText.trim() || loading}
            className="p-2.5 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition disabled:opacity-40 disabled:cursor-not-allowed font-bold"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
