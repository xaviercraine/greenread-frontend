"use client";

import { useEffect, useRef, useState, FormEvent } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { callEdgeFunction } from "@/lib/edgeFunction";
import { useAuth } from "@/components/AuthProvider";

type Message = {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
};

const SESSION_KEY = "greenread_concierge_session";
const MESSAGES_KEY = "greenread_concierge_messages";
const CONVERSATION_KEY = "greenread_concierge_conversation_id";

export default function ChatPanel() {
  const pathname = usePathname();
  const { courseId } = useAuth();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [, setConversationId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Hydrate from localStorage
  useEffect(() => {
    try {
      const storedSession = localStorage.getItem(SESSION_KEY);
      const storedMessages = localStorage.getItem(MESSAGES_KEY);
      const storedConv = localStorage.getItem(CONVERSATION_KEY);
      if (storedSession) setSessionToken(storedSession);
      if (storedConv) setConversationId(storedConv);
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
    } catch {
      // ignore
    }
    setHydrated(true);
  }, []);

  // Persist messages
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, hydrated]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  const isHidden = pathname?.startsWith("/book/new");
  if (isHidden) return null;

  const sendMessage = async (text: string) => {
    setLoading(true);
    try {
      const result = await callEdgeFunction("concierge", {
        course_id: courseId,
        session_token: sessionToken,
        message: text,
      });

      const newToken = result.session_token ?? null;
      const newConvId = result.conversation_id ?? null;
      if (newToken) {
        setSessionToken(newToken);
        try {
          localStorage.setItem(SESSION_KEY, newToken);
        } catch {}
      }
      if (newConvId) {
        setConversationId(newConvId);
        try {
          localStorage.setItem(CONVERSATION_KEY, newConvId);
        } catch {}
      }
      if (result.escalated) setEscalated(true);

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: result.response ?? "" },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again.",
          error: true,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    await sendMessage(text);
  };

  const handleRetry = async (index: number) => {
    // Find the previous user message
    let userText: string | null = null;
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userText = messages[i].content;
        break;
      }
    }
    if (!userText) return;
    // Remove the error message
    setMessages((prev) => prev.filter((_, i) => i !== index));
    await sendMessage(userText);
  };

  const handleNewChat = () => {
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(MESSAGES_KEY);
      localStorage.removeItem(CONVERSATION_KEY);
    } catch {}
    setMessages([]);
    setSessionToken(null);
    setConversationId(null);
    setEscalated(false);
  };

  return (
    <>
      {/* Floating Button */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Open concierge chat"
        className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 hover:shadow-xl transition-all flex items-center justify-center text-2xl"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Panel */}
      <div
        className={`fixed top-0 right-0 z-50 h-screen w-[400px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-green-600 text-white">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">Greenread Concierge</h2>
            {escalated && (
              <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium">
                Escalated
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleNewChat}
              className="rounded bg-green-700 hover:bg-green-800 px-2 py-1 text-xs"
            >
              New Chat
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="text-2xl leading-none hover:opacity-75"
            >
              ×
            </button>
          </div>
        </div>

        {/* Messages */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-gray-50"
        >
          {messages.length === 0 && !loading && (
            <p className="text-sm text-gray-500 text-center mt-8">
              Ask the concierge anything about your course operations.
            </p>
          )}
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-green-600 text-white px-4 py-2 text-sm whitespace-pre-wrap break-words">
                    {msg.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex justify-start">
                <div
                  className={`max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-2 text-sm shadow-sm break-words ${
                    msg.error
                      ? "bg-red-50 text-red-800 border border-red-200"
                      : "bg-white text-gray-800 border border-gray-200"
                  }`}
                >
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.error && (
                    <button
                      type="button"
                      onClick={() => handleRetry(i)}
                      className="mt-2 rounded bg-red-600 hover:bg-red-700 text-white px-2 py-1 text-xs"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm bg-white border border-gray-200 px-4 py-3 shadow-sm">
                <div className="flex gap-1 items-center">
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 rounded-full bg-gray-400 animate-bounce" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <form
          onSubmit={handleSubmit}
          className="border-t border-gray-200 p-3 bg-white flex gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-4 py-2 text-sm font-medium"
          >
            Send
          </button>
        </form>
      </div>
    </>
  );
}
