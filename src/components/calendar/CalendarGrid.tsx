"use client";

import { useMemo } from "react";
import type { CalendarBooking, DateBlock } from "@/app/calendar/page";

interface CalendarGridProps {
  year: number;
  month: number; // 0-indexed
  bookings: CalendarBooking[];
  blocks: DateBlock[];
  onSelectDate: (dateString: string) => void;
}

const DAY_HEADERS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateString(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

export default function CalendarGrid({
  year,
  month,
  bookings,
  blocks,
  onSelectDate,
}: CalendarGridProps) {
  const todayString = useMemo(() => {
    const d = new Date();
    return toDateString(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const cells = useMemo(() => {
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const items: Array<{ day: number | null; dateString: string | null }> = [];

    for (let i = 0; i < startWeekday; i++) {
      items.push({ day: null, dateString: null });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      items.push({ day: d, dateString: toDateString(year, month, d) });
    }
    while (items.length % 7 !== 0) {
      items.push({ day: null, dateString: null });
    }
    return items;
  }, [year, month]);

  const bookingsByDate = useMemo(() => {
    const map = new Map<string, CalendarBooking[]>();
    for (const b of bookings) {
      const list = map.get(b.date) ?? [];
      list.push(b);
      map.set(b.date, list);
    }
    return map;
  }, [bookings]);

  const blocksByDate = useMemo(() => {
    const map = new Map<string, DateBlock>();
    for (const b of blocks) {
      map.set(b.date, b);
    }
    return map;
  }, [blocks]);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {DAY_HEADERS.map((day) => (
          <div
            key={day}
            className="px-2 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
          >
            {day}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          if (cell.day === null || cell.dateString === null) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[120px] border-b border-r border-gray-100 bg-gray-50"
              />
            );
          }

          const dateString = cell.dateString;
          const dayBookings = bookingsByDate.get(dateString) ?? [];
          const block = blocksByDate.get(dateString);
          const isToday = dateString === todayString;
          const isPast = dateString < todayString;

          let bgClass = "bg-white hover:bg-gray-50";
          if (block) {
            bgClass = "bg-red-50 hover:bg-red-100";
          } else if (dayBookings.length > 0) {
            bgClass = "bg-green-50 hover:bg-green-100";
          }

          const borderClass = isToday
            ? "border-2 border-green-600"
            : "border-b border-r border-gray-100";

          return (
            <button
              key={dateString}
              type="button"
              onClick={() => onSelectDate(dateString)}
              className={`min-h-[120px] p-2 text-left transition ${bgClass} ${borderClass} ${
                isPast ? "opacity-60" : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`text-sm font-medium ${
                    isToday ? "text-green-700" : "text-gray-900"
                  }`}
                >
                  {cell.day}
                </span>
                {dayBookings.length > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-green-600 text-white text-xs font-bold">
                    {dayBookings.length}
                  </span>
                )}
              </div>
              {block && (
                <div className="mt-1 inline-block px-1.5 py-0.5 rounded bg-red-200 text-red-800 text-[10px] font-semibold">
                  Blocked
                </div>
              )}
              {!block && dayBookings.length > 0 && (
                <div className="mt-1 space-y-0.5">
                  {dayBookings.slice(0, 2).map((b) => (
                    <div
                      key={b.id}
                      className="text-[10px] text-green-800 truncate"
                    >
                      {b.tournament_formats?.name ?? "Booking"}
                    </div>
                  ))}
                  {dayBookings.length > 2 && (
                    <div className="text-[10px] text-gray-500">
                      +{dayBookings.length - 2} more
                    </div>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
