"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";

type DraftResult = {
  success: boolean;
  booking_id?: string;
  format_name?: string;
  date?: string;
  player_count?: number;
  nines_allocated?: number;
  pricing?: { total: number };
  snapshot_created?: boolean;
  error?: string;
  message?: string;
};

export default function Screen7Confirm({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();

  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const hasCalledRef = useRef(false);

  const createDraft = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    setResult(null);

    const fbParam = state.fbSelections.map((s) => ({
      fb_package_id: s.fb_package_id,
      headcount: s.headcount,
    }));
    const barParam = state.barSelections.map((s) => ({
      bar_package_id: s.bar_package_id,
      headcount: s.headcount,
    }));
    const addonParam = state.addonSelections.map((s) => ({
      addon_id: s.addon_id,
      quantity: s.quantity,
    }));

    const { data, error } = await supabase.rpc("create_booking_draft_rpc", {
      p_course_id: courseId,
      p_format_id: state.formatId,
      p_date: state.selectedDate,
      p_player_count: state.playerCount,
      p_notes: null,
      p_fb_selections: fbParam,
      p_bar_selections: barParam,
      p_addon_selections: addonParam,
    });

    if (error) {
      setErrorMsg(error.message);
    } else {
      setResult(data as DraftResult);
    }
    setLoading(false);
  }, [
    supabase,
    courseId,
    state.formatId,
    state.selectedDate,
    state.playerCount,
    state.fbSelections,
    state.barSelections,
    state.addonSelections,
  ]);

  useEffect(() => {
    if (hasCalledRef.current) return;
    hasCalledRef.current = true;
    createDraft();
  }, [createDraft]);

  function retry() {
    hasCalledRef.current = true;
    createDraft();
  }

  function handleBackToDashboard() {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("greenread_booking");
    }
    dispatch({ type: "RESET" });
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600 mb-4" />
        <p className="text-gray-500 text-sm">Creating your tournament draft...</p>
      </div>
    );
  }

  if (errorMsg || (result && result.success === false)) {
    const message = errorMsg ?? result?.message ?? result?.error ?? "Failed to create draft.";
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 border border-red-200 rounded-lg p-8 text-center">
          <h2 className="text-xl font-bold text-red-800 mb-2">Could not create draft</h2>
          {result?.error && (
            <p className="text-sm text-red-700 font-medium mb-1">{result.error}</p>
          )}
          <p className="text-red-700 mb-6">{message}</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={retry}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700"
            >
              Try Again
            </button>
            <button
              onClick={() => dispatch({ type: "SET_STEP", step: 6 })}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200"
            >
              Back to Review
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!result || !result.success) {
    return null;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="bg-emerald-50 border-b border-emerald-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-600 flex items-center justify-center mb-4">
            <svg
              className="w-9 h-9 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth={3}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-emerald-900">Tournament Draft Created!</h2>
          <p className="text-sm text-emerald-700 mt-1">Booking ID: {result.booking_id}</p>
        </div>

        <div className="p-8 space-y-4">
          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <dt className="text-gray-500">Format</dt>
            <dd className="text-gray-900 font-medium">{result.format_name}</dd>
            <dt className="text-gray-500">Date</dt>
            <dd className="text-gray-900 font-medium">{result.date}</dd>
            <dt className="text-gray-500">Players</dt>
            <dd className="text-gray-900 font-medium">{result.player_count}</dd>
            <dt className="text-gray-500">Nines allocated</dt>
            <dd className="text-gray-900 font-medium">{result.nines_allocated}</dd>
            {result.pricing && (
              <>
                <dt className="text-gray-500">Total</dt>
                <dd className="text-gray-900 font-bold">
                  $
                  {Number(result.pricing.total).toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </dd>
              </>
            )}
          </dl>

          <div
            className={`text-xs px-3 py-2 rounded ${
              result.snapshot_created
                ? "bg-emerald-50 text-emerald-700"
                : "bg-amber-50 text-amber-700"
            }`}
          >
            Pricing snapshot {result.snapshot_created ? "created" : "not created"}
          </div>

          <div className="flex items-center gap-3 pt-4">
            <Link
              href={`/checkout/${result.booking_id}`}
              className="flex-1 text-center px-5 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
            >
              Pay Deposit
            </Link>
            <Link
              href="/"
              onClick={handleBackToDashboard}
              className="flex-1 text-center px-5 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
