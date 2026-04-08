"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface BookingRow {
  id: string;
  date: string;
  status: string;
  player_count: number | null;
  organizer_id: string | null;
  organizer_email: string | null;
}

interface OrganizerSummary {
  key: string;
  label: string;
  organizerId: string | null;
  organizerEmail: string | null;
  bookings: BookingRow[];
  totalPlayers: number;
  nextEventDate: string | null;
  statusCounts: Record<string, number>;
}

interface RegistrationToken {
  token: string;
  booking_id: string | null;
  created_at: string | null;
  expires_at: string | null;
}

function formatStatusSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "—";
  return entries.map(([s, n]) => `${n} ${s}`).join(", ");
}

function formatDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

export default function OrganizersPage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [organizers, setOrganizers] = useState<OrganizerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const fetchOrganizers = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      // Try selecting organizer_email; if column missing, fall back.
      let rows: BookingRow[] = [];
      const withEmail = await supabase
        .from("bookings")
        .select("id, date, status, player_count, organizer_id, organizer_email")
        .eq("course_id", courseId)
        .neq("status", "cancelled")
        .order("date", { ascending: true });

      if (withEmail.error) {
        const fallback = await supabase
          .from("bookings")
          .select("id, date, status, player_count, organizer_id")
          .eq("course_id", courseId)
          .neq("status", "cancelled")
          .order("date", { ascending: true });
        if (fallback.error) throw fallback.error;
        rows = (fallback.data ?? []).map((r) => ({
          ...(r as Omit<BookingRow, "organizer_email">),
          organizer_email: null,
        }));
      } else {
        rows = (withEmail.data ?? []) as BookingRow[];
      }

      const groups = new Map<string, OrganizerSummary>();
      for (const row of rows) {
        const key =
          row.organizer_email ?? row.organizer_id ?? "(no organizer)";
        let group = groups.get(key);
        if (!group) {
          group = {
            key,
            label:
              row.organizer_email ??
              row.organizer_id ??
              "(no organizer)",
            organizerId: row.organizer_id,
            organizerEmail: row.organizer_email,
            bookings: [],
            totalPlayers: 0,
            nextEventDate: null,
            statusCounts: {},
          };
          groups.set(key, group);
        }
        group.bookings.push(row);
        group.totalPlayers += row.player_count ?? 0;
        group.statusCounts[row.status] =
          (group.statusCounts[row.status] ?? 0) + 1;
        if (row.date >= today) {
          if (!group.nextEventDate || row.date < group.nextEventDate) {
            group.nextEventDate = row.date;
          }
        }
      }

      const result = Array.from(groups.values()).sort(
        (a, b) => b.bookings.length - a.bookings.length
      );
      setOrganizers(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load organizers"
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, supabase, today]);

  const fetchTokens = useCallback(async () => {
    if (!courseId) return;
    setTokensLoading(true);
    setTokensError(null);
    try {
      const { data, error: tokErr } = await supabase
        .from("registration_tokens")
        .select("token, booking_id, created_at, expires_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (tokErr) throw tokErr;
      setTokens((data ?? []) as RegistrationToken[]);
    } catch (err) {
      setTokensError(
        err instanceof Error ? err.message : "Failed to load tokens"
      );
    } finally {
      setTokensLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId) {
      fetchOrganizers();
      fetchTokens();
    }
  }, [authLoading, courseId, fetchOrganizers, fetchTokens]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!user) return null;

  const now = new Date();

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Organizers</h1>
          <p className="text-sm text-gray-600 mt-1">
            Tournament organizers with bookings at this course.
          </p>
        </div>

        <section className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : error ? (
            <div className="p-6">
              <div className="text-sm text-red-700 mb-3">{error}</div>
              <button
                type="button"
                onClick={fetchOrganizers}
                className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
              >
                Retry
              </button>
            </div>
          ) : organizers.length === 0 ? (
            <div className="p-12 text-center text-sm text-gray-500">
              No organizers yet.
            </div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Organizer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Bookings
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Players
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Next Event
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status Summary
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {organizers.map((org) => {
                  const isExpanded = expandedKey === org.key;
                  return (
                    <Fragment key={org.key}>
                      <tr
                        onClick={() =>
                          setExpandedKey(isExpanded ? null : org.key)
                        }
                        className="hover:bg-gray-50 cursor-pointer"
                      >
                        <td className="px-6 py-4 text-sm font-medium text-gray-900 break-all">
                          {org.label}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {org.bookings.length}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {org.totalPlayers}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatDate(org.nextEventDate)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatStatusSummary(org.statusCounts)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                              Bookings
                            </div>
                            <div className="space-y-1">
                              {org.bookings.map((b) => (
                                <div
                                  key={b.id}
                                  className="flex items-center gap-4 text-sm text-gray-700"
                                >
                                  <span className="font-mono text-xs text-gray-500">
                                    {b.id.slice(0, 8)}
                                  </span>
                                  <span>{formatDate(b.date)}</span>
                                  <span className="text-gray-500">
                                    {b.player_count ?? 0} players
                                  </span>
                                  <span className="px-2 py-0.5 rounded bg-gray-200 text-xs">
                                    {b.status}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Registration Tokens
          </h2>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {tokensLoading ? (
              <div className="p-8 flex items-center justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600" />
              </div>
            ) : tokensError ? (
              <div className="p-6">
                <div className="text-sm text-red-700 mb-3">{tokensError}</div>
                <button
                  type="button"
                  onClick={fetchTokens}
                  className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            ) : tokens.length === 0 ? (
              <div className="p-8 text-center text-sm text-gray-500">
                No registration tokens.
              </div>
            ) : (
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Token
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Booking
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expires
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {tokens.map((t) => {
                    const expired = t.expires_at
                      ? new Date(t.expires_at) < now
                      : false;
                    return (
                      <tr key={t.token}>
                        <td className="px-6 py-4 text-xs font-mono text-gray-700 break-all">
                          {t.booking_id ? (
                            <button
                              type="button"
                              onClick={() =>
                                window.open(
                                  `/portal/${t.booking_id}?token=${t.token}`,
                                  "_blank"
                                )
                              }
                              className="text-left text-blue-600 hover:text-blue-800 hover:underline break-all"
                              title="Open portal page in new tab"
                            >
                              {t.token}
                            </button>
                          ) : (
                            <span className="break-all">{t.token}</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-gray-500">
                          {t.booking_id ? t.booking_id.slice(0, 8) : "—"}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatDate(t.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatDate(t.expires_at)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {expired ? (
                            <span className="px-2 py-0.5 rounded bg-red-100 text-red-700 text-xs">
                              Expired
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700 text-xs">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {t.booking_id ? (
                            <button
                              type="button"
                              onClick={async () => {
                                const url = `${window.location.origin}/portal/${t.booking_id}?token=${t.token}`;
                                try {
                                  await navigator.clipboard.writeText(url);
                                  setCopiedToken(t.token);
                                  setTimeout(() => {
                                    setCopiedToken((prev) =>
                                      prev === t.token ? null : prev
                                    );
                                  }, 2000);
                                } catch {
                                  // ignore
                                }
                              }}
                              className="px-3 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
                            >
                              {copiedToken === t.token
                                ? "Copied!"
                                : "Copy Portal Link"}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
