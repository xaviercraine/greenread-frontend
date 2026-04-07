"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { callEdgeFunction } from "@/lib/edgeFunction";

interface BookingRecord {
  id: string;
  course_id: string;
  date: string;
  player_count: number;
  status: string;
  tournament_formats: { name: string } | null;
}

interface SnapshotRecord {
  total: number;
}

export default function CheckoutPage() {
  const params = useParams<{ bookingId: string }>();
  const bookingId = params?.bookingId;
  const supabase = useMemo(() => createClient(), []);

  const [booking, setBooking] = useState<BookingRecord | null>(null);
  const [snapshot, setSnapshot] = useState<SnapshotRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!bookingId) return;
    setLoading(true);
    setError(null);
    try {
      const { data: bookingData, error: bookingErr } = await supabase
        .from("bookings")
        .select("*, tournament_formats(name)")
        .eq("id", bookingId)
        .single();

      if (bookingErr || !bookingData) {
        throw new Error("Booking not found");
      }

      if (bookingData.status !== "draft") {
        setBooking(bookingData as BookingRecord);
        throw new Error("This booking has already been paid or is no longer in draft status.");
      }

      const { data: snapData, error: snapErr } = await supabase
        .from("pricing_snapshots")
        .select("snapshot")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (snapErr || !snapData) {
        setBooking(bookingData as BookingRecord);
        throw new Error("No pricing snapshot found for this booking.");
      }

      const snapJson = (snapData as { snapshot: SnapshotRecord }).snapshot;
      setBooking(bookingData as BookingRecord);
      setSnapshot(snapJson);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load booking");
    } finally {
      setLoading(false);
    }
  }, [bookingId, supabase]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePay = async () => {
    if (!booking || !bookingId) return;
    setPaying(true);
    setPayError(null);
    try {
      const result = await callEdgeFunction("payment", {
        action: "create_checkout",
        params: {
          booking_id: bookingId,
          course_id: booking.course_id,
        },
      });
      if (!result?.checkout_url) {
        throw new Error("No checkout URL returned");
      }
      window.location.href = result.checkout_url as string;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Failed to start checkout");
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-8 shadow-sm">
          <h1 className="text-xl font-semibold text-red-700 mb-3">Unable to load checkout</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={fetchData}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
            >
              Retry
            </button>
            <Link
              href="/"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!booking || !snapshot) {
    return null;
  }

  const total = snapshot.total ?? 0;
  const deposit = total * 0.25;

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <Link href="/" className="text-sm text-green-700 hover:underline">
          &larr; Back to Dashboard
        </Link>

        <div className="mt-4 bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Checkout</h1>

          <div className="space-y-3 mb-8">
            <div className="flex justify-between text-gray-700">
              <span>Format</span>
              <span className="font-medium">
                {booking.tournament_formats?.name ?? "—"}
              </span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Date</span>
              <span className="font-medium">{booking.date}</span>
            </div>
            <div className="flex justify-between text-gray-700">
              <span>Players</span>
              <span className="font-medium">{booking.player_count}</span>
            </div>
            <div className="border-t border-gray-200 pt-3 flex justify-between text-gray-900 text-lg">
              <span className="font-semibold">Total</span>
              <span className="font-semibold">${total.toFixed(2)}</span>
            </div>
          </div>

          <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-6">
            <p className="text-sm text-green-900">
              <span className="font-semibold">25% deposit required</span> to confirm your booking.
            </p>
            <p className="text-2xl font-bold text-green-900 mt-2">
              ${deposit.toFixed(2)}
            </p>
          </div>

          {payError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
              <p className="text-sm text-red-700 mb-2">{payError}</p>
              <button
                type="button"
                onClick={handlePay}
                className="text-sm text-red-700 underline hover:text-red-800"
              >
                Retry
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={paying}
            className="w-full py-4 bg-green-600 text-white text-lg font-semibold rounded-md hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {paying ? (
              <>
                <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                Redirecting to payment...
              </>
            ) : (
              "Pay Deposit"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
