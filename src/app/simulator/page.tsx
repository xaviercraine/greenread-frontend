"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import NavBar from "@/components/NavBar";

interface SeasonTotals {
  total_bookings?: number;
  total_revenue?: number;
  total_players?: number;
  average_utilization?: number;
}

interface MonthlySummary {
  month?: string;
  bookings?: number;
  revenue?: number;
  target?: number;
  difference?: number;
  utilization?: number;
}

interface DailyDatum {
  date: string;
  revenue?: number;
  daily_target?: number;
  utilization_pct?: number;
  day_type?: string;
  bookings_count?: number;
}

interface VulnerableDate {
  date: string;
  revenue?: number;
  reason?: string;
}

interface UnderutilizedDate {
  date: string;
  utilization_pct?: number;
}

interface SeasonReport {
  season_totals?: SeasonTotals;
  monthly_summaries?: MonthlySummary[];
  daily_data?: DailyDatum[];
  vulnerable_dates?: VulnerableDate[];
  underutilized_dates?: UnderutilizedDate[];
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

const SEASON_MONTHS: { year: number; month: number }[] = [
  { year: 2026, month: 5 }, // June
  { year: 2026, month: 6 }, // July
  { year: 2026, month: 7 }, // August
  { year: 2026, month: 8 }, // September
  { year: 2026, month: 9 }, // October
];

function formatCurrency(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatPct(value: number | undefined | null): string {
  const n = Number(value) || 0;
  return `${n.toFixed(1)}%`;
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

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

function formatMonthLabel(monthString: string | number | undefined): string {
  if (monthString == null || monthString === "") return "—";
  if (typeof monthString === "number") {
    const idx = monthString - 1;
    if (idx >= 0 && idx < MONTH_NAMES.length) return MONTH_NAMES[idx];
    return String(monthString);
  }
  if (typeof monthString === "string") {
    // Accept "YYYY-MM" or "YYYY-MM-DD"
    const parts = monthString.split("-");
    if (parts.length < 2) return monthString;
    const year = Number(parts[0]);
    const month = Number(parts[1]) - 1;
    if (Number.isNaN(year) || Number.isNaN(month)) return monthString;
    return `${MONTH_NAMES[month]} ${year}`;
  }
  return String(monthString);
}

function utilizationColor(pct: number | undefined | null): string {
  if (pct == null) return "bg-gray-100";
  const n = Number(pct);
  if (n <= 0) return "bg-gray-200";
  if (n <= 25) return "bg-red-200";
  if (n <= 50) return "bg-orange-400";
  if (n <= 75) return "bg-green-300";
  if (n <= 100) return "bg-green-700";
  return "bg-blue-500";
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfWeek(year: number, month: number): number {
  // 0 = Sunday
  return new Date(year, month, 1).getDay();
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export default function SimulatorPage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<SeasonReport | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);

  const fetchExistingReport = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from("season_reports")
        .select("report, created_at")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fetchErr) throw fetchErr;
      if (data) {
        setReport((data.report as SeasonReport) ?? null);
        setGeneratedAt(data.created_at ?? null);
      } else {
        setReport(null);
        setGeneratedAt(null);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load season report"
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId) {
      fetchExistingReport();
    }
  }, [authLoading, courseId, fetchExistingReport]);

