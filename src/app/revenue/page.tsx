"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import NavBar from "@/components/NavBar";

interface RevenueTarget {
  id: string;
  course_id: string;
  period_start: string;
  period_end: string;
  target_amount: number;
}

interface BookingRow {
  id: string;
  date: string;
  status: string;
  player_count: number;
  override_price: number | null;
}

interface PricingSnapshotRow {
  booking_id: string;
  snapshot: { total?: number } | null;
  created_at: string;
}

interface MonthBucket {
  key: string; // YYYY-MM
  label: string;
  target: number;
  actual: number;
  bookingCount: number;
  periodStart: string;
}

interface OverriddenBooking {
  id: string;
  date: string;
  override_price: number;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function monthKeyFromDate(dateString: string): string {
  // dateString is YYYY-MM-DD
  return dateString.slice(0, 7);
}

function monthKeyFromPeriodStart(periodStart: string): string {
  return periodStart.slice(0, 7);
}

function monthLabel(key: string): string {
  const [yearStr, monthStr] = key.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  return `${MONTH_NAMES[month]} ${year}`;
}

function formatCurrency(amount: number): string {
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatDiff(diff: number): string {
  const sign = diff >= 0 ? "+" : "-";
  return `${sign}${formatCurrency(Math.abs(diff))}`;
}

export default function RevenuePage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targets, setTargets] = useState<RevenueTarget[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [latestSnapshotByBooking, setLatestSnapshotByBooking] = useState<
    Record<string, PricingSnapshotRow>
  >({});

  const fetchData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: targetsData, error: targetsErr } = await supabase
        .from("revenue_targets")
        .select("*")
        .eq("course_id", courseId)
        .order("period_start");
      if (targetsErr) throw targetsErr;

      const { data: bookingsData, error: bookingsErr } = await supabase
        .from("bookings")
        .select("id, date, status, player_count, override_price")
        .eq("course_id", courseId)
        .neq("status", "cancelled");
      if (bookingsErr) throw bookingsErr;

