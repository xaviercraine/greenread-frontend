"use client";

import { useEffect, useRef, useState, FormEvent, ReactNode } from "react";
import { usePathname } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { callEdgeFunction } from "@/lib/edgeFunction";
import { useAuth } from "@/components/AuthProvider";

type StructuredDataItem = {
  type: string;
  data: Record<string, unknown>;
};

type Message = {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
  structured_data?: StructuredDataItem[];
};

const ACCENT = "#2D6A4F";

const SESSION_KEY = "greenread_concierge_session";
const MESSAGES_KEY = "greenread_concierge_messages";
const CONVERSATION_KEY = "greenread_concierge_conversation_id";
const OPEN_KEY = "greenread_concierge_open";

function Pill({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-block rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        borderColor: ACCENT,
        color: ACCENT,
        backgroundColor: "white",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.backgroundColor = ACCENT;
          e.currentTarget.style.color = "white";
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "white";
        e.currentTarget.style.color = ACCENT;
      }}
    >
      {label}
    </button>
  );
}

function StructuredCard({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-xl border bg-white p-3 text-xs"
      style={{ borderColor: `${ACCENT}40` }}
    >
      {children}
    </div>
  );
}

function CollapsibleJson({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <StructuredCard>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="font-semibold"
        style={{ color: ACCENT }}
      >
        {open ? "▼" : "▶"} Raw data
      </button>
      {open && (
        <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-[10px] text-gray-700">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </StructuredCard>
  );
}

function StructuredDataRenderer({
  items,
  onSend,
  disabled,
}: {
  items: StructuredDataItem[];
  onSend: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-2 space-y-2">
      {items.map((item, idx) => {
        const { type, data } = item;

        if (type === "dates") {
          const dates =
            (data?.dates as
              | Array<
                  | string
                  | {
                      available_date: string;
                      date_day_type?: string;
                    }
                >
              | undefined) ?? [];
          return (
            <StructuredCard key={idx}>
              <div className="mb-2 font-semibold" style={{ color: ACCENT }}>
                📅 {dates.length} available date{dates.length === 1 ? "" : "s"}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {dates.map((d) => {
                  const dateStr = typeof d === "string" ? d : d.available_date;
                  const dayType = typeof d === "string" ? undefined : d.date_day_type;
                  const label = (() => {
                    const parsed = new Date(dateStr);
                    if (Number.isNaN(parsed.getTime())) return dateStr;
                    return parsed.toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                  })();
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSend(`I'd like ${dateStr}`)}
                      className="rounded-lg border px-3 py-1.5 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ borderColor: ACCENT, color: ACCENT, backgroundColor: "white" }}
                    >
                      <div className="text-xs font-medium">{label}</div>
                      {dayType && (
                        <div className="text-[10px] opacity-70">{dayType}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </StructuredCard>
          );
        }

        if (type === "formats") {
          const formats =
            (data?.formats as Array<{
              name: string;
              min_players?: number;
              max_players?: number;
              duration_hours?: number;
            }>) ?? [];
          return (
            <StructuredCard key={idx}>
              <div className="mb-2 font-semibold" style={{ color: ACCENT }}>
                ⛳ Formats
              </div>
              <div className="space-y-1.5">
                {formats.map((f) => (
                  <button
                    key={f.name}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSend(`I'll go with ${f.name}`)}
                    className="block w-full rounded-lg border bg-white p-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: `${ACCENT}40` }}
                  >
                    <div className="font-medium" style={{ color: ACCENT }}>
                      {f.name}
                    </div>
                    <div className="text-[10px] text-gray-600">
                      {f.min_players ?? "?"}–{f.max_players ?? "?"} players ·{" "}
                      {f.duration_hours ?? "?"}h
                    </div>
                  </button>
                ))}
              </div>
            </StructuredCard>
          );
        }

        if (type === "fb_options") {
          const fb =
            (data?.fb_packages as Array<{
              name: string;
              price_per_person?: number;
            }>) ?? [];
          const bar =
            (data?.bar_packages as Array<{
              name: string;
              price_per_person?: number;
            }>) ?? [];
          const playerCount = (data?.player_count as number | undefined) ?? 0;
          const renderPkg = (
            p: { name: string; price_per_person?: number },
            key: string
          ) => (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() =>
                onSend(`I'd like ${p.name} for ${playerCount} people`)
              }
              className="flex w-full items-center justify-between rounded-lg border bg-white p-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ borderColor: `${ACCENT}40` }}
            >
              <span className="font-medium" style={{ color: ACCENT }}>
                {p.name}
              </span>
              <span className="text-[10px] text-gray-600">
                ${p.price_per_person ?? "?"}/pp
              </span>
            </button>
          );
          return (
            <StructuredCard key={idx}>
              <div className="mb-2 font-semibold" style={{ color: ACCENT }}>
                🍽️ Food & Beverage Options
              </div>
              {fb.length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                    Food
                  </div>
                  <div className="space-y-1.5">
                    {fb.map((p, i) => renderPkg(p, `fb-${i}`))}
                  </div>
                </div>
              )}
              {bar.length > 0 && (
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">
                    Bar
                  </div>
                  <div className="space-y-1.5">
                    {bar.map((p, i) => renderPkg(p, `bar-${i}`))}
                  </div>
                </div>
              )}
            </StructuredCard>
          );
        }

        if (type === "addons") {
          const addons =
            (data?.addons as Array<{ name: string; price?: number }>) ?? [];
          return (
            <StructuredCard key={idx}>
              <div className="mb-2 font-semibold" style={{ color: ACCENT }}>
                ➕ Add-ons
              </div>
              <div className="space-y-1.5">
                {addons.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    disabled={disabled}
                    onClick={() => onSend(`Add ${a.name}`)}
                    className="flex w-full items-center justify-between rounded-lg border bg-white p-2 text-left transition-colors hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ borderColor: `${ACCENT}40` }}
                  >
                    <span className="font-medium" style={{ color: ACCENT }}>
                      {a.name}
                    </span>
                    <span className="text-[10px] text-gray-600">
                      ${a.price ?? "?"}
                    </span>
                  </button>
                ))}
              </div>
            </StructuredCard>
          );
        }

        if (type === "pricing") {
          const total = data?.total as number | undefined;
          const draft = data?.draft as
            | { id?: string | number; [k: string]: unknown }
            | undefined;
          return (
            <StructuredCard key={idx}>
              <div
                className="flex items-center justify-between font-semibold"
                style={{ color: ACCENT }}
              >
                <span>💰 Total</span>
                <span className="text-base">${total ?? "?"}</span>
              </div>
              {draft && (
                <div
                  className="mt-2 rounded-lg border p-2"
                  style={{
                    borderColor: ACCENT,
                    backgroundColor: `${ACCENT}10`,
                  }}
                >
                  <div className="font-semibold" style={{ color: ACCENT }}>
                    Draft Created! ID: {String(draft.id ?? "—")}
                  </div>
                  <pre className="mt-1 overflow-x-auto text-[10px] text-gray-700">
                    {JSON.stringify(draft, null, 2)}
                  </pre>
                </div>
              )}
            </StructuredCard>
          );
        }

        return <CollapsibleJson key={idx} data={item} />;
      })}
    </div>
  );
}

export default function ChatPanel() {
  const pathname = usePathname();
  const { user, courseId } = useAuth();

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
      const storedOpen = localStorage.getItem(OPEN_KEY);
      if (storedSession) setSessionToken(storedSession);
      if (storedConv) setConversationId(storedConv);
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages);
        if (Array.isArray(parsed)) setMessages(parsed);
      }
      if (storedOpen === "true") setOpen(true);
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

  // Persist open state
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(OPEN_KEY, open ? "true" : "false");
    } catch {
      // ignore
    }
  }, [open, hydrated]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  if (!user) return null;
  if (pathname?.startsWith("/book/new")) return null;

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

      const structured = Array.isArray(result.structured_data)
        ? (result.structured_data as StructuredDataItem[])
        : undefined;

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.response ?? "",
          structured_data: structured,
        },
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

  const handleQuickSend = async (text: string) => {
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
        className="fixed bottom-6 right-6 z-[9999] h-14 w-14 rounded-full bg-green-600 text-white shadow-lg hover:bg-green-700 hover:shadow-xl transition-all flex items-center justify-center text-2xl"
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
        className={`fixed top-0 right-0 z-[9999] h-screen w-[400px] bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
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
                  {msg.structured_data && msg.structured_data.length > 0 && (
                    <StructuredDataRenderer
                      items={msg.structured_data}
                      onSend={handleQuickSend}
                      disabled={loading}
                    />
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
