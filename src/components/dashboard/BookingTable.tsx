"use client";

import { useMemo } from "react";

export interface Booking {
  id: string;
  date: string;
  player_count: number;
  status: string;
  notes: string | null;
  override_price: number | null;
  override_reason: string | null;
  needs_manual_review: boolean;
  deposit_amount: number | null;
  balance_amount: number | null;
  stripe_checkout_session_id: string | null;
  tournament_formats: { name: string } | null;
}

export interface PricingSnapshot {
  id: string;
  booking_id: string;
  total: number;
  green_fees: number;
  cart_fees: number;
  fb_total: number;
  bar_total: number;
  addon_total: number;
  subtotal: number;
  hst: number;
  displacement_floor: number | null;
  fb_line_items: Record<string, unknown>[] | null;
  bar_line_items: Record<string, unknown>[] | null;
  addon_line_items: Record<string, unknown>[] | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  "all",
  "draft",
  "deposit_paid",
  "balance_paid",
  "confirmed",
  "completed",
  "cancelled",
] as const;

const STATUS_LABELS: Record<string, string> = {
  all: "All",
  draft: "Draft",
  deposit_paid: "Deposit Paid",
  balance_paid: "Balance Paid",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
    case "completed":
      return "bg-green-100 text-green-800";
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "deposit_paid":
    case "balance_paid":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

interface BookingTableProps {
  bookings: Booking[];
  pricingMap: Map<string, PricingSnapshot>;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  selectedFilter: string;
  onFilterChange: (filter: string) => void;
  onSelectBooking: (booking: Booking) => void;
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-gray-200 rounded w-20"></div>
        </td>
      ))}
    </tr>
  );
}

export default function BookingTable({
  bookings,
  pricingMap,
  loading,
  error,
  onRetry,
  selectedFilter,
  onFilterChange,
  onSelectBooking,
}: BookingTableProps) {
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: bookings.length };
    for (const b of bookings) {
      counts[b.status] = (counts[b.status] || 0) + 1;
    }
    return counts;
  }, [bookings]);

  const filtered = useMemo(
    () =>
      selectedFilter === "all"
        ? bookings
        : bookings.filter((b) => b.status === selectedFilter),
    [bookings, selectedFilter]
  );

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Status Filter */}
      <div className="px-6 pt-5 pb-3 flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onFilterChange(s)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              selectedFilter === s
                ? "bg-green-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {STATUS_LABELS[s]}{" "}
            <span className="ml-1 text-xs opacity-75">
              {statusCounts[s] ?? 0}
            </span>
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mb-3 bg-red-50 border border-red-200 rounded-lg p-3 flex items-center justify-between">
          <p className="text-sm text-red-700">
            Failed to load bookings: {error}
          </p>
          <button
            onClick={onRetry}
            className="px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Format
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Players
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Override
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Review
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </>
            ) : filtered.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  No bookings found
                </td>
              </tr>
            ) : (
              filtered.map((booking) => {
                const snapshot = pricingMap.get(booking.id);
                return (
                  <tr
                    key={booking.id}
                    onClick={() => onSelectBooking(booking)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {new Date(booking.date + "T00:00:00").toLocaleDateString(
                        "en-US",
                        {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        }
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {booking.tournament_formats?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {booking.player_count}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadgeClass(booking.status)}`}
                      >
                        {STATUS_LABELS[booking.status] ?? booking.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {snapshot?.total != null
                        ? `$${snapshot.total.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {booking.override_price != null && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
                          OVR
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {booking.needs_manual_review && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-red-100 text-red-700 text-xs font-medium">
                          REV
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectBooking(booking);
                        }}
                        className="text-green-600 hover:text-green-800 font-medium text-xs"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