      const { data: snapshotsData, error: snapshotsErr } = await supabase
        .from("pricing_snapshots")
        .select("booking_id, snapshot, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (snapshotsErr) throw snapshotsErr;

      const latestByBooking: Record<string, PricingSnapshotRow> = {};
      for (const snap of (snapshotsData ?? []) as PricingSnapshotRow[]) {
        // Snapshots are ordered desc by created_at; first one wins per booking
        if (!latestByBooking[snap.booking_id]) {
          latestByBooking[snap.booking_id] = snap;
        }
      }

      setTargets((targetsData ?? []) as RevenueTarget[]);
      setBookings((bookingsData ?? []) as BookingRow[]);
      setLatestSnapshotByBooking(latestByBooking);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load revenue data"
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId) {
      fetchData();
    }
  }, [authLoading, courseId, fetchData]);

  const bookingRevenue = useCallback(
    (booking: BookingRow): number => {
      if (booking.override_price != null) {
        return Number(booking.override_price) || 0;
      }
      const snap = latestSnapshotByBooking[booking.id];
      const total = snap?.snapshot?.total;
      return typeof total === "number" ? total : 0;
    },
    [latestSnapshotByBooking]
  );

  const monthBuckets: MonthBucket[] = useMemo(() => {
    // Build a map keyed by YYYY-MM from targets
    const map = new Map<string, MonthBucket>();
    for (const t of targets) {
      const key = monthKeyFromPeriodStart(t.period_start);
      map.set(key, {
        key,
        label: monthLabel(key),
        target: Number(t.target_amount) || 0,
        actual: 0,
        bookingCount: 0,
        periodStart: t.period_start,
      });
    }

    for (const b of bookings) {
      const key = monthKeyFromDate(b.date);
      const bucket = map.get(key);
      if (!bucket) continue; // only include months that have a target
      bucket.actual += bookingRevenue(b);
      bucket.bookingCount += 1;
    }

    return Array.from(map.values()).sort((a, b) =>
      a.periodStart.localeCompare(b.periodStart)
    );
  }, [targets, bookings, bookingRevenue]);

  const overriddenBookings: OverriddenBooking[] = useMemo(() => {
    return bookings
      .filter((b) => b.override_price != null)
      .map((b) => ({
        id: b.id,
        date: b.date,
        override_price: Number(b.override_price) || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [bookings]);

  const maxBarValue = useMemo(() => {
    let max = 0;
    for (const m of monthBuckets) {
      if (m.target > max) max = m.target;
      if (m.actual > max) max = m.actual;
    }
    return max || 1;
  }, [monthBuckets]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Revenue</h1>
        </div>

        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : error ? (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-red-700 mb-3">{error}</div>
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Section 1: Revenue vs Target Bars */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Revenue vs Target
              </h2>
              {monthBuckets.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No revenue targets configured for this course.
                </p>
              ) : (
                <div className="space-y-6">
                  {monthBuckets.map((m) => {
                    const onTarget = m.actual >= m.target;
                    const pct =
                      m.target > 0
                        ? Math.round((m.actual / m.target) * 100)
                        : 0;
                    const targetWidth = (m.target / maxBarValue) * 100;
                    const actualWidth = (m.actual / maxBarValue) * 100;
                    return (
                      <div key={m.key}>
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="font-medium text-gray-900">
                            {m.label}
                          </span>
                          <span className="text-sm text-gray-700">
                            {formatCurrency(m.actual)} /{" "}
                            {formatCurrency(m.target)}
                            <span
                              className={`ml-3 font-semibold ${
                                onTarget ? "text-green-700" : "text-orange-600"
                              }`}
                            >
                              {pct}%
                            </span>
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-xs text-gray-500">
                              Target
                            </span>
                            <div className="flex-1 bg-gray-100 rounded h-6 overflow-hidden">
                              <div
                                className="h-full bg-gray-400"
                                style={{ width: `${targetWidth}%` }}
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="w-14 text-xs text-gray-500">
                              Actual
                            </span>
                            <div className="flex-1 bg-gray-100 rounded h-6 overflow-hidden">
                              <div
                                className={`h-full ${
                                  onTarget ? "bg-green-500" : "bg-orange-500"
                                }`}
                                style={{ width: `${actualWidth}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section 2: Monthly Breakdown Table */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Monthly Breakdown
              </h2>
              {monthBuckets.length === 0 ? (
                <p className="text-sm text-gray-500">No data to display.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-700">
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Month
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Target
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Actual Revenue
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Difference
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          % of Target
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Booking Count
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthBuckets.map((m, idx) => {
                        const diff = m.actual - m.target;
                        const pct =
                          m.target > 0
                            ? Math.round((m.actual / m.target) * 100)
                            : 0;
                        const below = m.actual < m.target;
                        const rowClass = below
                          ? "bg-orange-50"
                          : idx % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50";
                        return (
                          <tr
                            key={m.key}
                            className={`${rowClass} border-b border-gray-200`}
                          >
                            <td className="px-4 py-2 text-gray-900">
                              {m.label}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {formatCurrency(m.target)}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {formatCurrency(m.actual)}
                            </td>
                            <td
                              className={`px-4 py-2 font-medium ${
                                diff >= 0
                                  ? "text-green-700"
                                  : "text-orange-600"
                              }`}
                            >
                              {formatDiff(diff)}
                            </td>
                            <td
                              className={`px-4 py-2 font-medium ${
                                below ? "text-orange-600" : "text-green-700"
                              }`}
                            >
                              {pct}%
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {m.bookingCount}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Section 3: Overridden Bookings */}
            {overriddenBookings.length > 0 && (
              <section className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-1">
                  Overridden Bookings
                </h2>
                <p className="text-xs text-gray-500 mb-4">
                  Bookings with manually adjusted prices.
                </p>
                <ul className="divide-y divide-gray-200">
                  {overriddenBookings.map((b) => (
                    <li
                      key={b.id}
                      className="py-2 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-gray-900 font-medium">
                          {b.date}
                        </span>
                        <span className="text-gray-500 font-mono text-xs">
                          {b.id.slice(0, 8)}
                        </span>
                      </div>
                      <span className="text-gray-900 font-medium">
                        {formatCurrency(b.override_price)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}
