import { useState, useRef, useEffect } from "react";
import type { User } from "firebase/auth";
import { Sparkles, X, SendHorizontal, Loader2, Calendar, Tag, FileText, Landmark } from "lucide-react";
import { queryAssistant } from "../services/api";

type Message = {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: any[];
};

type PendingAction = {
  tool: string;
  args: {
    amount: string;
    category: string;
    description: string;
    date: string;
    platform?: string;
  };
};

type AssistantPanelProps = {
  currentUser: User;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
};

const SUGGESTIONS = [
  "Show my recent expenses",
  "What is my Goa Trip balance?",
  "Give me a summary of my spending",
  "Log an expense of 15.00 for lunch today"
];

export function AssistantPanel({ currentUser, isOpen, onToggle, onClose }: AssistantPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Hi! I am your AI Finance Assistant. Ask me about your expenses, budgets, shared wallets, and balances, or log a new expense."
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen, isLoading]);

  const handleSend = async (textToSend: string, confirmedAction: PendingAction | null = null) => {
    if (!textToSend.trim() && !confirmedAction) return;

    let updatedMessages = [...messages];
    
    // Add user's message to chat history
    if (textToSend.trim()) {
      updatedMessages.push({ role: "user", content: textToSend });
      setMessages(updatedMessages);
    }
    
    setInput("");
    setIsLoading(true);
    setPendingAction(null);

    try {
      // Exclude system message or formatting details if sending to API
      const result = await queryAssistant(updatedMessages, confirmedAction, currentUser);
      
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.answer
        }
      ]);

      if (confirmedAction && confirmedAction.tool === "create_expense") {
        window.dispatchEvent(new CustomEvent("expense-added"));
      }

      if (result.pendingAction) {
        setPendingAction(result.pendingAction as PendingAction);
      }
    } catch (error: any) {
      let friendlyMessage = "Sorry, I am currently having trouble connecting to my AI service. Please try again in a moment!";
      const errMsg = String(error.message || "").toLowerCase();
      
      if (errMsg.includes("degraded") || errMsg.includes("invoked") || errMsg.includes("llm api error") || errMsg.includes("400") || errMsg.includes("500")) {
        friendlyMessage = "Sorry, my AI service is currently down or undergoing maintenance. Please try again in a short while!";
      } else if (errMsg.includes("network") || errMsg.includes("failed to fetch") || errMsg.includes("timeout") || errMsg.includes("network error")) {
        friendlyMessage = "Sorry, I had trouble connecting to the server. Please check your network connection and try again!";
      } else if (error.message && error.message.length < 100) {
        friendlyMessage = `Sorry, I ran into an error: ${error.message}`;
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: friendlyMessage
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;
    const actionToSend = pendingAction;
    setPendingAction(null);
    
    // Add the "Confirm" message and send with confirmation payload
    handleSend("Confirm", actionToSend);
  };

  const handleCancelAction = () => {
    setPendingAction(null);
    setMessages((prev) => [
      ...prev,
      {
        role: "assistant",
        content: "Action cancelled. Let me know if you need help with anything else!"
      }
    ]);
  };

  return (
    <>
      {/* Floating Action Button (FAB) - Desktop only (hidden on mobile) */}
      <button
        onClick={onToggle}
        className="hidden lg:flex fixed bottom-6 right-6 z-40 h-14 w-14 items-center justify-center rounded-full bg-primary text-white shadow-lg transition-transform duration-200 hover:scale-105 active:scale-95 cursor-pointer overflow-hidden border border-white/20"
        aria-label="Ask assistant"
      >
        {isOpen ? (
          <X className="h-6 w-6" />
        ) : (
          <img src="/ai-chatbot.jpg" alt="AI Chatbot" className="h-full w-full object-cover" />
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="fixed inset-0 z-50 md:inset-auto md:bottom-24 md:right-6 md:w-96 md:h-[580px] lg:bottom-24 lg:right-6 flex flex-col overflow-hidden rounded-none md:rounded-[28px] border-0 md:border border-white/60 bg-white md:bg-white/90 shadow-2xl md:shadow-[0_30px_80px_rgba(40,44,35,0.18)] md:backdrop-blur-2xl transition-all duration-300">
          
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 bg-white/50 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-full overflow-hidden shrink-0">
                <img src="/ai-chatbot.jpg" alt="AI Chatbot" className="h-full w-full object-cover" />
                <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-1 ring-white animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-ink">Finance Assistant</h3>
                <span className="text-[10px] text-muted font-medium">Topic-scoped AI</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-muted hover:bg-slate-100 active:scale-95 transition-transform"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.map((msg, idx) => {
              if (msg.role === "system" || msg.role === "tool") return null;

              const isUser = msg.role === "user";

              // Check if we should skip rendering the mock "Confirm" message
              if (isUser && msg.content === "Confirm") {
                return null;
              }

              return (
                <div
                  key={idx}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`p-3.5 max-w-[85%] text-[13.5px] leading-relaxed shadow-sm ${
                      isUser
                        ? "bg-primary text-white rounded-[20px_20px_4px_20px] font-medium"
                        : "bg-slate-100/90 text-ink border border-slate-200/30 rounded-[20px_20px_20px_4px]"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              );
            })}

            {/* Pending Confirmation Block */}
            {pendingAction && (
              <div className="mt-3 p-4 bg-slate-50/80 border border-slate-200/50 rounded-2xl space-y-3.5 shadow-sm animate-fade-in">
                <div className="text-[11px] font-bold uppercase tracking-wider text-muted flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Log Expense Confirmation
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs text-ink">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                    <span className="text-muted text-[10px] block mb-0.5 flex items-center gap-1"><Landmark className="h-3 w-3" /> Amount</span>
                    <span className="font-bold text-sm text-primary">${pendingAction.args.amount}</span>
                  </div>
                  
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                    <span className="text-muted text-[10px] block mb-0.5 flex items-center gap-1"><Tag className="h-3 w-3" /> Category</span>
                    <span className="font-bold">{pendingAction.args.category}</span>
                  </div>
                  
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 col-span-2 flex flex-col">
                    <span className="text-muted text-[10px] block mb-0.5 flex items-center gap-1"><FileText className="h-3 w-3" /> Description</span>
                    <span className="font-semibold">{pendingAction.args.description}</span>
                  </div>
                  
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                    <span className="text-muted text-[10px] block mb-0.5 flex items-center gap-1"><Calendar className="h-3 w-3" /> Date</span>
                    <span className="font-semibold">{pendingAction.args.date}</span>
                  </div>
                  
                  {pendingAction.args.platform && (
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-muted text-[10px] block mb-0.5">Platform</span>
                      <span className="font-semibold">{pendingAction.args.platform}</span>
                    </div>
                  )}
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    onClick={handleConfirmAction}
                    disabled={isLoading}
                    className="flex-1 bg-primary text-white font-bold py-2.5 px-4 rounded-xl text-xs hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Confirm Log
                  </button>
                  <button
                    onClick={handleCancelAction}
                    disabled={isLoading}
                    className="flex-1 border border-slate-200 bg-white text-secondary font-bold py-2.5 px-4 rounded-xl text-xs hover:bg-slate-50 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Loading Indicator */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 text-muted p-3.5 rounded-[20px_20px_20px_4px] text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span>Assistant is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Suggestions (if no pending actions) */}
          {!pendingAction && !isLoading && (
            <div className="px-5 py-2 overflow-x-auto flex gap-2 no-scrollbar bg-slate-50/50">
              {SUGGESTIONS.map((s, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(s)}
                  className="flex-none whitespace-nowrap bg-white border border-slate-200/60 rounded-full px-3.5 py-1.5 text-xs font-semibold text-secondary hover:border-primary hover:text-primary transition-all cursor-pointer"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="border-t border-slate-100 bg-white px-4 py-3 flex items-center gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading || !!pendingAction}
              placeholder={pendingAction ? "Please confirm or cancel above..." : "Ask a finance question..."}
              className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 text-sm focus:outline-none focus:border-primary disabled:bg-slate-50 disabled:text-muted"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim() || !!pendingAction}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-primary text-white hover:opacity-95 active:scale-95 disabled:bg-slate-100 disabled:text-slate-400 transition-all cursor-pointer"
            >
              <SendHorizontal className="h-4 w-4" />
            </button>
          </form>

        </div>
      )}
    </>
  );
}
