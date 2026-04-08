"use client";

interface SummaryCardsProps {
  totalBookings: number | null;
  upcomingBookings: number | null;
  confirmedRevenue: number | null;
  escalatedCount: number | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-24 mb-3"></div>
        <div className="h-8 bg-gray-200 rounded w-16"></div>
      </div>
    </div>
  );
}

export default function SummaryCards({
  totalBookings,
  upcomingBookings,
  confirmedRevenue,
  escalatedCount,
  loading,
  error,
  onRetry,
}: SummaryCardsProps) {
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
        <p className="text-sm text-red-700">Failed to load summary: {error}</p>
        <button
          onClick={onRetry}
          className="px-3 py-1 text-sm font-medium text-red-700 bg-red-100 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const cards = [
    { label: "Total Bookings", value: totalBookings ?? 0 },
    { label: "Upcoming", value: upcomingBookings ?? 0 },
    {
      label: "Revenue (Confirmed)",
      value: `$${(confirmedRevenue ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
    {
      label: "Escalated",
      value: escalatedCount ?? 0,
      highlight: (escalatedCount ?? 0) > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
      {cards.map((card) => (
        <div key={card.label} className="bg-white rounded-lg shadow p-6">
          <p className="text-sm font-medium text-gray-500">{card.label}</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              "highlight" in card && card.highlight
                ? "text-red-600"
                : "text-gray-900"
            }`}
          >
            {card.value}
          </p>
        </div>
      ))}
    </div>
  );
}
