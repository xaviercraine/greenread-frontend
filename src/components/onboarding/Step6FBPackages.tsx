"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface FBPackage {
  id: string;
  name: string;
  meal_type: string;
  price_per_person: number;
  cost_per_person: number | null;
  capacity_limit: number | null;
  description: string | null;
}

interface BarPackage {
  id: string;
  name: string;
  bar_type: string;
  price_per_person: number;
  cost_per_person: number | null;
  description: string | null;
}

const MEAL_TYPES = ["continental", "hot_buffet", "plated"] as const;
const BAR_TYPES = ["open_bar", "drink_tickets", "cash_bar", "hybrid"] as const;

export default function Step6FBPackages({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);

  // F&B state
  const [fbPackages, setFbPackages] = useState<FBPackage[]>([]);
  const [fbLoading, setFbLoading] = useState(true);
  const [fbError, setFbError] = useState<string | null>(null);
  const [fbSaving, setFbSaving] = useState(false);
  const [showFbAdd, setShowFbAdd] = useState(false);
  const [fbAddName, setFbAddName] = useState("");
  const [fbAddMealType, setFbAddMealType] = useState<string>("continental");
  const [fbAddPrice, setFbAddPrice] = useState(0);
  const [fbAddCost, setFbAddCost] = useState("");
  const [fbAddCapacity, setFbAddCapacity] = useState("");
  const [fbAddDesc, setFbAddDesc] = useState("");
  const [fbEditingId, setFbEditingId] = useState<string | null>(null);
  const [fbEditName, setFbEditName] = useState("");
  const [fbEditMealType, setFbEditMealType] = useState<string>("continental");
  const [fbEditPrice, setFbEditPrice] = useState(0);
  const [fbEditCost, setFbEditCost] = useState("");
  const [fbEditCapacity, setFbEditCapacity] = useState("");
  const [fbEditDesc, setFbEditDesc] = useState("");
  const [fbConfirmDeleteId, setFbConfirmDeleteId] = useState<string | null>(null);

  // Bar state
  const [barPackages, setBarPackages] = useState<BarPackage[]>([]);
  const [barLoading, setBarLoading] = useState(true);
  const [barError, setBarError] = useState<string | null>(null);
  const [barSaving, setBarSaving] = useState(false);
  const [showBarAdd, setShowBarAdd] = useState(false);
  const [barAddName, setBarAddName] = useState("");
  const [barAddType, setBarAddType] = useState<string>("open_bar");
  const [barAddPrice, setBarAddPrice] = useState(0);
  const [barAddCost, setBarAddCost] = useState("");
  const [barAddDesc, setBarAddDesc] = useState("");
  const [barEditingId, setBarEditingId] = useState<string | null>(null);
  const [barEditName, setBarEditName] = useState("");
  const [barEditType, setBarEditType] = useState<string>("open_bar");
  const [barEditPrice, setBarEditPrice] = useState(0);
  const [barEditCost, setBarEditCost] = useState("");
  const [barEditDesc, setBarEditDesc] = useState("");
  const [barConfirmDeleteId, setBarConfirmDeleteId] = useState<string | null>(null);

  const fetchFb = async () => {
    setFbLoading(true);
    setFbError(null);
    const { data, error: err } = await supabase
      .from("fb_packages")
      .select("*")
      .eq("course_id", courseId)
      .order("name");
    if (err) setFbError(err.message);
    else setFbPackages(data ?? []);
    setFbLoading(false);
  };

  const fetchBar = async () => {
    setBarLoading(true);
    setBarError(null);
    const { data, error: err } = await supabase
      .from("bar_packages")
      .select("*")
      .eq("course_id", courseId)
      .order("name");
    if (err) setBarError(err.message);
    else setBarPackages(data ?? []);
    setBarLoading(false);
  };

  useEffect(() => {
    fetchFb();
    fetchBar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  // F&B CRUD
  const handleFbAdd = async () => {
    setFbSaving(true);
    setFbError(null);
    const { error: err } = await supabase.from("fb_packages").insert({
      course_id: courseId,
      name: fbAddName,
      meal_type: fbAddMealType,
      price_per_person: fbAddPrice,
      cost_per_person: fbAddCost ? parseFloat(fbAddCost) : null,
      capacity_limit: fbAddCapacity ? parseInt(fbAddCapacity) : null,
      description: fbAddDesc || null,
    });
    if (err) {
      setFbError(err.message);
    } else {
      setShowFbAdd(false);
      setFbAddName("");
      setFbAddMealType("continental");
      setFbAddPrice(0);
      setFbAddCost("");
      setFbAddCapacity("");
      setFbAddDesc("");
      await fetchFb();
    }
    setFbSaving(false);
  };

  const handleFbEdit = async (id: string) => {
    setFbSaving(true);
    setFbError(null);
    const { error: err } = await supabase
      .from("fb_packages")
      .update({
        name: fbEditName,
        meal_type: fbEditMealType,
        price_per_person: fbEditPrice,
        cost_per_person: fbEditCost ? parseFloat(fbEditCost) : null,
        capacity_limit: fbEditCapacity ? parseInt(fbEditCapacity) : null,
        description: fbEditDesc || null,
      })
      .eq("id", id);
    if (err) {
      setFbError(err.message);
    } else {
      setFbEditingId(null);
      await fetchFb();
    }
    setFbSaving(false);
  };

  const handleFbDelete = async (id: string) => {
    setFbSaving(true);
    setFbError(null);
    const { error: err } = await supabase.from("fb_packages").delete().eq("id", id);
    if (err) {
      setFbError(err.message);
    } else {
      setFbConfirmDeleteId(null);
      await fetchFb();
    }
    setFbSaving(false);
  };

  const startFbEdit = (pkg: FBPackage) => {
    setFbEditingId(pkg.id);
    setFbEditName(pkg.name);
    setFbEditMealType(pkg.meal_type);
    setFbEditPrice(pkg.price_per_person);
    setFbEditCost(pkg.cost_per_person?.toString() ?? "");
    setFbEditCapacity(pkg.capacity_limit?.toString() ?? "");
    setFbEditDesc(pkg.description ?? "");
  };

  // Bar CRUD
  const handleBarAdd = async () => {
    setBarSaving(true);
    setBarError(null);
    const { error: err } = await supabase.from("bar_packages").insert({
      course_id: courseId,
      name: barAddName,
      bar_type: barAddType,
      price_per_person: barAddPrice,
      cost_per_person: barAddCost ? parseFloat(barAddCost) : null,
      description: barAddDesc || null,
    });
    if (err) {
      setBarError(err.message);
    } else {
      setShowBarAdd(false);
      setBarAddName("");
      setBarAddType("open_bar");
      setBarAddPrice(0);
      setBarAddCost("");
      setBarAddDesc("");
      await fetchBar();
    }
    setBarSaving(false);
  };

  const handleBarEdit = async (id: string) => {
    setBarSaving(true);
    setBarError(null);
    const { error: err } = await supabase
      .from("bar_packages")
      .update({
        name: barEditName,
        bar_type: barEditType,
        price_per_person: barEditPrice,
        cost_per_person: barEditCost ? parseFloat(barEditCost) : null,
        description: barEditDesc || null,
      })
      .eq("id", id);
    if (err) {
      setBarError(err.message);
    } else {
      setBarEditingId(null);
      await fetchBar();
    }
    setBarSaving(false);
  };

  const handleBarDelete = async (id: string) => {
    setBarSaving(true);
    setBarError(null);
    const { error: err } = await supabase.from("bar_packages").delete().eq("id", id);
    if (err) {
      setBarError(err.message);
    } else {
      setBarConfirmDeleteId(null);
      await fetchBar();
    }
    setBarSaving(false);
  };

  const startBarEdit = (pkg: BarPackage) => {
    setBarEditingId(pkg.id);
    setBarEditName(pkg.name);
    setBarEditType(pkg.bar_type);
    setBarEditPrice(pkg.price_per_person);
    setBarEditCost(pkg.cost_per_person?.toString() ?? "");
    setBarEditDesc(pkg.description ?? "");
  };

  const formatLabel = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  if (fbLoading && barLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* F&B Packages Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">F&B Packages</h2>

        {fbLoading ? (
          <div className="flex items-center justify-center min-h-[100px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : fbError && fbPackages.length === 0 && !showFbAdd ? (
          <div>
            <p className="text-red-600 mb-4">{fbError}</p>
            <button onClick={fetchFb} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
          </div>
        ) : (
          <>
            {fbPackages.length > 0 ? (
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Meal Type</th>
                    <th className="pb-2 pr-4">Price/Person</th>
                    <th className="pb-2 pr-4">Cost/Person</th>
                    <th className="pb-2 pr-4">Capacity Limit</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {fbPackages.map((pkg, i) => (
                    <tr key={pkg.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
                      {fbEditingId === pkg.id ? (
                        <>
                          <td className="py-2 pr-4">
                            <input type="text" value={fbEditName} onChange={(e) => setFbEditName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <select value={fbEditMealType} onChange={(e) => setFbEditMealType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500">
                              {MEAL_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={fbEditPrice} onChange={(e) => setFbEditPrice(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={fbEditCost} onChange={(e) => setFbEditCost(e.target.value)} placeholder="Optional" className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" value={fbEditCapacity} onChange={(e) => setFbEditCapacity(e.target.value)} placeholder="Optional" className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="text" value={fbEditDesc} onChange={(e) => setFbEditDesc(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => handleFbEdit(pkg.id)} disabled={fbSaving} className="text-sm text-green-600 hover:text-green-700 font-medium">Save</button>
                              <button onClick={() => setFbEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-gray-900">{pkg.name}</td>
                          <td className="py-2 pr-4"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{formatLabel(pkg.meal_type)}</span></td>
                          <td className="py-2 pr-4 text-gray-600">${pkg.price_per_person.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-gray-600">{pkg.cost_per_person != null ? `$${pkg.cost_per_person.toFixed(2)}` : "—"}</td>
                          <td className="py-2 pr-4 text-gray-600">{pkg.capacity_limit ?? "—"}</td>
                          <td className="py-2 pr-4 text-gray-600 text-sm max-w-[150px] truncate">{pkg.description ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => startFbEdit(pkg)} className="text-sm text-green-600 hover:text-green-700 font-medium">Edit</button>
                              {fbConfirmDeleteId === pkg.id ? (
                                <span className="flex gap-2 items-center">
                                  <span className="text-sm text-red-600">Are you sure?</span>
                                  <button onClick={() => handleFbDelete(pkg.id)} disabled={fbSaving} className="text-sm text-red-600 hover:text-red-700 font-medium">Yes</button>
                                  <button onClick={() => setFbConfirmDeleteId(null)} className="text-sm text-gray-500 hover:text-gray-700">No</button>
                                </span>
                              ) : (
                                <button onClick={() => setFbConfirmDeleteId(pkg.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 mb-6">No F&B packages configured yet.</p>
            )}

            {fbError && (
              <div className="mb-4 flex items-center gap-3">
                <p className="text-red-600 text-sm">{fbError}</p>
                <button onClick={fetchFb} className="text-sm text-green-600 hover:text-green-700 font-medium">Retry</button>
              </div>
            )}

            {showFbAdd && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add F&B Package</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Name</label>
                    <input type="text" value={fbAddName} onChange={(e) => setFbAddName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Meal Type</label>
                    <select value={fbAddMealType} onChange={(e) => setFbAddMealType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                      {MEAL_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Price per Person</label>
                    <input type="number" step="0.01" value={fbAddPrice} onChange={(e) => setFbAddPrice(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Cost per Person (optional)</label>
                    <input type="number" step="0.01" value={fbAddCost} onChange={(e) => setFbAddCost(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Capacity Limit (optional)</label>
                    <input type="number" value={fbAddCapacity} onChange={(e) => setFbAddCapacity(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Description (optional)</label>
                    <textarea value={fbAddDesc} onChange={(e) => setFbAddDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleFbAdd} disabled={fbSaving || !fbAddName} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {fbSaving ? (<span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving…</span>) : "Add"}
                  </button>
                  <button onClick={() => setShowFbAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowFbAdd(true)} disabled={showFbAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Add F&B Package
            </button>
          </>
        )}
      </div>

      {/* Bar Packages Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Bar Packages</h2>

        {barLoading ? (
          <div className="flex items-center justify-center min-h-[100px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : barError && barPackages.length === 0 && !showBarAdd ? (
          <div>
            <p className="text-red-600 mb-4">{barError}</p>
            <button onClick={fetchBar} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
          </div>
        ) : (
          <>
            {barPackages.length > 0 ? (
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Bar Type</th>
                    <th className="pb-2 pr-4">Price/Person</th>
                    <th className="pb-2 pr-4">Cost/Person</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {barPackages.map((pkg, i) => (
                    <tr key={pkg.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
                      {barEditingId === pkg.id ? (
                        <>
                          <td className="py-2 pr-4">
                            <input type="text" value={barEditName} onChange={(e) => setBarEditName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <select value={barEditType} onChange={(e) => setBarEditType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500">
                              {BAR_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={barEditPrice} onChange={(e) => setBarEditPrice(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={barEditCost} onChange={(e) => setBarEditCost(e.target.value)} placeholder="Optional" className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="text" value={barEditDesc} onChange={(e) => setBarEditDesc(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => handleBarEdit(pkg.id)} disabled={barSaving} className="text-sm text-green-600 hover:text-green-700 font-medium">Save</button>
                              <button onClick={() => setBarEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-gray-900">{pkg.name}</td>
                          <td className="py-2 pr-4"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{formatLabel(pkg.bar_type)}</span></td>
                          <td className="py-2 pr-4 text-gray-600">${pkg.price_per_person.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-gray-600">{pkg.cost_per_person != null ? `$${pkg.cost_per_person.toFixed(2)}` : "—"}</td>
                          <td className="py-2 pr-4 text-gray-600 text-sm max-w-[150px] truncate">{pkg.description ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => startBarEdit(pkg)} className="text-sm text-green-600 hover:text-green-700 font-medium">Edit</button>
                              {barConfirmDeleteId === pkg.id ? (
                                <span className="flex gap-2 items-center">
                                  <span className="text-sm text-red-600">Are you sure?</span>
                                  <button onClick={() => handleBarDelete(pkg.id)} disabled={barSaving} className="text-sm text-red-600 hover:text-red-700 font-medium">Yes</button>
                                  <button onClick={() => setBarConfirmDeleteId(null)} className="text-sm text-gray-500 hover:text-gray-700">No</button>
                                </span>
                              ) : (
                                <button onClick={() => setBarConfirmDeleteId(pkg.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
                              )}
                            </div>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-500 mb-6">No bar packages configured yet.</p>
            )}

            {barError && (
              <div className="mb-4 flex items-center gap-3">
                <p className="text-red-600 text-sm">{barError}</p>
                <button onClick={fetchBar} className="text-sm text-green-600 hover:text-green-700 font-medium">Retry</button>
              </div>
            )}

            {showBarAdd && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Bar Package</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Name</label>
                    <input type="text" value={barAddName} onChange={(e) => setBarAddName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Bar Type</label>
                    <select value={barAddType} onChange={(e) => setBarAddType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                      {BAR_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Price per Person</label>
                    <input type="number" step="0.01" value={barAddPrice} onChange={(e) => setBarAddPrice(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Cost per Person (optional)</label>
                    <input type="number" step="0.01" value={barAddCost} onChange={(e) => setBarAddCost(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">Description (optional)</label>
                    <textarea value={barAddDesc} onChange={(e) => setBarAddDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleBarAdd} disabled={barSaving || !barAddName} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {barSaving ? (<span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving…</span>) : "Add"}
                  </button>
                  <button onClick={() => setShowBarAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowBarAdd(true)} disabled={showBarAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Add Bar Package
            </button>
          </>
        )}
      </div>
    </div>
  );
}
