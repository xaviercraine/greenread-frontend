"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface SeasonTotals {
  total_bookings?: number;
  total_revenue?: number;
  total_players?: number;
  average_utilization?: number;
}

interface MonthlySummary {
  year: number;
  month: number;
  target: number;
  total_players: number;
  total_revenue: number;
  available_days: number;
  total_bookings: number;
  avg_utilization: number;
  revenue_vs_target_pct: number | null;
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
  day_type: string;
  booking_count: number;
  total_revenue: number;
  daily_target: number;
  revenue_if_one_lost: number;
}

interface UnderutilizedDate {
  date: string;
  day_type: string;
  booking_count: number;
  total_players: number;
  max_players: number;
  utilization_pct: number;
  daily_target: number;
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

const SHORT_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function formatNiceDateWeekday(dateString: string): string {
  const [yearStr, monthStr, dayStr] = dateString.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const day = Number(dayStr);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
    return dateString;
  }
  const weekday = SHORT_WEEKDAYS[new Date(year, month, day).getDay()];
  return `${weekday}, ${SHORT_MONTHS[month]} ${day}, ${year}`;
}

function formatCurrencyCents(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatPctWhole(value: number | undefined | null): string {
  const n = Number(value) || 0;
  return `${Math.round(n)}%`;
}

function vulnerableDotColor(postLoss: number, target: number): string {
  if (target <= 0) return "bg-gray-400";
  const pct = (postLoss / target) * 100;
  if (pct < 25) return "bg-red-500";
  if (pct <= 75) return "bg-yellow-500";
  return "bg-green-500";
}

function utilizationDotColor(pct: number | undefined | null): string {
  const n = Number(pct) || 0;
  if (n < 25) return "bg-red-500";
  if (n <= 75) return "bg-yellow-500";
  return "bg-green-500";
}

function monthlyDotColor(
  pct: number | null | undefined,
  target: number
): string {
  if (target <= 0 || pct == null) return "bg-gray-400";
  if (pct < 25) return "bg-red-500";
  if (pct <= 75) return "bg-yellow-500";
  return "bg-green-500";
}

function formatTimestamp(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
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
  const [openCards, setOpenCards] = useState<Set<string>>(new Set());

  const toggleCard = useCallback((key: string) => {
    setOpenCards((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

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
  const vulnerableDates = report?.vulnerable_dates ?? [];
  const underutilizedDates = report?.underutilized_dates ?? [];

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
          <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center gap-3">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            <span className="text-sm text-gray-500">
              Loading season data...
            </span>
          </div>
        ) : !report ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">
              No season report available. Click &quot;Run Season
              Simulation&quot; to generate one.
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

            {/* Section: Monthly Breakdown */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Monthly Breakdown
              </h2>
              {monthlySummaries.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No monthly data available
                </p>
              ) : (
                <div>
                  {monthlySummaries.map((m, idx) => {
                    const key = `monthly-${m.year}-${m.month}-${idx}`;
                    const isOpen = openCards.has(key);
                    const target = Number(m.target) || 0;
                    const pct = m.revenue_vs_target_pct;
                    const monthName =
                      m.month >= 1 && m.month <= 12
                        ? MONTH_NAMES[m.month - 1]
                        : String(m.month);
                    const headline =
                      target > 0 && pct != null
                        ? `${monthName} ${m.year} — ${Math.round(
                            pct
                          )}% of target (${formatCurrency(
                            m.total_revenue
                          )} / ${formatCurrency(target)})`
                        : `${monthName} ${m.year} — No revenue target set`;
                    const dotColor = monthlyDotColor(pct, target);
                    return (
                      <div
                        key={key}
                        className="border border-gray-200 rounded-lg p-4 mb-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCard(key)}
                          aria-expanded={isOpen}
                          className="w-full flex justify-between items-center cursor-pointer text-left"
                        >
                          <span className="flex items-center text-sm text-gray-900 font-medium">
                            <span
                              className={`w-3 h-3 rounded-full inline-block mr-2 ${dotColor}`}
                            />
                            {headline}
                          </span>
                          <span className="text-gray-400 text-xs ml-2">
                            {isOpen ? "▼" : "▶"}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="pt-3 mt-3 border-t border-gray-100 text-sm text-gray-700 space-y-1">
                            <div>Available days: {m.available_days}</div>
                            <div>
                              Bookings:{" "}
                              {(m.total_bookings ?? 0).toLocaleString()}
                            </div>
                            <div>
                              Players: {(m.total_players ?? 0).toLocaleString()}
                            </div>
                            <div>
                              Revenue: {formatCurrencyCents(m.total_revenue)}
                            </div>
                            <div>
                              Target:{" "}
                              {target > 0
                                ? formatCurrencyCents(target)
                                : "No target"}
                            </div>
                            <div>
                              Avg utilization:{" "}
                              {formatPctWhole(m.avg_utilization)}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
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
                (dates where losing one booking drops below daily target)
              </p>
              {vulnerableDates.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No vulnerable dates identified
                </p>
              ) : (
                <div>
                  {vulnerableDates.map((v, idx) => {
                    const key = `vulnerable-${v.date}-${idx}`;
                    const isOpen = openCards.has(key);
                    const totalRev = Number(v.total_revenue) || 0;
                    const target = Number(v.daily_target) || 0;
                    const postLoss = Number(v.revenue_if_one_lost) || 0;
                    const bookings = Number(v.booking_count) || 0;
                    const revenueLost = totalRev - postLoss;
                    const targetShortfall = target - postLoss;
                    const dotColor = vulnerableDotColor(postLoss, target);
                    const headline = `${formatNiceDateWeekday(v.date)} (${
                      v.day_type
                    }) — ${formatCurrency(revenueLost)} at risk if one cancels`;
                    let explanation: string;
                    if (postLoss >= target && target > 0) {
                      explanation = `This ${v.day_type} has ${bookings} bookings. Even after losing one, revenue of ${formatCurrency(
                        postLoss
                      )} would still meet the ${formatCurrency(
                        target
                      )} daily target.`;
                    } else if (bookings === 1) {
                      explanation = `This ${v.day_type} has only 1 booking generating ${formatCurrency(
                        totalRev
                      )}. A single cancellation would eliminate all revenue, leaving a ${formatCurrency(
                        target
                      )} shortfall against your daily target.`;
                    } else {
                      explanation = `This ${v.day_type} has ${bookings} bookings totaling ${formatCurrency(
                        totalRev
                      )}. Losing one would reduce revenue by ${formatCurrency(
                        revenueLost
                      )} to ${formatCurrency(
                        postLoss
                      )}, leaving a ${formatCurrency(
                        targetShortfall
                      )} shortfall against your ${formatCurrency(
                        target
                      )} daily target.`;
                    }
                    return (
                      <div
                        key={key}
                        className="border border-gray-200 rounded-lg p-4 mb-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCard(key)}
                          aria-expanded={isOpen}
                          className="w-full flex justify-between items-center cursor-pointer text-left"
                        >
                          <span className="flex items-center text-sm text-gray-900 font-medium">
                            <span
                              className={`w-3 h-3 rounded-full inline-block mr-2 ${dotColor}`}
                            />
                            {headline}
                          </span>
                          <span className="text-gray-400 text-xs ml-2">
                            {isOpen ? "▼" : "▶"}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="pt-3 mt-3 border-t border-gray-100 text-sm text-gray-700 space-y-1">
                            <div>Current bookings: {bookings}</div>
                            <div>
                              Current revenue: {formatCurrencyCents(totalRev)}
                            </div>
                            <div>
                              Daily revenue target:{" "}
                              {formatCurrencyCents(target)}
                            </div>
                            <div>
                              Revenue if one cancels:{" "}
                              {formatCurrencyCents(postLoss)}
                            </div>
                            <div>
                              Revenue lost: {formatCurrencyCents(revenueLost)}
                            </div>
                            <div>
                              Target shortfall if lost:{" "}
                              {formatCurrencyCents(targetShortfall)}
                            </div>
                            <div className="italic text-gray-600 text-sm mt-2">
                              {explanation}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Section: Underutilized Dates */}
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Underutilized Dates
              </h2>
              <p className="text-xs text-gray-500 mb-4">
                (dates with the most open capacity)
              </p>
              {underutilizedDates.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No underutilized dates identified
                </p>
              ) : (
                <div>
                  {underutilizedDates.map((u, idx) => {
                    const key = `under-${u.date}-${idx}`;
                    const isOpen = openCards.has(key);
                    const bookings = Number(u.booking_count) || 0;
                    const players = Number(u.total_players) || 0;
                    const maxPlayers = Number(u.max_players) || 0;
                    const utilPct = Number(u.utilization_pct) || 0;
                    const target = Number(u.daily_target) || 0;
                    const dotColor = utilizationDotColor(utilPct);
                    const headline = `${formatNiceDateWeekday(u.date)} (${
                      u.day_type
                    }) — ${formatPctWhole(
                      utilPct
                    )} utilized, ${players}/${maxPlayers} players`;
                    let explanation: string;
                    if (bookings === 0 && target > 0) {
                      explanation = `This ${u.day_type} has no bookings. Capacity for ${maxPlayers} players is entirely open. Daily revenue target of ${formatCurrency(
                        target
                      )} is unmet.`;
                    } else if (bookings === 0) {
                      explanation = `This ${u.day_type} has no bookings. Capacity for ${maxPlayers} players is entirely open.`;
                    } else {
                      explanation = `This ${u.day_type} has ${bookings} booking(s) with ${players} of ${maxPlayers} player slots filled (${formatPctWhole(
                        utilPct
                      )} utilized).`;
                    }
                    return (
                      <div
                        key={key}
                        className="border border-gray-200 rounded-lg p-4 mb-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCard(key)}
                          aria-expanded={isOpen}
                          className="w-full flex justify-between items-center cursor-pointer text-left"
                        >
                          <span className="flex items-center text-sm text-gray-900 font-medium">
                            <span
                              className={`w-3 h-3 rounded-full inline-block mr-2 ${dotColor}`}
                            />
                            {headline}
                          </span>
                          <span className="text-gray-400 text-xs ml-2">
                            {isOpen ? "▼" : "▶"}
                          </span>
                        </button>
                        {isOpen && (
                          <div className="pt-3 mt-3 border-t border-gray-100 text-sm text-gray-700 space-y-1">
                            <div>Bookings: {bookings}</div>
                            <div>
                              Players booked: {players} of {maxPlayers} capacity
                            </div>
                            <div>Utilization: {formatPctWhole(utilPct)}</div>
                            <div>
                              Daily revenue target:{" "}
                              {target > 0
                                ? formatCurrencyCents(target)
                                : "No target"}
                            </div>
                            <div className="italic text-gray-600 text-sm mt-2">
                              {explanation}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
