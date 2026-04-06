"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";

type Multiplier = { type: string; multiplier: number };
type FbLine = { package: string; headcount: number; price_per_person: number; line_total: number };
type BarLine = { package: string; headcount: number; price_per_person: number; line_total: number };
type AddonLine = {
  addon: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  pricing_type: string;
};

type PricingResult = {
  format: string;
  player_count: number;
  date: string;
  base_rate_per_player: number;
  combined_multiplier: number;
  multipliers: Multiplier[];
  green_fees: number;
  carts_needed: number;
  cart_rate: number;
  cart_cost: number;
  fb_lines: FbLine[];
  fb_total: number;
  bar_lines: BarLine[];
  bar_total: number;
  addon_lines: AddonLine[];
  addon_total: number;
  addon_total_before_discount: number;
  fb_threshold_discount: { discount_pct: number; discount_amount: number };
  fb_minimum: { met: boolean; actual: number; required: number };
  kitchen_load: {
    this_headcount: number;
    existing_headcount: number;
    kitchen_capacity: number;
    surcharge: number;
  };
  displacement_floor: { displacement_cost: number; floor_amount: number; below_floor: boolean };
  subtotal: number;
  pre_tax_total: number;
  hst_rate: number;
  hst: number;
  total: number;
  coupon: string | null;
  coupon_discount: number;
  promotion: string | null;
  promo_discount: number;
};