  const runSimulator = useCallback(async () => {
    if (!courseId) return;
    setRunning(true);
    setError(null);
    try {
      const { error: rpcErr } = await supabase.rpc("generate_season_report", {
        p_course_id: courseId,
      });
      if (rpcErr) throw rpcErr;
      await fetchExistingReport();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run season simulator"
      );
    } finally {
      setRunning(false);
    }
  }, [courseId, supabase, fetchExistingReport]);

  const dailyByDate = useMemo(() => {
    const map = new Map<string, DailyDatum>();
    for (const d of report?.daily_data ?? []) {
      if (d?.date) map.set(d.date, d);
    }
    return map;
  }, [report]);

  const totals = report?.season_totals ?? {};
  const monthlySummaries = report?.monthly_summaries ?? [];
  const vulnerableDates = (report?.vulnerable_dates ?? []).slice(0, 10);
  const underutilizedDates = (report?.underutilized_dates ?? []).slice(0, 10);

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
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Season Simulator
            </h1>
            {generatedAt && (
              <p className="text-sm text-gray-500 mt-1">
                Report generated: {formatTimestamp(generatedAt)}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={runSimulator}
            disabled={running || loading || !courseId}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium"
          >
            {running && (
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {running ? "Running..." : "Run Season Simulator"}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : !report ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">
              No season report yet. Click &quot;Run Season Simulator&quot; to
              generate one.
            </p>
          </div>
        ) : (
          <>
            {/* Section: Season Summary */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Season Summary
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    Total Bookings
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {(totals.total_bookings ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    Total Revenue
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {formatCurrency(totals.total_revenue)}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    Total Players
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {(totals.total_players ?? 0).toLocaleString()}
                  </div>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-xs text-gray-500 uppercase tracking-wide">
                    Avg Utilization
                  </div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {formatPct(totals.average_utilization)}
                  </div>
                </div>
              </div>
            </section>

            {/* Section: Monthly Summary */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Monthly Summary
              </h2>
              {monthlySummaries.length === 0 ? (
                <p className="text-sm text-gray-500">No monthly data.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full border border-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-gray-700">
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Month
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Bookings
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Revenue
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Target
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Difference
                        </th>
                        <th className="px-4 py-2 border-b border-gray-200 font-medium">
                          Utilization
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthlySummaries.map((m, idx) => {
                        const diff = Number(m.difference) || 0;
                        return (
                          <tr
                            key={`${m.month}-${idx}`}
                            className={`${
                              idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                            } border-b border-gray-200`}
                          >
                            <td className="px-4 py-2 text-gray-900 font-medium">
                              {formatMonthLabel(m.month)}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {(m.bookings ?? 0).toLocaleString()}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {formatCurrency(m.revenue)}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {formatCurrency(m.target)}
                            </td>
                            <td
                              className={`px-4 py-2 font-semibold ${
                                diff >= 0 ? "text-green-700" : "text-red-600"
                              }`}
                            >
                              {diff >= 0 ? "+" : "-"}
                              {formatCurrency(Math.abs(diff))}
                            </td>
                            <td className="px-4 py-2 text-gray-700">
                              {formatPct(m.utilization)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Section: Heatmap Calendar */}
            <section className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Daily Heatmap
                </h2>
                <div className="flex items-center gap-2 text-xs text-gray-600">
                  <span>0%</span>
                  <span className="w-4 h-4 rounded bg-gray-200 inline-block" />
                  <span className="w-4 h-4 rounded bg-red-200 inline-block" />
                  <span className="w-4 h-4 rounded bg-orange-400 inline-block" />
                  <span className="w-4 h-4 rounded bg-green-300 inline-block" />
                  <span className="w-4 h-4 rounded bg-green-700 inline-block" />
                  <span className="w-4 h-4 rounded bg-blue-500 inline-block" />
                  <span>100%+</span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {SEASON_MONTHS.map(({ year, month }) => {
                  const numDays = daysInMonth(year, month);
                  const offset = firstDayOfWeek(year, month);
                  const cells: (DailyDatum | null)[] = [];
                  for (let i = 0; i < offset; i++) cells.push(null);
                  for (let day = 1; day <= numDays; day++) {
                    const dateKey = `${year}-${pad2(month + 1)}-${pad2(day)}`;
                    cells.push(dailyByDate.get(dateKey) ?? { date: dateKey });
                  }
                  return (
                    <div key={`${year}-${month}`}>
                      <div className="text-sm font-semibold text-gray-900 mb-2">
                        {MONTH_NAMES[month]} {year}
                      </div>
                      <div className="grid grid-cols-7 gap-1 text-[10px] text-gray-500 mb-1">
                        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                          <div key={i} className="text-center">
                            {d}
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-7 gap-1">
                        {cells.map((cell, i) => {
                          if (!cell) {
                            return <div key={i} className="aspect-square" />;
                          }
                          const dayNum = Number(cell.date.split("-")[2]);
                          const colorClass = utilizationColor(
                            cell.utilization_pct
                          );
                          const isHovered = hoveredDate === cell.date;
                          const hasData = cell.utilization_pct != null;
                          return (
                            <div
                              key={i}
                              className="relative"
                              onMouseEnter={() => setHoveredDate(cell.date)}
                              onMouseLeave={() => setHoveredDate(null)}
                            >
                              <div
                                className={`aspect-square rounded ${colorClass} flex items-center justify-center text-[10px] cursor-pointer ${
                                  hasData &&
                                  (cell.utilization_pct ?? 0) > 50
                                    ? "text-white"
                                    : "text-gray-700"
                                }`}
                              >
                                {dayNum}
                              </div>
                              {isHovered && (
                                <div className="absolute z-10 left-1/2 -translate-x-1/2 top-full mt-1 w-48 bg-gray-900 text-white text-xs rounded p-2 shadow-lg pointer-events-none">
                                  <div className="font-semibold">
                                    {formatNiceDate(cell.date)}
                                  </div>
                                  <div>
                                    Revenue: {formatCurrency(cell.revenue)}
                                  </div>
                                  <div>
                                    Target:{" "}
                                    {formatCurrency(cell.daily_target)}
                                  </div>
                                  <div>
                                    Utilization:{" "}
                                    {formatPct(cell.utilization_pct)}
                                  </div>
                                  <div>
                                    Bookings: {cell.bookings_count ?? 0}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Section: Vulnerable Dates */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Vulnerable Dates
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Top 10 dates flagged as vulnerable.
              </p>
              {vulnerableDates.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No vulnerable dates detected.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {vulnerableDates.map((v, idx) => (
                    <li
                      key={`${v.date}-${idx}`}
                      className="py-2 text-sm text-gray-800"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900">
                          {formatNiceDate(v.date)}
                        </span>
                        <span className="text-gray-700">
                          {formatCurrency(v.revenue)}
                        </span>
                      </div>
                      {v.reason && (
                        <div className="text-xs text-gray-500 mt-0.5">
                          {v.reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Section: Underutilized Dates */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Underutilized Dates
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                Top 10 dates with the lowest utilization.
              </p>
              {underutilizedDates.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No underutilized dates.
                </p>
              ) : (
                <ul className="divide-y divide-gray-200">
                  {underutilizedDates.map((u, idx) => (
                    <li
                      key={`${u.date}-${idx}`}
                      className="py-2 text-sm flex items-center justify-between"
                    >
                      <span className="font-medium text-gray-900">
                        {formatNiceDate(u.date)}
                      </span>
                      <span className="text-orange-600 font-semibold">
                        {formatPct(u.utilization_pct)}
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
