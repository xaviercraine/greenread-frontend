"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

interface PerBookingDiff {
  booking_id: string;
  date: string;
  current: number;
  projected: number;
  diff: number;
}

interface ScenarioResult {
  current_total: number;
  projected_total: number;
  difference: number;
  per_booking_diffs: PerBookingDiff[];
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

function formatCurrency(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
}

function formatSignedCurrency(amount: number | undefined | null): string {
  const n = Number(amount) || 0;
  const sign = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
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

export default function ScenariosPage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [baseRate, setBaseRate] = useState<number>(0);
  const [weekendMultiplier, setWeekendMultiplier] = useState<number>(1);
  const [seasonalMultiplier, setSeasonalMultiplier] = useState<number>(1);
  const [holidayMultiplier, setHolidayMultiplier] = useState<number>(1);

  // Track original loaded values so we can detect changes
  const [originalValues, setOriginalValues] = useState<{
    base: number;
    weekend: number;
    seasonal: number;
    holiday: number;
  } | null>(null);

  const [debouncedReady, setDebouncedReady] = useState(false);
  const [result, setResult] = useState<ScenarioResult | null>(null);

  const fetchPricingRules = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: fetchErr } = await supabase
        .from("pricing_rules")
        .select("*")
        .eq("course_id", courseId)
        .limit(1);
      if (fetchErr) throw fetchErr;
      console.log("pricing_rules sample row:", data);

