"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const DEFAULT_MIN_BOOKING_NOTICE_DAYS = 14;
export const DEFAULT_MAX_ADVANCE_BOOKING_DAYS = 548;

export type BookingWindow = {
  minDays: number;
  maxDays: number;
};

export type BookingWindowStatus = "ok" | "too_soon" | "too_far";

export function daysFromToday(dateStr: string): number {
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return 0;
  const [y, m, d] = parts;
  const target = new Date(y, m - 1, d);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

export function bookingWindowStatus(
  dateStr: string,
  window: BookingWindow,
): BookingWindowStatus {
  const diff = daysFromToday(dateStr);
  if (diff < window.minDays) return "too_soon";
  if (diff > window.maxDays) return "too_far";
  return "ok";
}

export function bookingWindowTooltip(
  status: BookingWindowStatus,
  window: BookingWindow,
): string | undefined {
  if (status === "too_soon") {
    return `Minimum ${window.minDays} days notice required`;
  }
  if (status === "too_far") {
    return `Bookings available up to ${window.maxDays} days in advance`;
  }
  return undefined;
}

export function useBookingWindow(courseId: string | null | undefined): BookingWindow {
  const supabase = useMemo(() => createClient(), []);
  const [window, setWindow] = useState<BookingWindow>({
    minDays: DEFAULT_MIN_BOOKING_NOTICE_DAYS,
    maxDays: DEFAULT_MAX_ADVANCE_BOOKING_DAYS,
  });

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("min_booking_notice_days, max_advance_booking_days")
        .eq("id", courseId)
        .single();
      if (cancelled || error || !data) return;
      setWindow({
        minDays: data.min_booking_notice_days ?? DEFAULT_MIN_BOOKING_NOTICE_DAYS,
        maxDays: data.max_advance_booking_days ?? DEFAULT_MAX_ADVANCE_BOOKING_DAYS,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, courseId]);

  return window;
}
