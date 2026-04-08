"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

type TournamentFormat = {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
};

type FBPackage = {
  id: string;
  name: string;
  price_per_person: number;
};

type BarPackage = {
  id: string;
  name: string;
  price_per_person: number;
};

type DisplacementFloor = {
  floor_amount: number;
  displacement_cost: number;
  below_floor?: boolean;
};

type PricingResult = {
  green_fees?: number;
  cart_fees?: number;
  cart_cost?: number;
  fb_total?: number;
  bar_total?: number;
  addon_total?: number;
  subtotal?: number;
  pre_tax_total?: number;
  hst?: number;
  hst_rate?: number;
  total?: number;
  displacement_floor?: DisplacementFloor | null;
};

type DraftResult = {
  success?: boolean;
  booking_id?: string;
  error?: string;
  message?: string;
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "$0.00";
  return `$${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function QuickQuotePage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [fbPackages, setFbPackages] = useState<FBPackage[]>([]);
  const [barPackages, setBarPackages] = useState<BarPackage[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Form state
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [formatId, setFormatId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [fbPackageId, setFbPackageId] = useState<string>("");
  const [fbHeadcount, setFbHeadcount] = useState<number>(0);
  const [barPackageId, setBarPackageId] = useState<string>("");
  const [barHeadcount, setBarHeadcount] = useState<number>(0);

  // Quote state
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [pricing, setPricing] = useState<PricingResult | null>(null);

  // Draft state
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftResult, setDraftResult] = useState<DraftResult | null>(null);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    async function load() {
      setLoadingOptions(true);
      setOptionsError(null);
      const [fmtRes, fbRes, barRes] = await Promise.all([
        supabase
          .from("tournament_formats")
          .select("id, name, min_players, max_players")
          .eq("course_id", courseId)
          .order("name"),
        supabase
          .from("fb_packages")
          .select("id, name, price_per_person")
          .eq("course_id", courseId)
          .order("name"),
        supabase
          .from("bar_packages")
          .select("id, name, price_per_person")
          .eq("course_id", courseId)
          .order("name"),
      ]);
      if (cancelled) return;
      const err = fmtRes.error || fbRes.error || barRes.error;
      if (err) {
        setOptionsError(err.message);
      } else {
        setFormats(fmtRes.data ?? []);
        setFbPackages(fbRes.data ?? []);
        setBarPackages(barRes.data ?? []);
      }
      setLoadingOptions(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [supabase, courseId]);

  // Filter formats by player count range as the user types
  const visibleFormats = useMemo(() => {
    if (!playerCount || playerCount <= 0) return formats;
    return formats.filter(
      (f) => playerCount >= f.min_players && playerCount <= f.max_players,
    );
  }, [formats, playerCount]);

  // If selected format is filtered out, clear it
  useEffect(() => {
    if (formatId && !visibleFormats.find((f) => f.id === formatId)) {
      setFormatId("");
    }
  }, [visibleFormats, formatId]);

  // Default headcounts to player count when packages are first picked
  useEffect(() => {
    if (fbPackageId && fbHeadcount === 0 && playerCount > 0) {
      setFbHeadcount(playerCount);
    }
  }, [fbPackageId, fbHeadcount, playerCount]);

  useEffect(() => {
    if (barPackageId && barHeadcount === 0 && playerCount > 0) {
      setBarHeadcount(playerCount);
    }
  }, [barPackageId, barHeadcount, playerCount]);

  const canQuote =
    !!courseId &&
    playerCount > 0 &&
    !!formatId &&
    !!selectedDate &&
    (!fbPackageId || fbHeadcount > 0) &&
    (!barPackageId || barHeadcount > 0);

  async function handleGetQuote() {
    if (!canQuote) return;
    setQuoting(true);
    setQuoteError(null);
    setPricing(null);
    setDraftResult(null);
    setDraftError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/pricing-api`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            action: "calculate",
            params: {
              course_id: courseId,
              date: selectedDate,
              format_id: formatId,
              player_count: playerCount,
              fb_selections: fbPackageId
                ? [{ fb_package_id: fbPackageId, headcount: fbHeadcount }]
                : [],
              bar_selections: barPackageId
                ? [{ bar_package_id: barPackageId, headcount: barHeadcount }]
                : [],
              addon_selections: [],
              coupon_code: null,
            },
          }),
        },
      );

      const json = await res.json();
      if (!res.ok) {
        setQuoteError(json?.error || `Request failed (${res.status})`);
      } else {
        // pricing-api may wrap data in { data } or { result }, or return it directly
        const data = (json?.data ?? json?.result ?? json) as PricingResult;
        setPricing(data);
      }
    } catch (e: unknown) {
      setQuoteError(e instanceof Error ? e.message : "Failed to fetch quote");
    } finally {
      setQuoting(false);
    }
  }

  async function handleCreateDraft() {
    if (!pricing || !courseId) return;
    setDraftLoading(true);
    setDraftError(null);
    setDraftResult(null);

    const { data, error } = await supabase.rpc("create_booking_draft_rpc", {
      p_course_id: courseId,
      p_format_id: formatId,
      p_date: selectedDate,
      p_player_count: playerCount,
      p_notes: "Created via Quick Quote",
      p_conversation_id: null,
      p_fb_selections: fbPackageId
        ? [{ fb_package_id: fbPackageId, headcount: fbHeadcount }]
        : [],
      p_bar_selections: barPackageId
        ? [{ bar_package_id: barPackageId, headcount: barHeadcount }]
        : [],
      p_addon_selections: [],
    });

    if (error) {
      setDraftError(error.message);
    } else {
      const result = data as DraftResult;
      if (result && result.success === false) {
        setDraftError(result.error || result.message || "Failed to create draft");
      } else {
        setDraftResult(result);
      }
    }
    setDraftLoading(false);
  }

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (!user || !courseId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Please log in to use Quick Quote.</p>
      </div>
    );
  }

  const cartFees = pricing?.cart_fees ?? pricing?.cart_cost;

  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-5xl mx-auto px-8 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Quick Quote</h1>
          <p className="text-gray-500">
            Generate a tournament price estimate in seconds.
          </p>
        </div>

        {/* Section 1: Quote Form */}
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Quote Details
          </h2>

          {loadingOptions ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
            </div>
          ) : optionsError ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-700 text-sm">{optionsError}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Player Count */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Player Count <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  value={playerCount || ""}
                  onChange={(e) =>
                    setPlayerCount(parseInt(e.target.value || "0", 10))
                  }
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Format <span className="text-red-500">*</span>
                </label>
                <select
                  value={formatId}
                  onChange={(e) => setFormatId(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">
                    {playerCount > 0 && visibleFormats.length === 0
                      ? "No formats match player count"
                      : "Select a format..."}
                  </option>
                  {visibleFormats.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} ({f.min_players}–{f.max_players} players)
                    </option>
                  ))}
                </select>
              </div>

              {/* Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div />

              {/* F&B Package */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  F&B Package
                </label>
                <select
                  value={fbPackageId}
                  onChange={(e) => {
                    setFbPackageId(e.target.value);
                    if (e.target.value && !fbHeadcount) {
                      setFbHeadcount(playerCount || 0);
                    }
                    if (!e.target.value) setFbHeadcount(0);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">None</option>
                  {fbPackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${p.price_per_person}/pp)
                    </option>
                  ))}
                </select>
                {fbPackageId && (
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      Headcount
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={fbHeadcount || ""}
                      onChange={(e) =>
                        setFbHeadcount(parseInt(e.target.value || "0", 10))
                      }
                      className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}
              </div>

              {/* Bar Package */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bar Package
                </label>
                <select
                  value={barPackageId}
                  onChange={(e) => {
                    setBarPackageId(e.target.value);
                    if (e.target.value && !barHeadcount) {
                      setBarHeadcount(playerCount || 0);
                    }
                    if (!e.target.value) setBarHeadcount(0);
                  }}
                  className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">None</option>
                  {barPackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${p.price_per_person}/pp)
                    </option>
                  ))}
                </select>
                {barPackageId && (
                  <div className="mt-2">
                    <label className="block text-xs text-gray-500 mb-1">
                      Headcount
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={barHeadcount || ""}
                      onChange={(e) =>
                        setBarHeadcount(parseInt(e.target.value || "0", 10))
                      }
                      className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Get Quote */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleGetQuote}
            disabled={!canQuote || quoting}
            className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {quoting && (
              <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
            )}
            {quoting ? "Calculating..." : "Get Quote"}
          </button>
          {quoteError && (
            <span className="text-sm text-red-600">{quoteError}</span>
          )}
        </div>

        {/* Section 3: Quote Result */}
        {pricing && (
          <section className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Pricing Breakdown
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Green Fees</span>
                <span className="text-gray-900">{fmt(pricing.green_fees)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Cart Fees</span>
                <span className="text-gray-900">{fmt(cartFees)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">F&B Total</span>
                <span className="text-gray-900">{fmt(pricing.fb_total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Bar Total</span>
                <span className="text-gray-900">{fmt(pricing.bar_total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Add-on Total</span>
                <span className="text-gray-900">
                  {fmt(pricing.addon_total)}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 mt-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">
                    {fmt(pricing.pre_tax_total ?? pricing.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">
                    HST{" "}
                    {pricing.hst_rate != null
                      ? `(${Math.round(pricing.hst_rate * 100)}%)`
                      : ""}
                  </span>
                  <span className="text-gray-900">{fmt(pricing.hst)}</span>
                </div>
                <div className="flex justify-between pt-2 mt-2 border-t border-gray-300">
                  <span className="text-lg font-bold text-gray-900">Total</span>
                  <span className="text-lg font-bold text-gray-900">
                    {fmt(pricing.total)}
                  </span>
                </div>
              </div>

              {pricing.displacement_floor &&
                pricing.displacement_floor.floor_amount !== 0 && (
                  <div className="pt-2 mt-2 border-t border-gray-200 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Displacement Floor</span>
                      <span className="text-gray-700">
                        {fmt(pricing.displacement_floor.floor_amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Displacement Cost</span>
                      <span className="text-gray-700">
                        {fmt(pricing.displacement_floor.displacement_cost)}
                      </span>
                    </div>
                  </div>
                )}
            </div>
          </section>
        )}

        {/* Section 4: Convert to Draft */}
        {pricing && (
          <div className="space-y-3">
            {!draftResult && (
              <button
                onClick={handleCreateDraft}
                disabled={draftLoading}
                className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
              >
                {draftLoading && (
                  <span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                )}
                {draftLoading ? "Creating draft..." : "Create Booking Draft"}
              </button>
            )}

            {draftError && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-700">{draftError}</p>
              </div>
            )}

            {draftResult && draftResult.booking_id && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between">
                <p className="text-sm text-emerald-800">
                  Draft created! Booking ID:{" "}
                  <span className="font-mono font-semibold">
                    {draftResult.booking_id}
                  </span>
                </p>
                <Link
                  href={`/?booking=${draftResult.booking_id}`}
                  className="text-sm font-semibold text-emerald-700 hover:text-emerald-900 underline"
                >
                  View on dashboard
                </Link>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
