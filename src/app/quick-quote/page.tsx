"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import NumberInput from "@/components/common/NumberInput";

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

type Addon = {
  id: string;
  name: string;
  pricing_type: string;
  price: number;
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

type BookedDate = {
  date: string;
  status: string;
};

type DotColor = "green" | "yellow";

const GREEN_STATUSES = new Set([
  "confirmed",
  "deposit_paid",
  "balance_paid",
]);

function fmt(n: number | null | undefined): string {
  if (n == null) return "$0.00";
  return `$${Number(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseYmd(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

function formatSelected(s: string): string {
  return parseYmd(s).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatMonthHeader(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

const MONTH_DAYS_HEADER = ["S", "M", "T", "W", "T", "F", "S"];

function MiniCalendar({
  seasonStart,
  seasonEnd,
  bookedDates,
  selectedDate,
  onSelect,
}: {
  seasonStart: string | null;
  seasonEnd: string | null;
  bookedDates: Map<string, DotColor>;
  selectedDate: string;
  onSelect: (d: string) => void;
}) {
  const today = useMemo(() => {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  const seasonStartDate = seasonStart ? parseYmd(seasonStart) : null;
  const seasonEndDate = seasonEnd ? parseYmd(seasonEnd) : null;

  const initialMonth = useMemo(() => {
    const cur = startOfMonth(today);
    if (seasonStartDate && cur < startOfMonth(seasonStartDate)) {
      return startOfMonth(seasonStartDate);
    }
    if (seasonEndDate && cur > startOfMonth(seasonEndDate)) {
      return startOfMonth(seasonEndDate);
    }
    return cur;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today.getTime(), seasonStart, seasonEnd]);

  const [visibleMonth, setVisibleMonth] = useState<Date>(initialMonth);

  useEffect(() => {
    setVisibleMonth(initialMonth);
  }, [initialMonth]);

  const canPrev =
    !seasonStartDate ||
    addMonths(visibleMonth, -1) >= startOfMonth(seasonStartDate);
  const canNext =
    !seasonEndDate ||
    addMonths(visibleMonth, 1) <= startOfMonth(seasonEndDate);

  // Build the grid
  const firstOfMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth(),
    1,
  );
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const leadingBlanks = firstOfMonth.getDay();

  const cells: Array<Date | null> = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), d));
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => canPrev && setVisibleMonth(addMonths(visibleMonth, -1))}
          disabled={!canPrev}
          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="text-sm font-semibold text-gray-900">
          {formatMonthHeader(visibleMonth)}
        </div>
        <button
          type="button"
          onClick={() => canNext && setVisibleMonth(addMonths(visibleMonth, 1))}
          disabled={!canNext}
          className="w-8 h-8 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {MONTH_DAYS_HEADER.map((h, i) => (
          <div
            key={i}
            className="text-center text-[10px] font-semibold text-gray-400 uppercase py-1"
          >
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={idx} className="h-10" />;

          const dateStr = ymd(cell);
          const inSeason =
            (!seasonStartDate || cell >= seasonStartDate) &&
            (!seasonEndDate || cell <= seasonEndDate);
          const isPast = cell < today;
          const isSelected = dateStr === selectedDate;
          const isToday = cell.getTime() === today.getTime();
          const dot = bookedDates.get(dateStr);

          const disabled = !inSeason || isPast;

          let cls =
            "relative h-10 flex flex-col items-center justify-center rounded-md text-sm transition-colors ";
          if (disabled) {
            cls += "text-gray-300 cursor-not-allowed ";
          } else if (isSelected) {
            cls += "bg-green-600 text-white font-semibold ";
          } else {
            cls +=
              "text-gray-900 hover:bg-green-50 cursor-pointer " +
              (isToday ? "ring-1 ring-green-500 " : "");
          }

          return (
            <button
              key={idx}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(dateStr)}
              className={cls}
            >
              <span className="leading-none">{cell.getDate()}</span>
              {dot && !disabled && (
                <span
                  className={
                    "mt-0.5 w-1.5 h-1.5 rounded-full " +
                    (dot === "green"
                      ? isSelected
                        ? "bg-white"
                        : "bg-green-500"
                      : isSelected
                        ? "bg-white"
                        : "bg-yellow-400")
                  }
                />
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-4 text-[11px] text-gray-500">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span>Confirmed</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
          <span>Draft</span>
        </div>
      </div>
    </div>
  );
}

function CollapsibleSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-semibold text-gray-900">{title}</span>
        <span className="text-gray-400 text-sm">{open ? "▾" : "▸"}</span>
      </button>
      {open && <div className="p-4 space-y-3">{children}</div>}
    </div>
  );
}

export default function QuickQuotePage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [fbPackages, setFbPackages] = useState<FBPackage[]>([]);
  const [barPackages, setBarPackages] = useState<BarPackage[]>([]);
  const [addons, setAddons] = useState<Addon[]>([]);
  const [seasonStart, setSeasonStart] = useState<string | null>(null);
  const [seasonEnd, setSeasonEnd] = useState<string | null>(null);
  const [bookedDates, setBookedDates] = useState<Map<string, DotColor>>(
    new Map(),
  );
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);

  // Form state
  const [playerCount, setPlayerCount] = useState<number>(0);
  const [formatId, setFormatId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");

  // Multi-select selections: id -> headcount/quantity
  const [fbSelections, setFbSelections] = useState<Record<string, number>>({});
  const [barSelections, setBarSelections] = useState<Record<string, number>>(
    {},
  );
  const [addonSelections, setAddonSelections] = useState<
    Record<string, number>
  >({});

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
      const [fmtRes, fbRes, barRes, addonRes, courseRes, bookingsRes] =
        await Promise.all([
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
          supabase
            .from("addons")
            .select("id, name, pricing_type, price")
            .eq("course_id", courseId)
            .order("name"),
          supabase
            .from("courses")
            .select("season_start, season_end")
            .eq("id", courseId)
            .single(),
          supabase
            .from("bookings")
            .select("date, status")
            .eq("course_id", courseId)
            .neq("status", "cancelled"),
        ]);
      if (cancelled) return;
      const err =
        fmtRes.error ||
        fbRes.error ||
        barRes.error ||
        addonRes.error ||
        courseRes.error ||
        bookingsRes.error;
      if (err) {
        setOptionsError(err.message);
      } else {
        setFormats(fmtRes.data ?? []);
        setFbPackages(fbRes.data ?? []);
        setBarPackages(barRes.data ?? []);
        setAddons(addonRes.data ?? []);
        setSeasonStart(courseRes.data?.season_start ?? null);
        setSeasonEnd(courseRes.data?.season_end ?? null);

        const dateMap = new Map<string, DotColor>();
        for (const b of (bookingsRes.data ?? []) as BookedDate[]) {
          if (!b.date) continue;
          const isGreen = GREEN_STATUSES.has(b.status);
          const existing = dateMap.get(b.date);
          // Green takes priority over yellow
          if (existing === "green") continue;
          dateMap.set(b.date, isGreen ? "green" : "yellow");
        }
        setBookedDates(dateMap);
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

  function toggleFb(id: string) {
    setFbSelections((prev) => {
      const next = { ...prev };
      if (id in next) {
        delete next[id];
      } else {
        next[id] = playerCount || 1;
      }
      return next;
    });
  }
  function setFbHeadcount(id: string, n: number) {
    setFbSelections((prev) => ({ ...prev, [id]: n }));
  }

  function toggleBar(id: string) {
    setBarSelections((prev) => {
      const next = { ...prev };
      if (id in next) {
        delete next[id];
      } else {
        next[id] = playerCount || 1;
      }
      return next;
    });
  }
  function setBarHeadcount(id: string, n: number) {
    setBarSelections((prev) => ({ ...prev, [id]: n }));
  }

  function toggleAddon(id: string, pricingType: string) {
    setAddonSelections((prev) => {
      const next = { ...prev };
      if (id in next) {
        delete next[id];
      } else {
        next[id] = pricingType === "per_person" ? playerCount || 1 : 1;
      }
      return next;
    });
  }
  function setAddonQuantity(id: string, n: number) {
    setAddonSelections((prev) => ({ ...prev, [id]: n }));
  }

  // Build payload arrays
  const fbPayload = useMemo(
    () =>
      Object.entries(fbSelections)
        .filter(([, h]) => h > 0)
        .map(([fb_package_id, headcount]) => ({ fb_package_id, headcount })),
    [fbSelections],
  );
  const barPayload = useMemo(
    () =>
      Object.entries(barSelections)
        .filter(([, h]) => h > 0)
        .map(([bar_package_id, headcount]) => ({ bar_package_id, headcount })),
    [barSelections],
  );
  const addonPayload = useMemo(
    () =>
      Object.entries(addonSelections)
        .filter(([, q]) => q > 0)
        .map(([addon_id, quantity]) => ({ addon_id, quantity })),
    [addonSelections],
  );

  const allFbValid = Object.entries(fbSelections).every(([, h]) => h > 0);
  const allBarValid = Object.entries(barSelections).every(([, h]) => h > 0);
  const allAddonValid = Object.entries(addonSelections).every(([, q]) => q > 0);

  const canQuote =
    !!courseId &&
    playerCount > 0 &&
    !!formatId &&
    !!selectedDate &&
    allFbValid &&
    allBarValid &&
    allAddonValid;

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
              fb_selections: fbPayload,
              bar_selections: barPayload,
              addon_selections: addonPayload,
              coupon_code: null,
            },
          }),
        },
      );

      const json = await res.json();
      if (!res.ok) {
        setQuoteError(json?.error || `Request failed (${res.status})`);
      } else {
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
      p_fb_selections: fbPayload,
      p_bar_selections: barPayload,
      p_addon_selections: addonPayload,
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
            <div className="space-y-5">
              {/* Player Count + Format */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Player Count <span className="text-red-500">*</span>
                  </label>
                  <NumberInput
                    integer
                    min={1}
                    max={300}
                    value={playerCount}
                    onChange={setPlayerCount}
                    className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <p className="text-xs text-gray-400 mt-1">max 300</p>
                </div>

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
              </div>

              {/* Date Calendar */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date <span className="text-red-500">*</span>
                </label>
                <MiniCalendar
                  seasonStart={seasonStart}
                  seasonEnd={seasonEnd}
                  bookedDates={bookedDates}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                />
                <p className="mt-2 text-sm text-gray-600">
                  {selectedDate ? (
                    <>
                      <span className="text-gray-500">Selected:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {formatSelected(selectedDate)}
                      </span>
                    </>
                  ) : (
                    <span className="text-gray-400">No date selected</span>
                  )}
                </p>
              </div>

              {/* F&B Section */}
              <CollapsibleSection title="Food & Beverage">
                {fbPackages.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No F&B packages configured.
                  </p>
                ) : (
                  fbPackages.map((p) => {
                    const checked = p.id in fbSelections;
                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleFb(p.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            ${p.price_per_person}/pp
                          </div>
                          {checked && (
                            <div className="mt-2">
                              <label className="block text-xs text-gray-500 mb-1">
                                Headcount
                              </label>
                              <NumberInput
                                integer
                                min={1}
                                max={playerCount || 300}
                                value={fbSelections[p.id] ?? 0}
                                onChange={(n) => setFbHeadcount(p.id, n)}
                                className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <p className="text-xs text-gray-400 mt-1">
                                max {playerCount || 300}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CollapsibleSection>

              {/* Bar Section */}
              <CollapsibleSection title="Bar Packages">
                {barPackages.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    No bar packages configured.
                  </p>
                ) : (
                  barPackages.map((p) => {
                    const checked = p.id in barSelections;
                    return (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleBar(p.id)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {p.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            ${p.price_per_person}/pp
                          </div>
                          {checked && (
                            <div className="mt-2">
                              <label className="block text-xs text-gray-500 mb-1">
                                Headcount
                              </label>
                              <NumberInput
                                integer
                                min={1}
                                max={playerCount || 300}
                                value={barSelections[p.id] ?? 0}
                                onChange={(n) => setBarHeadcount(p.id, n)}
                                className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <p className="text-xs text-gray-400 mt-1">
                                max {playerCount || 300}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CollapsibleSection>

              {/* Add-ons Section */}
              <CollapsibleSection title="Add-ons">
                {addons.length === 0 ? (
                  <p className="text-sm text-gray-400">No add-ons configured.</p>
                ) : (
                  addons.map((a) => {
                    const checked = a.id in addonSelections;
                    const isPerPerson = a.pricing_type === "per_person";
                    const max = isPerPerson ? playerCount || 300 : 99;
                    return (
                      <div
                        key={a.id}
                        className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleAddon(a.id, a.pricing_type)}
                          className="mt-1 h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900">
                            {a.name}
                          </div>
                          <div className="text-xs text-gray-500">
                            ${a.price}{" "}
                            <span className="text-gray-400">
                              ({a.pricing_type})
                            </span>
                          </div>
                          {checked && (
                            <div className="mt-2">
                              <label className="block text-xs text-gray-500 mb-1">
                                {isPerPerson ? "Qty (per person)" : "Qty"}
                              </label>
                              <NumberInput
                                integer
                                min={1}
                                max={max}
                                value={addonSelections[a.id] ?? 0}
                                onChange={(n) => setAddonQuantity(a.id, n)}
                                className="w-32 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
                              />
                              <p className="text-xs text-gray-400 mt-1">
                                max {max}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CollapsibleSection>
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
