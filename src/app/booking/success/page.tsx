"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

function SuccessContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id");
  const supabase = useMemo(() => createClient(), []);

  const [status, setStatus] = useState<string>("checking");
  const [attempts, setAttempts] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const maxAttempts = 20;

  useEffect(() => {
    if (!bookingId) return;
    if (status === "deposit_paid" || status === "confirmed") return;
    if (status === "error") return;
    if (attempts >= maxAttempts) {
      setStatus("timeout");
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const { data, error } = await supabase
          .from("bookings")
          .select("status")
          .eq("id", bookingId)
          .single();

        if (error) {
          setErrorMsg(error.message);
          setStatus("error");
          return;
        }

        if (data) {
          if (data.status !== "draft") {
            setStatus(data.status);
          } else {
            setAttempts((prev) => prev + 1);
          }
        }
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : "Failed to check status");
        setStatus("error");
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [bookingId, status, attempts, supabase]);

  if (!bookingId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white border border-red-200 rounded-lg p-8">
          <h1 className="text-xl font-semibold text-red-700 mb-3">Missing booking ID</h1>
          <Link href="/" className="text-green-700 hover:underline">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        {status === "checking" && (
          <div className="bg-white border border-gray-200 rounded-lg p-8 shadow-sm text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto mb-6" />
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Confirming your payment...
            </h1>
            <p className="text-gray-600">
              Attempt {attempts + 1} of {maxAttempts}
            </p>
          </div>
        )}

        {(status === "deposit_paid" ||
          status === "confirmed" ||
          status === "balance_paid" ||
          status === "completed") && (
          <div className="bg-white border border-green-300 rounded-lg shadow-sm overflow-hidden">
            <div className="bg-green-600 text-white p-6">
              <h1 className="text-2xl font-bold">Payment confirmed!</h1>
              <p className="mt-1 text-green-50">
                Your deposit has been received.
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-gray-700">
                <p className="text-sm">Booking ID</p>
                <p className="font-mono text-sm break-all">{bookingId}</p>
              </div>
              <div className="text-gray-700">
                <p className="text-sm">Status</p>
                <p className="font-medium capitalize">{status.replace("_", " ")}</p>
              </div>
              <Link
                href="/"
                className="inline-block w-full text-center py-3 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700"
              >
                Go to Dashboard
              </Link>
            </div>
          </div>
        )}

        {status === "timeout" && (
          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-8">
            <h1 className="text-xl font-semibold text-yellow-900 mb-2">
              Still processing
            </h1>
            <p className="text-yellow-900 mb-6">
              Your payment is still being processed. This can take a few minutes.
            </p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-yellow-700 text-white rounded-md hover:bg-yellow-800"
            >
              Check booking status on Dashboard
            </Link>
          </div>
        )}

        {status === "error" && (
          <div className="bg-red-50 border border-red-300 rounded-lg p-8">
            <h1 className="text-xl font-semibold text-red-800 mb-2">
              Something went wrong
            </h1>
            <p className="text-red-700 mb-6">{errorMsg ?? "Failed to check booking status."}</p>
            <Link
              href="/"
              className="inline-block px-4 py-2 bg-red-700 text-white rounded-md hover:bg-red-800"
            >
              Back to Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}
