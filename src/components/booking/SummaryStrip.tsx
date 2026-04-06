"use client";

import { useBooking } from "@/components/booking/BookingContext";

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function SummaryStrip() {
  const { state } = useBooking();

  return (
    <div className="bg-gray-50 border-b border-gray-200 px-8 py-3">
      <div className="max-w-7xl mx-auto flex items-center gap-6 text-sm text-gray-600">
        <span className="font-medium text-gray-800">New Tournament</span>
        <span className="text-gray-300">|</span>

        {state.formatName ? (
          <span>
            <span className="text-gray-400">Format:</span>{" "}
            <span className="font-medium text-gray-800">{state.formatName}</span>
          </span>
        ) : (
          <span className="text-gray-400">No format selected</span>
        )}

        <span className="text-gray-300">|</span>

        <span>
          <span className="text-gray-400">Players:</span>{" "}
          <span className="font-medium text-gray-800">{state.playerCount}</span>
        </span>

        <span className="text-gray-300">|</span>

        <span>
          <span className="text-gray-400">Month:</span>{" "}
          <span className="font-medium text-gray-800">
            {MONTH_NAMES[state.month]} {state.year}
          </span>
        </span>

        {state.selectedDate && (
          <>
            <span className="text-gray-300">|</span>
            <span>
              <span className="text-gray-400">Date:</span>{" "}
              <span className="font-medium text-gray-800">{state.selectedDate}</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
