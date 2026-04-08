"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import DatePopover from "@/components/calendar/DatePopover";
import PipelineView from "@/components/calendar/PipelineView";

export interface CalendarBooking {
  id: string;
  date: string;
  status: string;
  player_count: number;
  carts_allocated: number | null;
  tournament_formats: { name: string } | null;
}

export interface PipelineBooking extends CalendarBooking {
  notes: string | null;
  created_at: string;
  status_changed_at: string | null;
  total_amount: number | null;
}

export interface DateBlock {
  id: string;
  course_id: string;
  date: string;
  block_type: string;
  reason: string | null;
}

export interface NineRow {
  id: string;
  name: string;
  sort_order: number | null;
}

export interface EventSpaceRow {
  id: string;
  name: string;
}

export interface DateInventory {
  nines: { available: NineRow[]; allocated: NineRow[] };
  spaces: { available: EventSpaceRow[]; allocated: EventSpaceRow[] };
  carts: { allocated: number; total: number };
}

type ViewMode = "calendar" | "pipeline";

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

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function monthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${pad(month + 1)}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const end = `${year}-${pad(month + 1)}-${pad(lastDay)}`;
  return { start, end };
}

function CalendarPageInner() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const searchParams = useSearchParams();
  const initialView: ViewMode =
    searchParams?.get("view") === "pipeline" ? "pipeline" : "calendar";

  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState<ViewMode>(initialView);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  // Calendar data
  const [bookings, setBookings] = useState<CalendarBooking[]>([]);
  const [blocks, setBlocks] = useState<DateBlock[]>([]);
  const [calLoading, setCalLoading] = useState(true);
  const [calError, setCalError] = useState<string | null>(null);

  // Pipeline data
  const [pipelineBookings, setPipelineBookings] = useState<PipelineBooking[]>(
    []
  );
  const [pipeLoading, setPipeLoading] = useState(false);
  const [pipeError, setPipeError] = useState<string | null>(null);

  // Selection / popover
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Course resources (fetched once per course)
  const [allNines, setAllNines] = useState<NineRow[]>([]);
  const [allSpaces, setAllSpaces] = useState<EventSpaceRow[]>([]);
  const [totalCarts, setTotalCarts] = useState<number>(0);

  // Per-date allocations (booking_nines / booking_event_spaces)
  const [allocatedNineIds, setAllocatedNineIds] = useState<Set<string>>(
    new Set()
  );
  const [allocatedSpaceIds, setAllocatedSpaceIds] = useState<Set<string>>(
    new Set()
  );
  const [inventoryLoading, setInventoryLoading] = useState(false);

  const fetchCalendarData = useCallback(async () => {
    if (!courseId) return;
    setCalLoading(true);
    setCalError(null);
    try {
      const { start, end } = monthRange(year, month);

      const { data: bookingsData, error: bookingsErr } = await supabase
        .from("bookings")
        .select(
          "id, date, status, player_count, carts_allocated, tournament_formats(name)"
        )
        .eq("course_id", courseId)
        .gte("date", start)
        .lte("date", end)
        .neq("status", "cancelled")
        .order("date");
      if (bookingsErr) throw bookingsErr;

      const { data: blocksData, error: blocksErr } = await supabase
        .from("date_blocks")
        .select("*")
        .eq("course_id", courseId)
        .gte("date", start)
        .lte("date", end);
      if (blocksErr) throw blocksErr;

      setBookings((bookingsData ?? []) as unknown as CalendarBooking[]);
      setBlocks((blocksData ?? []) as DateBlock[]);
    } catch (err) {
      setCalError(
        err instanceof Error ? err.message : "Failed to load calendar"
      );
    } finally {
      setCalLoading(false);
    }
  }, [courseId, supabase, year, month]);

  const fetchBlocksOnly = useCallback(async () => {
    if (!courseId) return;
    const { start, end } = monthRange(year, month);
    const { data, error } = await supabase
      .from("date_blocks")
      .select("*")
      .eq("course_id", courseId)
      .gte("date", start)
      .lte("date", end);
    if (error) throw error;
    setBlocks((data ?? []) as DateBlock[]);
  }, [courseId, supabase, year, month]);

  const fetchPipelineData = useCallback(async () => {
    if (!courseId) return;
    setPipeLoading(true);
    setPipeError(null);
    try {
      const { data: bookingRows, error } = await supabase
        .from("bookings")
        .select(
          "id, date, status, player_count, carts_allocated, notes, created_at, status_changed_at, tournament_formats(name)"
        )
        .eq("course_id", courseId)
        .order("date");
      if (error) throw error;

      const bookings = (bookingRows ?? []) as unknown as Array<
        Omit<PipelineBooking, "total_amount">
      >;

      // Fetch latest pricing snapshot total per booking
      const totalsByBooking = new Map<string, number>();
      if (bookings.length > 0) {
        const { data: snapshots, error: snapErr } = await supabase
          .from("pricing_snapshots")
          .select("booking_id, snapshot, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false });
        if (snapErr) throw snapErr;
        const bookingIds = new Set(bookings.map((b) => b.id));
        for (const s of (snapshots ?? []) as Array<{
          booking_id: string;
          snapshot: { total?: number } | null;
          created_at: string;
        }>) {
          if (!bookingIds.has(s.booking_id)) continue;
          if (totalsByBooking.has(s.booking_id)) continue;
          const total = s.snapshot?.total;
          totalsByBooking.set(
            s.booking_id,
            typeof total === "number" ? total : 0
          );
        }
      }

      const enriched: PipelineBooking[] = bookings.map((b) => ({
        ...b,
        total_amount: totalsByBooking.get(b.id) ?? null,
      }));
      setPipelineBookings(enriched);
    } catch (err) {
      setPipeError(
        err instanceof Error ? err.message : "Failed to load pipeline"
      );
    } finally {
      setPipeLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId && viewMode === "calendar") {
      fetchCalendarData();
    }
  }, [authLoading, courseId, viewMode, fetchCalendarData]);

  // Fetch course resources (nines, event_spaces, total_carts) once per course
  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      const [ninesRes, spacesRes, courseRes] = await Promise.all([
        supabase
          .from("nines")
          .select("id, name, sort_order")
          .eq("course_id", courseId)
          .order("sort_order"),
        supabase
          .from("event_spaces")
          .select("id, name")
          .eq("course_id", courseId)
          .order("name"),
        supabase
          .from("courses")
          .select("total_carts")
          .eq("id", courseId)
          .single(),
      ]);
      if (cancelled) return;
      setAllNines((ninesRes.data ?? []) as NineRow[]);
      setAllSpaces((spacesRes.data ?? []) as EventSpaceRow[]);
      setTotalCarts((courseRes.data?.total_carts as number | undefined) ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, supabase]);

  // Fetch per-date allocations when a date is selected
  useEffect(() => {
    if (!selectedDate || !courseId) {
      setAllocatedNineIds(new Set());
      setAllocatedSpaceIds(new Set());
      return;
    }
    let cancelled = false;
    setInventoryLoading(true);
    (async () => {
      try {
        // Step 1: get booking IDs for this course/date that aren't cancelled
        const { data: bookingRows } = await supabase
          .from("bookings")
          .select("id")
          .eq("course_id", courseId)
          .eq("date", selectedDate)
          .neq("status", "cancelled");
        if (cancelled) return;
        const bookingIds = (bookingRows ?? []).map((r) => r.id as string);

        if (bookingIds.length === 0) {
          setAllocatedNineIds(new Set());
          setAllocatedSpaceIds(new Set());
          return;
        }

        // Step 2: fetch allocations using simple .in() filter
        const [bnRes, besRes] = await Promise.all([
          supabase
            .from("booking_nines")
            .select("nine_id")
            .in("booking_id", bookingIds),
          supabase
            .from("booking_event_spaces")
            .select("space_id")
            .in("booking_id", bookingIds),
        ]);
        if (cancelled) return;
        const nineIds = new Set<string>(
          ((bnRes.data ?? []) as Array<{ nine_id: string }>).map(
            (r) => r.nine_id
          )
        );
        const spaceIds = new Set<string>(
          ((besRes.data ?? []) as Array<{ space_id: string }>).map(
            (r) => r.space_id
          )
        );
        setAllocatedNineIds(nineIds);
        setAllocatedSpaceIds(spaceIds);
      } finally {
        if (!cancelled) setInventoryLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedDate, courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId && viewMode === "pipeline") {
      fetchPipelineData();
    }
  }, [authLoading, courseId, viewMode, fetchPipelineData]);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
  };

  const handleBlock = async () => {
    if (!selectedDate || !courseId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc("toggle_date_block", {
        p_course_id: courseId,
        p_block_date: selectedDate,
        p_block_type: "blocked",
        p_reason: "Manually blocked",
      });
      if (error) throw error;
      await fetchBlocksOnly();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to block date"
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleUnblock = async () => {
    if (!selectedDate || !courseId) return;
    setActionBusy(true);
    setActionError(null);
    try {
      const { error } = await supabase.rpc("toggle_date_block", {
        p_course_id: courseId,
        p_block_date: selectedDate,
      });
      if (error) throw error;
      await fetchBlocksOnly();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Failed to unblock date"
      );
    } finally {
      setActionBusy(false);
    }
  };

  const handleSelectDate = (dateString: string) => {
    setActionError(null);
    setSelectedDate(dateString);
  };

  const handleClosePopover = () => {
    setSelectedDate(null);
    setActionError(null);
  };

  const selectedDateBookings = useMemo(() => {
    if (!selectedDate) return [];
    return bookings.filter((b) => b.date === selectedDate);
  }, [bookings, selectedDate]);

  const selectedDateBlock = useMemo(() => {
    if (!selectedDate) return null;
    return blocks.find((b) => b.date === selectedDate) ?? null;
  }, [blocks, selectedDate]);

  const selectedDateInventory = useMemo<DateInventory | null>(() => {
    if (!selectedDate) return null;
    const cartsAllocated = selectedDateBookings
      .filter(
        (b) => b.status !== "cancelled" && b.status !== "completed"
      )
      .reduce((sum, b) => sum + (b.carts_allocated ?? 0), 0);
    return {
      nines: {
        available: allNines.filter((n) => !allocatedNineIds.has(n.id)),
        allocated: allNines.filter((n) => allocatedNineIds.has(n.id)),
      },
      spaces: {
        available: allSpaces.filter((s) => !allocatedSpaceIds.has(s.id)),
        allocated: allSpaces.filter((s) => allocatedSpaceIds.has(s.id)),
      },
      carts: { allocated: cartsAllocated, total: totalCarts },
    };
  }, [
    selectedDate,
    selectedDateBookings,
    allNines,
    allSpaces,
    allocatedNineIds,
    allocatedSpaceIds,
    totalCarts,
  ]);

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
        {/* View toggle */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Calendar</h1>
          <div className="inline-flex rounded-md shadow-sm border border-gray-300 overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("calendar")}
              className={`px-4 py-2 text-sm font-medium ${
                viewMode === "calendar"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Calendar
            </button>
            <button
              type="button"
              onClick={() => setViewMode("pipeline")}
              className={`px-4 py-2 text-sm font-medium border-l border-gray-300 ${
                viewMode === "pipeline"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              Pipeline
            </button>
          </div>
        </div>

        {viewMode === "calendar" ? (
          <>
            {/* Month nav */}
            <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700"
                  aria-label="Previous month"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 text-gray-700"
                  aria-label="Next month"
                >
                  →
                </button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="ml-2 px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 text-sm font-medium text-gray-700"
                >
                  Today
                </button>
              </div>
              <h2 className="text-xl font-semibold text-gray-900">
                {MONTH_NAMES[month]} {year}
              </h2>
              <div className="w-[200px]" />
            </div>

            {calLoading ? (
              <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
              </div>
            ) : calError ? (
              <div className="bg-white rounded-lg shadow p-6">
                <div className="text-sm text-red-700 mb-3">{calError}</div>
                <button
                  type="button"
                  onClick={fetchCalendarData}
                  className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
                >
                  Retry
                </button>
              </div>
            ) : (
              <CalendarGrid
                year={year}
                month={month}
                bookings={bookings}
                blocks={blocks}
                onSelectDate={handleSelectDate}
              />
            )}
          </>
        ) : (
          <PipelineView
            bookings={pipelineBookings}
            loading={pipeLoading}
            error={pipeError}
            onRetry={fetchPipelineData}
          />
        )}
      </main>

      {selectedDate && (
        <DatePopover
          dateString={selectedDate}
          bookings={selectedDateBookings}
          block={selectedDateBlock}
          inventory={selectedDateInventory}
          inventoryLoading={inventoryLoading}
          busy={actionBusy}
          error={actionError}
          onClose={handleClosePopover}
          onBlock={handleBlock}
          onUnblock={handleUnblock}
        />
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
        </div>
      }
    >
      <CalendarPageInner />
    </Suspense>
  );
}
