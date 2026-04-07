"use client";

interface RevenueBreakdownCardsProps {
  greenFees: number;
  cartCost: number;
  fbTotal: number;
  barTotal: number;
  addonTotal: number;
  loading: boolean;
}

function formatCurrency(value: number) {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function SkeletonCard() {
  return (
    <div className="bg-gray-100 rounded-md px-4 py-3">
      <div className="animate-pulse">
        <div className="h-3 bg-gray-200 rounded w-16 mb-2"></div>
        <div className="h-5 bg-gray-200 rounded w-20"></div>
      </div>
    </div>
  );
}

export default function RevenueBreakdownCards({
  greenFees,
  cartCost,
  fbTotal,
  barTotal,
  addonTotal,
  loading,
}: RevenueBreakdownCardsProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-3">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  const cards = [
    { label: "Green Fees", value: greenFees },
    { label: "Carts", value: cartCost },
    { label: "F&B", value: fbTotal },
    { label: "Bar", value: barTotal },
    { label: "Add-ons", value: addonTotal },
  ];

  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map((card) => (
        <div
          key={card.label}
          className="bg-gray-100 rounded-md px-4 py-3 border border-gray-200"
        >
          <p className="text-xs font-medium text-gray-500">{card.label}</p>
          <p className="mt-0.5 text-base font-semibold text-gray-800">
            {formatCurrency(card.value)}
          </p>
        </div>
      ))}
    </div>
  );
}
