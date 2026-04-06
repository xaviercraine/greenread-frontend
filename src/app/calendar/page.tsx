"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import NavBar from "@/components/NavBar";
import CalendarGrid from "@/components/calendar/CalendarGrid";
import DatePopover from "@/components/calendar/DatePopover";
import PipelineView from "@/components/calendar/PipelineView";

export interface CalendarBooking {
  id: string;
  date: string;
  status: string;
  player_count: number;
  tournament_formats: { name: string } | null;
}

export interface PipelineBooking extends CalendarBooking {
  notes: string | null;
}

export interface DateBlock {
  id: string;
  course_id: string;
  date: string;
  block_type: string;
  reason: string | null;
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

export default function CalendarPage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  const today = useMemo(() => new Date(), []);
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
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

  const fetchCalendarData = useCallback(async () => {
    if (!courseId) return;
    setCalLoading(true);
    setCalError(null);
    try {
      const { start, end } = monthRange(year, month);

      const { data: bookingsData, error: bookingsErr } = await supabase
        .from("bookings")
        .select(
          "id, date, status, player_count, tournament_formats(name)"
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
      const { data, error } = await supabase
        .from("bookings")
        .select(
          "id, date, status, player_count, notes, tournament_formats(name)"
        )
        .eq("course_id", courseId)
        .neq("status", "cancelled")
        .order("date");
      if (error) throw error;
      setPipelineBookings((data ?? []) as unknown as PipelineBooking[]);
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
