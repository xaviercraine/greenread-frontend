"use client";

import { useEffect, useRef, useState, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { callEdgeFunction } from "@/lib/edgeFunction";
import {
  useBookingWindow,
  bookingWindowStatus,
  bookingWindowTooltip,
  type BookingWindow,
} from "@/lib/useBookingWindow";

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

// Per-course storage keys so different courses don't share session state.
function storageKeys(courseId: string) {
  return {
    SESSION_KEY: `greenread_public_session_${courseId}`,
    MESSAGES_KEY: `greenread_public_messages_${courseId}`,
    CONVERSATION_KEY: `greenread_public_conversation_${courseId}`,
  };
}

function StructuredCard({ children }: { children: ReactNode }) {
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
  onNavigate,
  bookingWindow,
}: {
  items: StructuredDataItem[];
  onSend: (text: string) => void;
  disabled?: boolean;
  onNavigate: (path: string) => void;
  bookingWindow: BookingWindow;
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
                  | { available_date: string; date_day_type?: string }
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
                  const windowStatus = bookingWindowStatus(dateStr, bookingWindow);
                  const isOutsideWindow = windowStatus !== "ok";
                  const windowTooltip = bookingWindowTooltip(windowStatus, bookingWindow);
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      disabled={disabled || isOutsideWindow}
                      title={windowTooltip}
                      onClick={() => onSend(`I'd like ${dateStr}`)}
                      className={`rounded-lg border px-3 py-1.5 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed ${
                        isOutsideWindow ? "opacity-50" : "disabled:opacity-50"
                      }`}
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
            | {
                id?: string | number;
                date?: string;
                format?: string;
                [k: string]: unknown;
              }
            | undefined;
          const draftId = draft?.id ? String(draft.id) : null;
          return (
            <StructuredCard key={idx}>
              <div
                className="flex items-center justify-between font-semibold"
                style={{ color: ACCENT }}
              >
                <span>💰 Total</span>
                <span className="text-base">${total ?? "?"}</span>
              </div>
              {draft && draftId && (
                <>
                  <div
                    className="mt-2 rounded-lg border p-2"
                    style={{
                      borderColor: ACCENT,
                      backgroundColor: `${ACCENT}10`,
                    }}
                  >
                    <div className="font-semibold" style={{ color: ACCENT }}>
                      ✅ Draft Created — Booking ID: {draftId.slice(0, 8)}
                    </div>
                    {(draft.date || draft.format) && (
                      <div className="mt-1 text-[11px] text-gray-700">
                        {draft.date && <span>{String(draft.date)}</span>}
                        {draft.date && draft.format && <span> · </span>}
                        {draft.format && <span>{String(draft.format)}</span>}
                      </div>
                    )}
                  </div>
                  <div className="mt-3">
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onNavigate(`/checkout/${draftId}`)}
                      className="w-full rounded-lg bg-green-600 hover:bg-green-700 text-white px-4 py-3 text-sm font-semibold shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Proceed to Payment →
                    </button>
                  </div>
                </>
              )}
            </StructuredCard>
          );
        }

        return <CollapsibleJson key={idx} data={item} />;
      })}
    </div>
  );
}

export default function PublicBookingChat({
  courseId,
  courseName,
}: {
  courseId: string;
  courseName: string;
}) {
  const router = useRouter();
  const keys = storageKeys(courseId);
  const bookingWindow = useBookingWindow(courseId);

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
      const storedSession = localStorage.getItem(keys.SESSION_KEY);
      const storedMessages = localStorage.getItem(keys.MESSAGES_KEY);
      const storedConv = localStorage.getItem(keys.CONVERSATION_KEY);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Persist messages
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(keys.MESSAGES_KEY, JSON.stringify(messages));
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, hydrated]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

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
          localStorage.setItem(keys.SESSION_KEY, newToken);
        } catch {}
      }
      if (newConvId) {
        setConversationId(newConvId);
        try {
          localStorage.setItem(keys.CONVERSATION_KEY, newConvId);
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
    let userText: string | null = null;
    for (let i = index - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        userText = messages[i].content;
        break;
      }
    }
    if (!userText) return;
    setMessages((prev) => prev.filter((_, i) => i !== index));
    await sendMessage(userText);
  };

  const handleNewChat = () => {
    try {
      localStorage.removeItem(keys.SESSION_KEY);
      localStorage.removeItem(keys.MESSAGES_KEY);
      localStorage.removeItem(keys.CONVERSATION_KEY);
    } catch {}
    setMessages([]);
    setSessionToken(null);
    setConversationId(null);
    setEscalated(false);
  };

  return (
    <div className="flex h-screen w-full flex-col bg-gray-50">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-gray-200 bg-green-600 px-6 py-4 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">{courseName}</h1>
          {escalated && (
            <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-medium">
              Escalated
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleNewChat}
          className="rounded bg-green-700 px-3 py-1.5 text-xs font-medium hover:bg-green-800"
        >
          New Chat
        </button>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-6"
      >
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {messages.length === 0 && !loading && (
            <div className="mt-10 text-center">
              <p className="text-base text-gray-700">
                Welcome! Let&apos;s plan your event at {courseName}.
              </p>
              <p className="mt-2 text-sm text-gray-500">
                Tell me what you have in mind — group size, preferred dates, format — and I&apos;ll put together a quote.
              </p>
            </div>
          )}
          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-sm bg-green-600 px-4 py-2 text-sm text-white">
                    {msg.content}
                  </div>
                </div>
              );
            }
            return (
              <div key={i} className="flex justify-start">
                <div
                  className={`max-w-[85%] break-words rounded-2xl rounded-bl-sm px-4 py-2 text-sm shadow-sm ${
                    msg.error
                      ? "border border-red-200 bg-red-50 text-red-800"
                      : "border border-gray-200 bg-white text-gray-800"
                  }`}
                >
                  <div className="prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                  {msg.error && (
                    <button
                      type="button"
                      onClick={() => handleRetry(i)}
                      className="mt-2 rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                    >
                      Retry
                    </button>
                  )}
                  {msg.structured_data && msg.structured_data.length > 0 && (
                    <StructuredDataRenderer
                      items={msg.structured_data}
                      onSend={handleQuickSend}
                      disabled={loading}
                      onNavigate={(path) => router.push(path)}
                      bookingWindow={bookingWindow}
                    />
                  )}
                </div>
              </div>
            );
          })}
          {loading && (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-bl-sm border border-gray-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.3s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400 [animation-delay:-0.15s]" />
                  <span className="h-2 w-2 animate-bounce rounded-full bg-gray-400" />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-gray-200 bg-white px-4 py-3"
      >
        <div className="mx-auto flex max-w-3xl gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            disabled={loading}
            className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            Send
          </button>
        </div>
        <div className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-gray-400">
          Powered by Greenread
        </div>
      </form>
    </div>
  );
}
