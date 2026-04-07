"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Message = {
  role: "user" | "assistant";
  content: string;
  ts?: string;
};

type Conversation = {
  id: string;
  created_at: string;
  messages: Message[] | null;
  status: string;
};

interface EscalatedConversationsProps {
  courseId: string | null;
  onChange?: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso?: string): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export default function EscalatedConversations({
  courseId,
  onChange,
}: EscalatedConversationsProps) {
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const fetchConversations = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("conversations")
        .select("id, created_at, messages, status")
        .eq("course_id", courseId)
        .eq("status", "escalated")
        .order("created_at", { ascending: false });
      if (err) throw err;
      setConversations((data ?? []) as Conversation[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load conversations");
    } finally {
      setLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const markResolved = async (conversationId: string) => {
    setResolvingId(conversationId);
    try {
      const { error: err } = await supabase
        .from("conversations")
        .update({ status: "completed" })
        .eq("id", conversationId);
      if (err) throw err;
      setConversations((prev) => prev.filter((c) => c.id !== conversationId));
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(conversationId);
        return next;
      });
      onChange?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to mark resolved");
    } finally {
      setResolvingId(null);
    }
  };

  return (
    <section className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Escalated Conversations
      </h2>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
        </div>
      ) : error ? (
        <div className="text-sm text-red-600">
          {error}{" "}
          <button
            onClick={fetchConversations}
            className="underline hover:text-red-800"
          >
            Retry
          </button>
        </div>
      ) : conversations.length === 0 ? (
        <p className="text-sm text-gray-500">No escalated conversations.</p>
      ) : (
        <ul className="space-y-3">
          {conversations.map((conv) => {
            const messages = Array.isArray(conv.messages) ? conv.messages : [];
            const messageCount = messages.length;
            const lastUserMsg = [...messages]
              .reverse()
              .find((m) => m.role === "user");
            const preview = lastUserMsg
              ? lastUserMsg.content.slice(0, 100) +
                (lastUserMsg.content.length > 100 ? "…" : "")
              : "(no user messages)";
            const isExpanded = expanded.has(conv.id);

            return (
              <li
                key={conv.id}
                className="border border-gray-200 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleExpanded(conv.id)}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 focus:outline-none focus:bg-gray-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-3 text-xs text-gray-500 mb-1">
                        <span className="font-mono">
                          {conv.id.slice(0, 8)}
                        </span>
                        <span>{formatDate(conv.created_at)}</span>
                        <span>
                          {messageCount}{" "}
                          {messageCount === 1 ? "message" : "messages"}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700 truncate">
                        {preview}
                      </p>
                    </div>
                    <span className="text-gray-400 text-sm shrink-0">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-gray-200 bg-gray-50 px-4 py-4 space-y-3">
                    {messages.length === 0 ? (
                      <p className="text-sm text-gray-500 italic">
                        No messages.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {messages.map((msg, idx) => {
                          const time = formatTime(msg.ts);
                          const isUser = msg.role === "user";
                          return (
                            <div
                              key={idx}
                              className={`flex ${
                                isUser ? "justify-end" : "justify-start"
                              }`}
                            >
                              <div
                                className={`max-w-[75%] rounded-lg px-3 py-2 ${
                                  isUser
                                    ? "bg-green-100 text-green-900"
                                    : "bg-gray-200 text-gray-800"
                                }`}
                              >
                                <p className="text-sm whitespace-pre-wrap break-words">
                                  {msg.content}
                                </p>
                                {time && (
                                  <p
                                    className={`text-[10px] mt-1 ${
                                      isUser
                                        ? "text-green-700"
                                        : "text-gray-500"
                                    }`}
                                  >
                                    {time}
                                  </p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="flex justify-end pt-2 border-t border-gray-200">
                      <button
                        onClick={() => markResolved(conv.id)}
                        disabled={resolvingId === conv.id}
                        className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {resolvingId === conv.id
                          ? "Resolving…"
                          : "Mark Resolved"}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
