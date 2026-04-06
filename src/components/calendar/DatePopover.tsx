"use client";

import { useRouter } from "next/navigation";
import type { CalendarBooking, DateBlock } from "@/app/calendar/page";

interface DatePopoverProps {
  dateString: string;
  bookings: CalendarBooking[];
  block: DateBlock | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onBlock: () => void;
  onUnblock: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800",
  deposit_paid: "bg-blue-100 text-blue-800",
  balance_paid: "bg-indigo-100 text-indigo-800",
  confirmed: "bg-green-100 text-green-800",
  completed: "bg-emerald-100 text-emerald-800",
};

function formatDateHeader(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function DatePopover({
  dateString,
  bookings,
  block,
  busy,
  error,
  onClose,
  onBlock,
  onUnblock,
}: DatePopoverProps) {
  const router = useRouter();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-200 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {formatDateHeader(dateString)}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {block && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3">
              <div className="text-sm font-semibold text-red-800">
                Date Blocked
              </div>
              <div className="text-xs text-red-700 mt-1">
                Type: {block.block_type}
              </div>
              {block.reason && (
                <div className="text-xs text-red-700">
                  Reason: {block.reason}
                </div>
              )}
            </div>
          )}

          {bookings.length > 0 ? (
            <div className="space-y-2">
              <div className="text-sm font-semibold text-gray-700">
                Bookings ({bookings.length})
              </div>
              {bookings.map((b) => {
                const statusClass =
                  STATUS_STYLES[b.status] ?? "bg-gray-100 text-gray-800";
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => router.push(`/?booking=${b.id}`)}
                    className="w-full text-left rounded-md border border-gray-200 hover:border-green-500 hover:bg-green-50 p-3 transition"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-gray-900">
                        {b.tournament_formats?.name ?? "Tournament"}
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${statusClass}`}
                      >
                        {b.status.replace("_", " ")}
                      </span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      {b.player_count} players
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            !block && (
              <div className="text-sm text-gray-500 italic">
                No bookings on this date.
              </div>
            )
          )}

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="pt-2 border-t border-gray-200">
            {block ? (
              <button
                type="button"
                onClick={onUnblock}
                disabled={busy}
                className="w-full px-4 py-2 rounded-md bg-red-600 hover:bg-red-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {busy && (
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                )}
                Unblock Date
              </button>
            ) : (
              bookings.length === 0 && (
                <button
                  type="button"
                  onClick={onBlock}
                  disabled={busy}
                  className="w-full px-4 py-2 rounded-md bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {busy && (
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  )}
                  Block Date
                </button>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
