"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FbItem {
  id: string;
  name: string;
  meal_type: string | null;
  price_per_person: number;
  description: string | null;
  headcount: number;
}

interface BarItem {
  id: string;
  name: string;
  bar_type: string | null;
  price_per_person: number;
  description: string | null;
  headcount: number;
}

interface AddonItem {
  id: string;
  name: string;
  description: string | null;
  pricing_type: string | null;
  price: number;
  discount_eligible: boolean | null;
  quantity: number;
}

interface CurrentFbSelection {
  fb_package_id: string;
  headcount: number;
}

interface CurrentBarSelection {
  bar_package_id: string;
  headcount: number;
}

interface CurrentAddonSelection {
  addon_id: string;
  quantity: number;
}

interface ModifySelectionsModalProps {
  bookingId: string;
  courseId: string;
  currentFb: CurrentFbSelection[];
  currentBar: CurrentBarSelection[];
  currentAddons: CurrentAddonSelection[];
  onClose: () => void;
  onSaved: () => void;
}

type Tab = "fb" | "bar" | "addons";

function fmtMoney(n: number): string {
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function ModifySelectionsModal({
  bookingId,
  courseId,
  currentFb,
  currentBar,
  currentAddons,
  onClose,
  onSaved,
}: ModifySelectionsModalProps) {
  const [tab, setTab] = useState<Tab>("fb");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [fbItems, setFbItems] = useState<FbItem[]>([]);
  const [barItems, setBarItems] = useState<BarItem[]>([]);
  const [addonItems, setAddonItems] = useState<AddonItem[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const supabase = createClient();
        const [fbRes, barRes, addonRes] = await Promise.all([
          supabase
            .from("fb_packages")
            .select("id, name, meal_type, price_per_person, description")
            .eq("course_id", courseId)
            .eq("active", true),
          supabase
            .from("bar_packages")
            .select("id, name, bar_type, price_per_person, description")
            .eq("course_id", courseId)
            .eq("active", true),
          supabase
            .from("addons")
            .select("id, name, description, pricing_type, price, discount_eligible")
            .eq("course_id", courseId)
            .eq("active", true),
        ]);

        if (fbRes.error) throw fbRes.error;
        if (barRes.error) throw barRes.error;
        if (addonRes.error) throw addonRes.error;

        const fbMap = new Map<string, number>(
          currentFb.map((s) => [s.fb_package_id, s.headcount])
        );
        const barMap = new Map<string, number>(
          currentBar.map((s) => [s.bar_package_id, s.headcount])
        );
        const addonMap = new Map<string, number>(
          currentAddons.map((s) => [s.addon_id, s.quantity])
        );

        if (cancelled) return;

        setFbItems(
          (fbRes.data ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            meal_type: (p.meal_type as string | null) ?? null,
            price_per_person: Number(p.price_per_person),
            description: (p.description as string | null) ?? null,
            headcount: fbMap.get(p.id as string) ?? 0,
          }))
        );
        setBarItems(
          (barRes.data ?? []).map((p) => ({
            id: p.id as string,
            name: p.name as string,
            bar_type: (p.bar_type as string | null) ?? null,
            price_per_person: Number(p.price_per_person),
            description: (p.description as string | null) ?? null,
            headcount: barMap.get(p.id as string) ?? 0,
          }))
        );
        setAddonItems(
          (addonRes.data ?? []).map((a) => ({
            id: a.id as string,
            name: a.name as string,
            description: (a.description as string | null) ?? null,
            pricing_type: (a.pricing_type as string | null) ?? null,
            price: Number(a.price),
            discount_eligible: (a.discount_eligible as boolean | null) ?? null,
            quantity: addonMap.get(a.id as string) ?? 0,
          }))
        );
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Failed to load packages"
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, currentFb, currentBar, currentAddons]);

  const updateFbHeadcount = (id: string, value: number) => {
    setFbItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, headcount: Math.max(0, Math.min(500, value)) }
          : item
      )
    );
  };

  const updateBarHeadcount = (id: string, value: number) => {
    setBarItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, headcount: Math.max(0, Math.min(500, value)) }
          : item
      )
    );
  };

  const updateAddonQuantity = (id: string, value: number) => {
    setAddonItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, quantity: Math.max(0, Math.min(999, value)) }
          : item
      )
    );
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const supabase = createClient();
      const fbArray = fbItems
        .filter((s) => s.headcount > 0)
        .map((s) => ({ fb_package_id: s.id, headcount: s.headcount }));
      const barArray = barItems
        .filter((s) => s.headcount > 0)
        .map((s) => ({ bar_package_id: s.id, headcount: s.headcount }));
      const addonArray = addonItems
        .filter((s) => s.quantity > 0)
        .map((s) => ({ addon_id: s.id, quantity: s.quantity }));

      const { data, error } = await supabase.rpc("modify_booking_selections", {
        p_booking_id: bookingId,
        p_course_id: courseId,
        p_fb_selections: fbArray,
        p_bar_selections: barArray,
        p_addon_selections: addonArray,
      });

      if (error) {
        setSaveError(error.message);
        setSaving(false);
        return;
      }
      const result = data as { error?: string } | null;
      if (result && result.error) {
        setSaveError(result.error);
        setSaving(false);
        return;
      }

      setSaving(false);
      onSaved();
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save selections"
      );
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">
          Modify Selections
        </h2>
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="text-gray-500 hover:text-gray-700 disabled:opacity-50"
          aria-label="Close"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 px-4 sm:px-6 lg:px-8">
        <nav className="flex space-x-6">
          {(
            [
              { key: "fb" as Tab, label: "Food & Beverage" },
              { key: "bar" as Tab, label: "Bar" },
              { key: "addons" as Tab, label: "Add-ons" },
            ]
          ).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`py-3 text-sm font-medium border-b-2 -mb-px ${
                tab === t.key
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
        {saveError && (
          <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {saveError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : loadError ? (
          <div className="rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {loadError}
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {tab === "fb" && (
              <div className="space-y-3">
                {fbItems.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No F&amp;B packages available.
                  </p>
                ) : (
                  fbItems.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {item.name}
                        </div>
                        {item.meal_type && (
                          <div className="text-xs text-gray-500 capitalize mt-0.5">
                            {item.meal_type}
                          </div>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1">
                            {item.description}
                          </p>
                        )}
                        <div className="text-sm text-gray-700 mt-2">
                          {fmtMoney(item.price_per_person)} / person
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <label className="block text-xs text-gray-500 mb-1">
                          Headcount
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={item.headcount}
                          onChange={(e) =>
                            updateFbHeadcount(
                              item.id,
                              parseInt(e.target.value || "0", 10)
                            )
                          }
                          className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-right"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "bar" && (
              <div className="space-y-3">
                {barItems.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    No bar packages available.
                  </p>
                ) : (
                  barItems.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {item.name}
                        </div>
                        {item.bar_type && (
                          <div className="text-xs text-gray-500 capitalize mt-0.5">
                            {item.bar_type}
                          </div>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1">
                            {item.description}
                          </p>
                        )}
                        <div className="text-sm text-gray-700 mt-2">
                          {fmtMoney(item.price_per_person)} / person
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <label className="block text-xs text-gray-500 mb-1">
                          Headcount
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={500}
                          value={item.headcount}
                          onChange={(e) =>
                            updateBarHeadcount(
                              item.id,
                              parseInt(e.target.value || "0", 10)
                            )
                          }
                          className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-right"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === "addons" && (
              <div className="space-y-3">
                {addonItems.length === 0 ? (
                  <p className="text-sm text-gray-500">No add-ons available.</p>
                ) : (
                  addonItems.map((item) => (
                    <div
                      key={item.id}
                      className="border border-gray-200 rounded-lg p-4 flex items-start justify-between gap-4"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900">
                          {item.name}
                        </div>
                        {item.pricing_type && (
                          <div className="text-xs text-gray-500 mt-0.5">
                            {item.pricing_type === "per_person"
                              ? "Per person"
                              : "Flat rate"}
                          </div>
                        )}
                        {item.description && (
                          <p className="text-xs text-gray-600 mt-1">
                            {item.description}
                          </p>
                        )}
                        <div className="text-sm text-gray-700 mt-2">
                          {fmtMoney(item.price)}
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        <label className="block text-xs text-gray-500 mb-1">
                          {item.pricing_type === "per_person"
                            ? "Quantity (per person)"
                            : "Quantity"}
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={999}
                          value={item.quantity}
                          onChange={(e) =>
                            updateAddonQuantity(
                              item.id,
                              parseInt(e.target.value || "0", 10)
                            )
                          }
                          className="w-24 px-2 py-1.5 border border-gray-300 rounded-md text-sm text-right"
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Save */}
      <div className="border-t border-gray-200 px-4 sm:px-6 lg:px-8 py-4 bg-white">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading || !!loadError}
          className="w-full px-4 py-3 rounded-md bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium"
        >
          {saving ? "Saving..." : "Save Selections"}
        </button>
      </div>
    </div>
  );
}