function fmt(n: number | null | undefined): string {
  if (n == null) return "$0.00";
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Screen6Pricing({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();

  const [pricing, setPricing] = useState<PricingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchPricing = useCallback(async () => {
    setLoading(true);
    setError(null);

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

    const { data, error: err } = await supabase.rpc("calculate_tournament_price", {
      p_course_id: courseId,
      p_date: state.selectedDate,
      p_format_id: state.formatId,
      p_player_count: state.playerCount,
      p_fb_selections: fbParam,
      p_bar_selections: barParam,
      p_addon_selections: addonParam,
      p_coupon_code: null,
    });

    if (err) {
      setError(err.message);
    } else {
      setPricing(data as PricingResult);
    }
    setLoading(false);
  }, [
    supabase,
    courseId,
    state.selectedDate,
    state.formatId,
    state.playerCount,
    state.fbSelections,
    state.barSelections,
    state.addonSelections,
  ]);

  useEffect(() => {
    fetchPricing();
  }, [fetchPricing]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error || !pricing) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 mb-4">{error ?? "Failed to load pricing."}</p>
        <button
          onClick={fetchPricing}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const editLink = (step: number, label: string = "Edit") => (
    <button
      onClick={() => dispatch({ type: "SET_STEP", step })}
      className="text-xs font-semibold text-green-700 hover:text-green-800 underline"
    >
      {label}
    </button>
  );

  const sectionHeader = (title: string, step: number) => (
    <div className="flex items-center justify-between border-b border-gray-200 pb-2 mb-3">
      <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      {editLink(step)}
    </div>
  );

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Review & Pricing</h2>
        <p className="text-gray-500">Confirm the details below before creating your draft.</p>
      </div>

      {/* Tournament Details */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        {sectionHeader("Tournament Details", 1)}
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-gray-500">Format</dt>
          <dd className="text-gray-900 font-medium">{pricing.format}</dd>
          <dt className="text-gray-500">Players</dt>
          <dd className="text-gray-900 font-medium">{pricing.player_count}</dd>
          <dt className="text-gray-500">Date</dt>
          <dd className="text-gray-900 font-medium">
            {pricing.date} {editLink(2, "(change)")}
          </dd>
        </dl>
      </section>

      {/* Green Fees */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        {sectionHeader("Green Fees", 1)}
        <div className="text-sm text-gray-700 space-y-2">
          <div className="flex justify-between">
            <span>
              {fmt(pricing.base_rate_per_player)} × {pricing.combined_multiplier} ×{" "}
              {pricing.player_count} players
            </span>
            <span className="font-medium">{fmt(pricing.green_fees)}</span>
          </div>
          {pricing.multipliers && pricing.multipliers.length > 0 && (
            <div className="pl-4 space-y-1 text-xs text-gray-500">
              {pricing.multipliers.map((m, i) => (
                <div key={i} className="flex justify-between">
                  <span className="capitalize">{m.type} multiplier</span>
                  <span>×{m.multiplier}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Cart Fees */}
      <section className="bg-white border border-gray-200 rounded-lg p-6">
        {sectionHeader("Cart Fees", 1)}
        <div className="flex justify-between text-sm text-gray-700">
          <span>
            {pricing.carts_needed} carts × {fmt(pricing.cart_rate)}
          </span>
          <span className="font-medium">{fmt(pricing.cart_cost)}</span>
        </div>
      </section>

      {/* F&B */}
      {pricing.fb_lines && pricing.fb_lines.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          {sectionHeader("Food & Beverage", 3)}
          <div className="space-y-2 text-sm">
            {pricing.fb_lines.map((line, i) => (
              <div key={i} className="flex justify-between text-gray-700">
                <span>
                  {line.package} — {line.headcount} × {fmt(line.price_per_person)}
                </span>
                <span className="font-medium">{fmt(line.line_total)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-gray-100 font-semibold text-gray-900">
              <span>F&B Total</span>
              <span>{fmt(pricing.fb_total)}</span>
            </div>
            {pricing.fb_minimum && (
              <div
                className={`text-xs mt-2 px-3 py-2 rounded ${
                  pricing.fb_minimum.met
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                F&B minimum {pricing.fb_minimum.met ? "met" : "NOT met"}: {pricing.fb_minimum.actual}{" "}
                of {pricing.fb_minimum.required} required
              </div>
            )}
          </div>
        </section>
      )}

      {/* Bar */}
      {pricing.bar_lines && pricing.bar_lines.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          {sectionHeader("Bar", 3)}
          <div className="space-y-2 text-sm">
            {pricing.bar_lines.map((line, i) => (
              <div key={i} className="flex justify-between text-gray-700">
                <span>
                  {line.package} — {line.headcount} × {fmt(line.price_per_person)}
                </span>
                <span className="font-medium">{fmt(line.line_total)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-gray-100 font-semibold text-gray-900">
              <span>Bar Total</span>
              <span>{fmt(pricing.bar_total)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Event Space */}
      {state.eventSpaceName && (
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          {sectionHeader("Event Space", 4)}
          <p className="text-sm text-gray-700">{state.eventSpaceName}</p>
        </section>
      )}

      {/* Add-ons */}
      {pricing.addon_lines && pricing.addon_lines.length > 0 && (
        <section className="bg-white border border-gray-200 rounded-lg p-6">
          {sectionHeader("Add-ons", 5)}
          <div className="space-y-2 text-sm">
            {pricing.addon_lines.map((line, i) => (
              <div key={i} className="flex justify-between text-gray-700">
                <span>
                  {line.addon} — {line.quantity} × {fmt(line.unit_price)}
                  <span className="text-xs text-gray-400 ml-2">({line.pricing_type})</span>
                </span>
                <span className="font-medium">{fmt(line.line_total)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2 border-t border-gray-100 text-gray-700">
              <span>Subtotal before discount</span>
              <span>{fmt(pricing.addon_total_before_discount)}</span>
            </div>
            {pricing.fb_threshold_discount &&
              pricing.fb_threshold_discount.discount_amount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>F&B threshold discount ({pricing.fb_threshold_discount.discount_pct}%)</span>
                  <span>−{fmt(pricing.fb_threshold_discount.discount_amount)}</span>
                </div>
              )}
            <div className="flex justify-between pt-2 border-t border-gray-100 font-semibold text-gray-900">
              <span>Add-on Total</span>
              <span>{fmt(pricing.addon_total)}</span>
            </div>
          </div>
        </section>
      )}

      {/* Totals */}
      <section className="bg-gray-50 border border-gray-200 rounded-lg p-6">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-700">
            <span>Subtotal (pre-tax)</span>
            <span>{fmt(pricing.pre_tax_total ?? pricing.subtotal)}</span>
          </div>
          <div className="flex justify-between text-gray-700">
            <span>HST ({Math.round((pricing.hst_rate ?? 0.13) * 100)}%)</span>
            <span>{fmt(pricing.hst)}</span>
          </div>
          <div className="flex justify-between pt-3 mt-3 border-t border-gray-300">
            <span className="text-xl font-bold text-gray-900">Total</span>
            <span className="text-xl font-bold text-gray-900">{fmt(pricing.total)}</span>
          </div>
        </div>

        {pricing.displacement_floor && (
          <div
            className={`mt-4 text-xs px-3 py-2 rounded ${
              pricing.displacement_floor.below_floor
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-50 text-emerald-700"
            }`}
          >
            Displacement floor: {fmt(pricing.displacement_floor.floor_amount)} —{" "}
            {pricing.displacement_floor.below_floor
              ? "price is BELOW the floor"
              : "price is above the floor"}
          </div>
        )}
      </section>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 5 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 7 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
        >
          Confirm & Create Draft
        </button>
      </div>
    </div>
  );
}
