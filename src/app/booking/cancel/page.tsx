"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

function CancelContent() {
  const searchParams = useSearchParams();
  const bookingId = searchParams.get("booking_id");

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            Payment Cancelled
          </h1>
          <p className="text-gray-700 mb-8">
            Your booking draft has been saved. You can return to pay the deposit
            at any time.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/"
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Back to Dashboard
            </Link>
            {bookingId && (
              <Link
                href={`/checkout/${bookingId}`}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
              >
                Try Again
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CancelPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
        </div>
      }
    >
      <CancelContent />
    </Suspense>
  );
}
