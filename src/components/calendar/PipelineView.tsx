"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { PipelineBooking } from "@/app/calendar/page";

interface PipelineViewProps {
  bookings: PipelineBooking[];
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

const COLUMNS: Array<{ key: string; label: string; accent: string }> = [
  { key: "draft", label: "Draft", accent: "bg-gray-100 border-gray-300" },
  {
    key: "deposit_paid",
    label: "Deposit Paid",
    accent: "bg-blue-50 border-blue-300",
  },
  {
    key: "balance_paid",
    label: "Balance Paid",
    accent: "bg-indigo-50 border-indigo-300",
  },
  {
    key: "confirmed",
    label: "Confirmed",
    accent: "bg-green-50 border-green-300",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    accent: "bg-red-50 border-red-300",
  },
];

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-200 text-gray-800",
  deposit_paid: "bg-blue-100 text-blue-800",
  balance_paid: "bg-indigo-100 text-indigo-800",
  confirmed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const DAY_MS = 24 * 60 * 60 * 1000;

function formatDate(dateString: string): string {
  const [y, m, d] = dateString.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return (Date.now() - then) / DAY_MS;
}

type StaleKind = "stale_draft" | "balance_overdue" | null;

function getStaleKind(b: PipelineBooking): StaleKind {
  if (b.status === "draft") {
    if (daysSince(b.created_at) > 7) return "stale_draft";
  } else if (b.status === "deposit_paid") {
    const ref = b.status_changed_at ?? b.created_at;
    if (daysSince(ref) > 30) return "balance_overdue";
  }
  return null;
}

export default function PipelineView({
  bookings,
  loading,
  error,
  onRetry,
}: PipelineViewProps) {
  const router = useRouter();

  const grouped = useMemo(() => {
    const map: Record<string, PipelineBooking[]> = {};
    for (const col of COLUMNS) {
      map[col.key] = [];
    }
    for (const b of bookings) {
      if (map[b.status]) {
        map[b.status].push(b);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.date.localeCompare(b.date));
    }
    return map;
  }, [bookings]);

  const staleCounts = useMemo(() => {
    let drafts = 0;
    let overdue = 0;
    for (const b of bookings) {
      const kind = getStaleKind(b);
      if (kind === "stale_draft") drafts++;
      else if (kind === "balance_overdue") overdue++;
    }
    return { drafts, overdue };
  }, [bookings]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-12 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="text-sm text-red-700 mb-3">{error}</div>
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasAlerts = staleCounts.drafts > 0 || staleCounts.overdue > 0;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div
        className={`rounded-lg shadow px-4 py-3 text-sm flex items-center gap-4 ${
          hasAlerts
            ? "bg-amber-50 border border-amber-200 text-amber-900"
            : "bg-white border border-gray-200 text-gray-700"
        }`}
      >
        <span className="font-medium">
          {staleCounts.drafts} draft{staleCounts.drafts === 1 ? "" : "s"} need
          follow-up, {staleCounts.overdue} balance
          {staleCounts.overdue === 1 ? "" : "s"} overdue
        </span>
      </div>

      <div className="grid grid-cols-5 gap-4">
        {COLUMNS.map((col) => {
          const items = grouped[col.key] ?? [];
          return (
            <div
              key={col.key}
              className={`rounded-lg border ${col.accent} flex flex-col min-h-[400px]`}
            >
              <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-800">
                  {col.label}
                </span>
                <span className="text-xs font-medium text-gray-600 bg-white px-2 py-0.5 rounded-full">
                  {items.length}
                </span>
              </div>
              <div className="p-2 space-y-2 flex-1">
                {items.length === 0 ? (
                  <div className="text-xs text-gray-400 italic px-2 py-4 text-center">
                    No bookings
                  </div>
                ) : (
                  items.map((b) => {
                    const badgeClass =
                      STATUS_BADGE[b.status] ?? "bg-gray-100 text-gray-800";
                    const stale = getStaleKind(b);
                    const staleBorder =
                      stale === "stale_draft"
                        ? "border-yellow-400 ring-1 ring-yellow-300"
                        : stale === "balance_overdue"
                          ? "border-orange-400 ring-1 ring-orange-300"
                          : "border-gray-200";
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => router.push(`/?booking=${b.id}`)}
                        className={`w-full text-left bg-white rounded-md shadow-sm border ${staleBorder} hover:border-green-500 hover:shadow p-3 transition`}
                      >
                        <div className="text-xs text-gray-600">
                          {formatDate(b.date)}
                        </div>
                        <div className="text-sm font-semibold text-gray-900 truncate mt-0.5">
                          {b.tournament_formats?.name ?? "Tournament"}
                        </div>
                        <div className="text-xs text-gray-600 mt-1 flex items-center justify-between">
                          <span>{b.player_count} players</span>
                          {b.total_amount != null && (
                            <span className="font-medium text-gray-800">
                              {formatCurrency(b.total_amount)}
                            </span>
                          )}
                        </div>
                        <div className="mt-2 flex items-center gap-1 flex-wrap">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}
                          >
                            {b.status.replace("_", " ")}
                          </span>
                          {stale === "stale_draft" && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-yellow-100 text-yellow-800">
                              Stale draft
                            </span>
                          )}
                          {stale === "balance_overdue" && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-orange-100 text-orange-800">
                              Balance overdue
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
