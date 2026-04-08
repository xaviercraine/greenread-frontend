"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";
import {
  useBookingWindow,
  bookingWindowStatus,
  bookingWindowTooltip,
} from "@/lib/useBookingWindow";

type AvailableDate = {
  available_date: string;
  date_day_type: string;
  carts_needed: number;
  carts_remaining: number;
  warnings: string | null;
};

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getDayTypeStyles(dayType: string): string {
  switch (dayType) {
    case "weekend":
      return "bg-blue-50";
    case "holiday":
      return "bg-amber-50";
    default:
      return "bg-white";
  }
}

export default function Screen2Dates({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();
  const bookingWindow = useBookingWindow(courseId);

  const [dates, setDates] = useState<AvailableDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedInfo = dates.find((d) => d.available_date === state.selectedDate) ?? null;

  useEffect(() => {
    fetchDates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.month, state.year, state.playerCount, state.formatId]);

  async function fetchDates() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase.rpc("get_available_dates", {
      p_course_id: courseId,
      p_month: state.month,
      p_year: state.year,
      p_player_count: state.playerCount,
      p_format_id: state.formatId,
    });

    if (err) {
      setError(err.message);
    } else {
      setDates(data ?? []);
    }
    setLoading(false);
  }

  // Build calendar grid
  const availableDateSet = useMemo(() => {
    const map = new Map<string, AvailableDate>();
    for (const d of dates) {
      map.set(d.available_date, d);
    }
    return map;
  }, [dates]);

  const calendarCells = useMemo(() => {
    const firstDay = new Date(state.year, state.month - 1, 1);
    const daysInMonth = new Date(state.year, state.month, 0).getDate();
    const startDow = firstDay.getDay(); // 0=Sun

    const cells: Array<{ day: number | null; dateStr: string | null }> = [];

    // Leading blanks
    for (let i = 0; i < startDow; i++) {
      cells.push({ day: null, dateStr: null });
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const mm = String(state.month).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      cells.push({ day: d, dateStr: `${state.year}-${mm}-${dd}` });
    }

    return cells;
  }, [state.month, state.year]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 mb-4">{error}</p>
        <button
          onClick={fetchDates}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Select a Date</h2>
        <p className="text-gray-500">
          Available dates for {MONTH_NAMES[state.month]} {state.year}
        </p>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-6 text-sm text-gray-600">
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded border border-gray-200 bg-white inline-block" />
          Weekday
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded border border-blue-200 bg-blue-50 inline-block" />
          Weekend
        </span>
        <span className="flex items-center gap-2">
          <span className="w-4 h-4 rounded border border-amber-200 bg-amber-50 inline-block" />
          Holiday
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />
          Has warnings
        </span>
      </div>

      {/* Calendar Grid */}
      <div className="max-w-xl">
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DAY_HEADERS.map((h) => (
            <div key={h} className="text-center text-xs font-semibold text-gray-500 py-2">
              {h}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {calendarCells.map((cell, idx) => {
            if (cell.day === null) {
              return <div key={idx} className="h-14" />;
            }

            const info = cell.dateStr ? availableDateSet.get(cell.dateStr) : null;
            const windowStatus = cell.dateStr
              ? bookingWindowStatus(cell.dateStr, bookingWindow)
              : "ok";
            const isOutsideWindow = windowStatus !== "ok";
            const isAvailable = !!info && !isOutsideWindow;
            const isSelected = cell.dateStr === state.selectedDate;
            const windowTooltip = bookingWindowTooltip(windowStatus, bookingWindow);

            return (
              <button
                key={idx}
                disabled={!isAvailable}
                title={windowTooltip}
                onClick={() => {
                  if (cell.dateStr) dispatch({ type: "SET_DATE", date: cell.dateStr });
                }}
                className={`relative h-14 rounded-lg text-sm font-medium transition-colors ${
                  isOutsideWindow
                    ? "bg-gray-100 text-gray-400 opacity-50 cursor-not-allowed border border-gray-200"
                    : !isAvailable
                    ? "bg-gray-100 text-gray-300 cursor-not-allowed"
                    : isSelected
                    ? "border-2 border-green-600 ring-2 ring-green-200 " + getDayTypeStyles(info!.date_day_type)
                    : "border border-gray-200 hover:border-gray-400 " + getDayTypeStyles(info!.date_day_type)
                }`}
              >
                {cell.day}
                {info?.warnings && !isOutsideWindow && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-yellow-500" />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Date Details */}
      {selectedInfo && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-5 max-w-xl">
          <h3 className="font-semibold text-gray-900 mb-3">
            {state.selectedDate} — {selectedInfo.date_day_type}
          </h3>
          <div className="space-y-1 text-sm text-gray-600">
            <p>Carts needed: {selectedInfo.carts_needed}</p>
            <p>Carts remaining: {selectedInfo.carts_remaining}</p>
            {selectedInfo.warnings && (
              <p className="text-yellow-700 bg-yellow-50 rounded px-2 py-1 mt-2">
                ⚠ {selectedInfo.warnings}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 1 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
        <button
          disabled={!state.selectedDate}
          onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
