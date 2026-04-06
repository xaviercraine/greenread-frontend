"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";

type FBPackage = {
  id: string;
  course_id: string;
  name: string;
  meal_type: string;
  price_per_person: number;
  description: string | null;
  capacity_limit: number | null;
};

type BarPackage = {
  id: string;
  course_id: string;
  name: string;
  price_per_person: number;
  description: string | null;
  capacity_limit: number | null;
};

export default function Screen3FB({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();

  const [fbPackages, setFbPackages] = useState<FBPackage[]>([]);
  const [barPackages, setBarPackages] = useState<BarPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Local selection state: id -> headcount
  const [fbSelected, setFbSelected] = useState<Record<string, number>>({});
  const [barSelected, setBarSelected] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchPackages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // Pre-populate from state on mount
  useEffect(() => {
    const fbInit: Record<string, number> = {};
    for (const s of state.fbSelections) fbInit[s.fb_package_id] = s.headcount;
    setFbSelected(fbInit);

    const barInit: Record<string, number> = {};
    for (const s of state.barSelections) barInit[s.bar_package_id] = s.headcount;
    setBarSelected(barInit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPackages() {
    setLoading(true);
    setError(null);

    const [fbRes, barRes] = await Promise.all([
      supabase.from("fb_packages").select("*").eq("course_id", courseId).order("name"),
      supabase.from("bar_packages").select("*").eq("course_id", courseId).order("name"),
    ]);

    if (fbRes.error) {
      setError(fbRes.error.message);
      setLoading(false);
      return;
    }
    if (barRes.error) {
      setError(barRes.error.message);
      setLoading(false);
      return;
    }

    setFbPackages(fbRes.data ?? []);
    setBarPackages(barRes.data ?? []);
    setLoading(false);
  }

  function syncFb(next: Record<string, number>) {
    setFbSelected(next);
    const selections = Object.entries(next).map(([id, headcount]) => {
      const pkg = fbPackages.find((p) => p.id === id)!;
      return {
        fb_package_id: id,
        name: pkg.name,
        headcount,
        price: pkg.price_per_person * headcount,
      };
    });
    dispatch({ type: "SET_FB_SELECTIONS", selections });
  }

  function syncBar(next: Record<string, number>) {
    setBarSelected(next);
    const selections = Object.entries(next).map(([id, headcount]) => {
      const pkg = barPackages.find((p) => p.id === id)!;
      return {
        bar_package_id: id,
        name: pkg.name,
        headcount,
        price: pkg.price_per_person * headcount,
      };
    });
    dispatch({ type: "SET_BAR_SELECTIONS", selections });
  }

  function toggleFb(pkg: FBPackage) {
    const next = { ...fbSelected };
    if (pkg.id in next) {
      delete next[pkg.id];
    } else {
      next[pkg.id] = state.playerCount;
    }
    syncFb(next);
  }

  function setFbHeadcount(id: string, value: number) {
    if (!(id in fbSelected)) return;
    const next = { ...fbSelected, [id]: value };
    syncFb(next);
  }

  function toggleBar(pkg: BarPackage) {
    const next = { ...barSelected };
    if (pkg.id in next) {
      delete next[pkg.id];
    } else {
      next[pkg.id] = state.playerCount;
    }
    syncBar(next);
  }

  function setBarHeadcount(id: string, value: number) {
    if (!(id in barSelected)) return;
    const next = { ...barSelected, [id]: value };
    syncBar(next);
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
          onClick={fetchPackages}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Food, Beverage & Bar</h2>
        <p className="text-gray-500">Optional packages for your event</p>
      </div>

      {/* F&B Packages */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">F&B Packages</h3>
        {fbPackages.length === 0 ? (
          <p className="text-sm text-gray-500">No F&B packages available.</p>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {fbPackages.map((pkg) => {
              const selected = pkg.id in fbSelected;
              return (
                <div
                  key={pkg.id}
                  className={`rounded-lg border bg-white p-5 shadow-sm transition-colors ${
                    selected ? "border-green-600 bg-green-50" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-semibold text-gray-900">{pkg.name}</h4>
                      <p className="text-xs uppercase tracking-wide text-gray-500 mt-0.5">
                        {pkg.meal_type}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-gray-900">
                      ${pkg.price_per_person}
                      <span className="text-xs font-normal text-gray-500">/pp</span>
                    </p>
                  </div>
                  {pkg.description && (
                    <p className="text-sm text-gray-600 mb-3">{pkg.description}</p>
                  )}
                  {pkg.capacity_limit !== null && (
                    <p className="text-xs text-gray-500 mb-3">
                      Capacity: up to {pkg.capacity_limit}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => toggleFb(pkg)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        selected
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Headcount</label>
                      <input
                        type="number"
                        min={1}
                        disabled={!selected}
                        value={selected ? fbSelected[pkg.id] : state.playerCount}
                        onChange={(e) =>
                          setFbHeadcount(pkg.id, parseInt(e.target.value || "0", 10))
                        }
                        className="w-20 px-2 py-1 rounded border border-gray-300 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Bar Packages */}
      <section>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Bar Packages</h3>
        {barPackages.length === 0 ? (
          <p className="text-sm text-gray-500">No bar packages available.</p>
        ) : (
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {barPackages.map((pkg) => {
              const selected = pkg.id in barSelected;
              return (
                <div
                  key={pkg.id}
                  className={`rounded-lg border bg-white p-5 shadow-sm transition-colors ${
                    selected ? "border-green-600 bg-green-50" : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-gray-900">{pkg.name}</h4>
                    <p className="text-sm font-semibold text-gray-900">
                      ${pkg.price_per_person}
                      <span className="text-xs font-normal text-gray-500">/pp</span>
                    </p>
                  </div>
                  {pkg.description && (
                    <p className="text-sm text-gray-600 mb-3">{pkg.description}</p>
                  )}
                  {pkg.capacity_limit !== null && (
                    <p className="text-xs text-gray-500 mb-3">
                      Capacity: up to {pkg.capacity_limit}
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-200">
                    <button
                      onClick={() => toggleBar(pkg)}
                      className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                        selected
                          ? "bg-green-600 text-white hover:bg-green-700"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {selected ? "Selected" : "Select"}
                    </button>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500">Headcount</label>
                      <input
                        type="number"
                        min={1}
                        disabled={!selected}
                        value={selected ? barSelected[pkg.id] : state.playerCount}
                        onChange={(e) =>
                          setBarHeadcount(pkg.id, parseInt(e.target.value || "0", 10))
                        }
                        className="w-20 px-2 py-1 rounded border border-gray-300 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 4 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
