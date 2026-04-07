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
  snapshot: {
    total?: number;
    green_fees?: number;
    cart_cost?: number;
    fb_total?: number;
    bar_total?: number;
    addon_total?: number;
  } | null;
  created_at: string;
}

interface SourceMonthRow {
  key: string;
  label: string;
  periodStart: string;
  greenFees: number;
  carts: number;
  fb: number;
  bar: number;
  addons: number;
  total: number;
}

interface DailyDataEntry {
  date: string;
  daily_target: number;
  revenue: number;
}

interface GapEntry {
  date: string;
  daily_target: number;
  revenue: number;
  gap: number;
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

function formatNiceDate(dateString: string): string {
  const [yearStr, monthStr, dayStr] = dateString.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return dateString;
  }
  return `${MONTH_NAMES[month]} ${day}, ${year}`;
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
  const [seasonReportDailyData, setSeasonReportDailyData] = useState<
    DailyDataEntry[] | null
  >(null);

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

      const { data: seasonReportData, error: seasonReportErr } = await supabase
        .from("season_reports")
        .select("report, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (seasonReportErr) throw seasonReportErr;

      setTargets((targetsData ?? []) as RevenueTarget[]);
      setBookings((bookingsData ?? []) as BookingRow[]);
      setLatestSnapshotByBooking(latestByBooking);

      const dailyData = (seasonReportData?.report as { daily_data?: DailyDataEntry[] } | null)
        ?.daily_data;
      setSeasonReportDailyData(Array.isArray(dailyData) ? dailyData : null);
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

  const revenueBySource: SourceMonthRow[] = useMemo(() => {
    const map = new Map<string, SourceMonthRow>();
    for (const b of bookings) {
      if (b.status === "draft") continue;
      const snap = latestSnapshotByBooking[b.id]?.snapshot;
      if (!snap) continue;
      const key = monthKeyFromDate(b.date);
      let row = map.get(key);
      if (!row) {
        row = {
          key,
          label: monthLabel(key),
          periodStart: `${key}-01`,
          greenFees: 0,
          carts: 0,
          fb: 0,
          bar: 0,
          addons: 0,
          total: 0,
        };
        map.set(key, row);
      }
      row.greenFees += Number(snap.green_fees) || 0;
      row.carts += Number(snap.cart_cost) || 0;
      row.fb += Number(snap.fb_total) || 0;
      row.bar += Number(snap.bar_total) || 0;
      row.addons += Number(snap.addon_total) || 0;
      row.total += Number(snap.total) || 0;
    }
    return Array.from(map.values()).sort((a, b) =>
      a.periodStart.localeCompare(b.periodStart)
    );
  }, [bookings, latestSnapshotByBooking]);

  const gapEntries: GapEntry[] = useMemo(() => {
    if (!seasonReportDailyData) return [];
    return seasonReportDailyData
      .map((d) => ({
        date: d.date,
        daily_target: Number(d.daily_target) || 0,
        revenue: Number(d.revenue) || 0,
        gap: (Number(d.daily_target) || 0) - (Number(d.revenue) || 0),
      }))
      .filter((d) => d.revenue < d.daily_target)
      .sort((a, b) => b.gap - a.gap)
      .slice(0, 10);
  }, [seasonReportDailyData]);

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
                            <div className="flex-1 bg-gray-100 rounded h-8 overflow-hidden">
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
                            <div className="flex-1 bg-gray-100 rounded h-8 overflow-hidden">
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

            {/* Section 4: Revenue by Source Breakdown */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Revenue by Source
              </h2>
              {revenueBySource.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No pricing snapshots available for this course.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-700">
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Month
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Green Fees
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Carts
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          F&amp;B
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Bar
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Add-ons
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {revenueBySource.map((row, idx) => (
                        <tr
                          key={row.key}
                          className={`${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                          } border-b border-gray-200`}
                        >
                          <td className="px-4 py-2 text-gray-900 font-medium">
                            {row.label}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.greenFees)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.carts)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.fb)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.bar)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.addons)}
                          </td>
                          <td className="px-4 py-2 text-gray-900 font-semibold">
                            {formatCurrency(row.total)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Section 5: Gap Analysis */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Gap Analysis
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Top 10 days where booked revenue fell short of the daily target.
              </p>
              {!seasonReportDailyData ? (
                <p className="text-sm text-gray-500">
                  Run the Season Simulator to see gap analysis.
                </p>
              ) : gapEntries.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No days are below target.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {gapEntries.map((g) => (
                    <li
                      key={g.date}
                      className="py-2 text-sm text-gray-800"
                    >
                      <span className="font-medium text-gray-900">
                        {formatNiceDate(g.date)}
                      </span>{" "}
                      — Target: {formatCurrency(g.daily_target)} / Booked:{" "}
                      {formatCurrency(g.revenue)} /{" "}
                      <span className="text-orange-600 font-semibold">
                        Gap: {formatCurrency(g.gap)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
