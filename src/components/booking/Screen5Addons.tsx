"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";
import NumberInput from "@/components/common/NumberInput";

type Addon = {
  id: string;
  course_id: string;
  name: string;
  description: string | null;
  pricing_type: "per_person" | "flat" | string;
  price: number;
  discount_eligible: boolean;
};

export default function Screen5Addons({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();

  const [addons, setAddons] = useState<Addon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local selection: id -> quantity
  const [selected, setSelected] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchAddons();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Pre-populate from state on mount
  useEffect(() => {
    const init: Record<string, number> = {};
    for (const s of state.addonSelections) init[s.addon_id] = s.quantity;
    setSelected(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchAddons() {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("addons")
      .select("*")
      .eq("course_id", courseId)
      .order("name");

    if (err) {
      setError(err.message);
    } else {
      setAddons(data ?? []);
    }
    setLoading(false);
  }

  function sync(next: Record<string, number>) {
    setSelected(next);
    const selections = Object.entries(next).map(([id, quantity]) => {
      const addon = addons.find((a) => a.id === id)!;
      return {
        addon_id: id,
        name: addon.name,
        quantity,
        price: addon.price * quantity,
        pricing_type: addon.pricing_type,
      };
    });
    dispatch({ type: "SET_ADDON_SELECTIONS", selections });
  }

  function toggle(addon: Addon) {
    const next = { ...selected };
    if (addon.id in next) {
      delete next[addon.id];
    } else {
      next[addon.id] = addon.pricing_type === "per_person" ? state.playerCount : 1;
    }
    sync(next);
  }

  function setQuantity(id: string, value: number) {
    if (!(id in selected)) return;
    sync({ ...selected, [id]: value });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-700 mb-4">{error}</p>
        <button
          onClick={fetchAddons}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Add-ons</h2>
        <p className="text-gray-500">Optional extras for your event</p>
      </div>

      {addons.length === 0 ? (
        <p className="text-sm text-gray-500">No add-ons available.</p>
      ) : (
        <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
          {addons.map((addon) => {
            const isSelected = addon.id in selected;
            const isPerPerson = addon.pricing_type === "per_person";
            const defaultQty = isPerPerson ? state.playerCount : 1;
            return (
              <div
                key={addon.id}
                className={`rounded-lg border bg-white p-5 shadow-sm transition-colors ${
                  isSelected ? "border-green-600 bg-green-50" : "border-gray-200"
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-gray-900">{addon.name}</h4>
                  <p className="text-sm font-semibold text-gray-900">
                    ${addon.price}
                    <span className="text-xs font-normal text-gray-500">
                      {isPerPerson ? "/pp" : " flat"}
                    </span>
                  </p>
                </div>
                {addon.description && (
                  <p className="text-sm text-gray-600 mb-3">{addon.description}</p>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                    {isPerPerson ? "per person" : "flat rate"}
                  </span>
                  {addon.discount_eligible && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-100 text-emerald-700">
                      discount eligible
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
                  <button
                    onClick={() => toggle(addon)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                      isSelected
                        ? "bg-green-600 text-white hover:bg-green-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {isSelected ? "Selected" : "Select"}
                  </button>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Qty</label>
                    <NumberInput
                      integer
                      min={1}
                      max={isPerPerson ? state.playerCount : 99}
                      disabled={!isSelected}
                      value={isSelected ? selected[addon.id] : defaultQty}
                      onChange={(v) => setQuantity(addon.id, v)}
                      className="w-20 px-2 py-1 rounded border border-gray-300 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                    />
                    <span className="text-xs text-gray-400">
                      max {isPerPerson ? state.playerCount : 99}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 4 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 6 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
        >
          Continue to Review
        </button>
      </div>
    </div>
  );
}