      const byType = new Map<string, number>();
      for (const row of data ?? []) {
        if (row?.rule_type != null) {
          byType.set(row.rule_type as string, Number(row.rate) || 0);
        }
      }
      const base = byType.get("base_rate") ?? 0;
      const weekend = byType.get("weekend") ?? 1;
      const seasonal = byType.get("seasonal") ?? 1;
      const holiday = byType.get("holiday") ?? 1;
      setBaseRate(base);
      setWeekendMultiplier(weekend);
      setSeasonalMultiplier(seasonal);
      setHolidayMultiplier(holiday);
      setOriginalValues({ base, weekend, seasonal, holiday });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load pricing rules"
      );
    } finally {
      setLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId) {
      fetchPricingRules();
    }
  }, [authLoading, courseId, fetchPricingRules]);

  // Debounce: enable Run button 500ms after the last change
  useEffect(() => {
    setDebouncedReady(false);
    const t = setTimeout(() => setDebouncedReady(true), 500);
    return () => clearTimeout(t);
  }, [baseRate, weekendMultiplier, seasonalMultiplier, holidayMultiplier]);

  const runScenario = useCallback(async () => {
    if (!courseId) return;
    setRunning(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "run_pricing_scenario",
        {
          p_course_id: courseId,
          p_modified_rules: {
            base_rate: baseRate,
            weekend_multiplier: weekendMultiplier,
            seasonal_multiplier: seasonalMultiplier,
            holiday_multiplier: holidayMultiplier,
          },
        }
      );
      if (rpcErr) throw rpcErr;
      setResult(data as ScenarioResult);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to run scenario"
      );
    } finally {
      setRunning(false);
    }
  }, [
    courseId,
    supabase,
    baseRate,
    weekendMultiplier,
    seasonalMultiplier,
    holidayMultiplier,
  ]);

  const sortedDiffs = useMemo(() => {
    if (!result?.per_booking_diffs) return [];
    return [...result.per_booking_diffs].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }, [result]);

  const pctChange = useMemo(() => {
    if (!result) return 0;
    const cur = Number(result.current_total) || 0;
    if (cur === 0) return 0;
    return ((Number(result.difference) || 0) / cur) * 100;
  }, [result]);

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

  const diff = Number(result?.difference) || 0;
  const diffPositive = diff >= 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Scenario Builder
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Adjust pricing rules and see the projected impact on season revenue.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Section 1: Pricing Sliders */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Pricing Rules
          </h2>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <PricingControl
                label="Base Rate ($)"
                value={baseRate}
                min={0}
                max={500}
                step={1}
                onChange={setBaseRate}
                originalValue={originalValues?.base}
              />
              <PricingControl
                label="Weekend Multiplier"
                value={weekendMultiplier}
                min={0.5}
                max={3}
                step={0.05}
                onChange={setWeekendMultiplier}
                originalValue={originalValues?.weekend}
              />
              <PricingControl
                label="Seasonal Multiplier"
                value={seasonalMultiplier}
                min={0.5}
                max={3}
                step={0.05}
                onChange={setSeasonalMultiplier}
                originalValue={originalValues?.seasonal}
              />
              <PricingControl
                label="Holiday Multiplier"
                value={holidayMultiplier}
                min={0.5}
                max={3}
                step={0.05}
                onChange={setHolidayMultiplier}
                originalValue={originalValues?.holiday}
              />
            </div>
          )}
        </section>

        {/* Section 2: Run Scenario Button */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Run Scenario
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Calculate projected revenue with the rules above.
              </p>
            </div>
            <button
              type="button"
              onClick={runScenario}
              disabled={
                running || loading || !courseId || !debouncedReady
              }
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white text-sm font-medium"
            >
              {running && (
                <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              )}
              {running ? "Running..." : "Run Scenario"}
            </button>
          </div>
        </section>

        {/* Section 3: Results Summary */}
        {result && (
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Results Summary
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  Current Season Total
                </div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(result.current_total)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  Projected Season Total
                </div>
                <div className="text-2xl font-bold text-gray-900 mt-1">
                  {formatCurrency(result.projected_total)}
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wide">
                  Difference
                </div>
                <div
                  className={`text-2xl font-bold mt-1 ${
                    diffPositive ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {formatSignedCurrency(diff)}
                </div>
              </div>
            </div>
            <p
              className={`text-sm font-medium ${
                diffPositive ? "text-green-700" : "text-red-600"
              }`}
            >
              This change would {diffPositive ? "increase" : "decrease"} season
              revenue by {formatCurrency(Math.abs(diff))} (
              {diffPositive ? "+" : ""}
              {pctChange.toFixed(1)}%)
            </p>
          </section>
        )}

        {/* Section 4: Per-Booking Comparison Table */}
        {result && (
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Per-Booking Comparison
            </h2>
            {sortedDiffs.length === 0 ? (
              <p className="text-sm text-gray-500">No bookings to compare.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full border border-gray-200 text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-gray-700">
                      <th className="px-4 py-2 border-b border-gray-200 font-medium">
                        Date
                      </th>
                      <th className="px-4 py-2 border-b border-gray-200 font-medium">
                        Current Total
                      </th>
                      <th className="px-4 py-2 border-b border-gray-200 font-medium">
                        Projected Total
                      </th>
                      <th className="px-4 py-2 border-b border-gray-200 font-medium">
                        Difference
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedDiffs.map((row, idx) => {
                      const rowDiff = Number(row.diff) || 0;
                      return (
                        <tr
                          key={`${row.booking_id}-${idx}`}
                          className={`${
                            idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                          } border-b border-gray-200`}
                        >
                          <td className="px-4 py-2 text-gray-900 font-medium">
                            {formatNiceDate(row.date)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.current)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {formatCurrency(row.projected)}
                          </td>
                          <td
                            className={`px-4 py-2 font-semibold ${
                              rowDiff >= 0
                                ? "text-green-700"
                                : "text-red-600"
                            }`}
                          >
                            {formatSignedCurrency(rowDiff)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

interface PricingControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  originalValue?: number;
}

function PricingControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  originalValue,
}: PricingControlProps) {
  const changed =
    originalValue != null && Math.abs(value - originalValue) > 1e-9;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-sm font-medium text-gray-700">{label}</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right text-gray-900"
          />
          {changed && (
            <span className="text-xs text-orange-600 font-medium">
              modified
            </span>
          )}
        </div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-green-600"
      />
      {originalValue != null && (
        <div className="text-xs text-gray-500 mt-1">
          Current: {originalValue}
        </div>
      )}
    </div>
  );
}
