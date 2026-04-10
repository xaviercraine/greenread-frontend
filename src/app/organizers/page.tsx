"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface BookingRow {
  id: string;
  date: string;
  status: string;
  player_count: number | null;
  organizer_id: string | null;
  organizer_email: string | null;
  format_id: string | null;
  format_name: string | null;
  total_price: number | null;
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
  lastFormat: string;
}

interface RegistrationToken {
  token: string;
  booking_id: string | null;
  created_at: string | null;
  expires_at: string | null;
}

interface TokenContext {
  formatName: string | null;
  date: string | null;
  organizerEmail: string | null;
  playerCount: number | null;
  registeredCount: number;
}

const WALK_IN_LABEL = "(Walk-in / Phone)";

function formatStatusSummary(counts: Record<string, number>): string {
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return "—";
  return entries.map(([s, n]) => `${n} ${s}`).join(", ");
}

function formatShortDate(d: string | null): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString();
  } catch {
    return d;
  }
}

function formatLongDate(d: string | null): string {
  if (!d) return "—";
  try {
    // Parse YYYY-MM-DD as local date to avoid timezone shifts
    const parts = d.split("-");
    const dt =
      parts.length === 3
        ? new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
        : new Date(d);
    return dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

function formatMoney(n: number | null): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
    case "completed":
      return "bg-green-100 text-green-800";
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "deposit_paid":
    case "balance_paid":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function OrganizersPage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [organizers, setOrganizers] = useState<OrganizerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [tokens, setTokens] = useState<RegistrationToken[]>([]);
  const [tokenContexts, setTokenContexts] = useState<Map<string, TokenContext>>(
    new Map()
  );
  const [tokensLoading, setTokensLoading] = useState(true);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const today = useMemo(() => new Date().toISOString().split("T")[0], []);

  const fetchOrganizers = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      // Fetch bookings with format name joined
      type BookingFetchRow = {
        id: string;
        date: string;
        status: string;
        player_count: number | null;
        organizer_id: string | null;
        organizer_email: string | null;
        format_id: string | null;
        tournament_formats: { name: string } | null;
      };
      let rows: BookingFetchRow[] = [];

      const withEmail = await supabase
        .from("bookings")
        .select(
          "id, date, status, player_count, organizer_id, organizer_email, format_id, tournament_formats(name)"
        )
        .eq("course_id", courseId)
        .neq("status", "cancelled")
        .order("date", { ascending: true });

      if (withEmail.error) {
        const fallback = await supabase
          .from("bookings")
          .select(
            "id, date, status, player_count, organizer_id, format_id, tournament_formats(name)"
          )
          .eq("course_id", courseId)
          .neq("status", "cancelled")
          .order("date", { ascending: true });
        if (fallback.error) throw fallback.error;
        rows = (fallback.data ?? []).map((r) => ({
          ...(r as unknown as Omit<BookingFetchRow, "organizer_email">),
          organizer_email: null,
        }));
      } else {
        rows = (withEmail.data ?? []) as unknown as BookingFetchRow[];
      }

      // Fetch latest pricing snapshot per booking
      const priceMap = new Map<string, number>();
      if (rows.length > 0) {
        const { data: snapshots } = await supabase
          .from("pricing_snapshots")
          .select("booking_id, snapshot, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false });
        if (snapshots) {
          for (const s of snapshots as Array<{
            booking_id: string;
            snapshot: { total?: number } | null;
          }>) {
            if (priceMap.has(s.booking_id)) continue;
            const total = s.snapshot?.total;
            if (typeof total === "number") priceMap.set(s.booking_id, total);
          }
        }
      }

      const bookingRows: BookingRow[] = rows.map((r) => ({
        id: r.id,
        date: r.date,
        status: r.status,
        player_count: r.player_count,
        organizer_id: r.organizer_id,
        organizer_email: r.organizer_email,
        format_id: r.format_id,
        format_name: r.tournament_formats?.name ?? null,
        total_price: priceMap.get(r.id) ?? null,
      }));

      const groups = new Map<string, OrganizerSummary>();
      for (const row of bookingRows) {
        // Group by email when present; otherwise group all email-less
        // bookings under a single walk-in bucket so we never key on UUIDs.
        const hasEmail = !!row.organizer_email;
        const key = hasEmail ? `email:${row.organizer_email}` : "walkin";
        const label = hasEmail ? row.organizer_email! : WALK_IN_LABEL;
        let group = groups.get(key);
        if (!group) {
          group = {
            key,
            label,
            organizerId: row.organizer_id,
            organizerEmail: row.organizer_email,
            bookings: [],
            totalPlayers: 0,
            nextEventDate: null,
            statusCounts: {},
            lastFormat: "—",
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

      // Compute most-common format per group
      for (const group of groups.values()) {
        const counts = new Map<string, number>();
        for (const b of group.bookings) {
          if (!b.format_name) continue;
          counts.set(b.format_name, (counts.get(b.format_name) ?? 0) + 1);
        }
        const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
        group.lastFormat = top ? top[0] : "—";
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
      const tokenRows = (data ?? []) as RegistrationToken[];
      setTokens(tokenRows);

      // Hydrate context: format name, date, organizer email, registered count
      const bookingIds = Array.from(
        new Set(
          tokenRows
            .map((t) => t.booking_id)
            .filter((id): id is string => !!id)
        )
      );
      const ctx = new Map<string, TokenContext>();
      if (bookingIds.length > 0) {
        const [bookingsRes, partsRes] = await Promise.all([
          supabase
            .from("bookings")
            .select(
              "id, date, player_count, organizer_email, tournament_formats(name)"
            )
            .in("id", bookingIds),
          supabase
            .from("participants")
            .select("booking_id")
            .in("booking_id", bookingIds),
        ]);

        const partCounts = new Map<string, number>();
        if (partsRes.data) {
          for (const p of partsRes.data as Array<{ booking_id: string }>) {
            partCounts.set(
              p.booking_id,
              (partCounts.get(p.booking_id) ?? 0) + 1
            );
          }
        }

        if (bookingsRes.data) {
          for (const b of bookingsRes.data as unknown as Array<{
            id: string;
            date: string | null;
            player_count: number | null;
            organizer_email: string | null;
            tournament_formats: { name: string } | null;
          }>) {
            ctx.set(b.id, {
              formatName: b.tournament_formats?.name ?? null,
              date: b.date,
              organizerEmail: b.organizer_email,
              playerCount: b.player_count,
              registeredCount: partCounts.get(b.id) ?? 0,
            });
          }
        }
      }
      setTokenContexts(ctx);
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
            <div className="overflow-x-auto">
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
                    Last Format
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
                          {formatShortDate(org.nextEventDate)}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {org.lastFormat}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatStatusSummary(org.statusCounts)}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                              Bookings
                            </div>
                            <div className="space-y-2">
                              {org.bookings.map((b) => (
                                <div
                                  key={b.id}
                                  className="flex flex-wrap items-center gap-3 text-sm text-gray-700 bg-white rounded-md px-3 py-2 border border-gray-200"
                                >
                                  <span className="font-medium text-gray-900 min-w-[160px]">
                                    {formatLongDate(b.date)}
                                  </span>
                                  <span className="text-gray-700">
                                    {b.format_name ?? "—"}
                                  </span>
                                  <span className="text-gray-500">
                                    {b.player_count ?? 0} players
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(
                                      b.status
                                    )}`}
                                  >
                                    {b.status}
                                  </span>
                                  <span className="text-gray-700 font-medium">
                                    {formatMoney(b.total_price)}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      router.push(`/?booking=${b.id}`);
                                    }}
                                    className="ml-auto px-3 py-1 rounded-md border border-green-600 text-green-700 hover:bg-green-50 text-xs font-medium"
                                  >
                                    View Booking
                                  </button>
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
            </div>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">
            Participant Registration Links
          </h2>
          <p className="text-sm text-gray-600 mt-1 mb-3">
            Share these links with organizers so their players can register
          </p>
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
                No registration links.
              </div>
            ) : (
              <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Booking
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Organizer
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Registered
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created
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
                    const ctx = t.booking_id
                      ? tokenContexts.get(t.booking_id) ?? null
                      : null;
                    const formatLabel = ctx?.formatName ?? "Booking";
                    const dateLabel = ctx?.date
                      ? formatLongDate(ctx.date).replace(/^[A-Za-z]+, /, "")
                      : "—";
                    const bookingLabel = `${formatLabel} — ${dateLabel}`;
                    const organizerLabel =
                      ctx?.organizerEmail ?? "(Walk-in)";
                    const registeredLabel = ctx
                      ? `${ctx.registeredCount} of ${ctx.playerCount ?? 0}`
                      : "—";
                    return (
                      <tr key={t.token}>
                        <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                          {bookingLabel}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700 break-all">
                          {organizerLabel}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {registeredLabel}
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
                        <td className="px-6 py-4 text-sm text-gray-700">
                          {formatShortDate(t.created_at)}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          {t.booking_id ? (
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  const url = `${window.location.origin}/register/${t.booking_id}?token=${t.token}`;
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
                                className="px-3 py-1 rounded-md border border-green-600 text-green-700 hover:bg-green-50 text-xs font-medium"
                              >
                                {copiedToken === t.token ? "Copied!" : "Copy Link"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  window.location.href = `/register/${t.booking_id}?token=${t.token}`;
                                }}
                                className="px-3 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium"
                              >
                                Open Registration
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
