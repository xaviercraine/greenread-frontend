"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Addon {
  id: string;
  name: string;
  description: string | null;
  pricing_type: string;
  price: number;
  discount_eligible: boolean;
}

interface PricingRule {
  id: string;
  name: string;
  rule_type: string;
  multiplier: number | null;
  value: number | null;
  active: boolean;
  conditions: Record<string, unknown> | null;
}

export default function Step7Addons({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);

  // Addons state
  const [addons, setAddons] = useState<Addon[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(true);
  const [addonsError, setAddonsError] = useState<string | null>(null);
  const [addonsSaving, setAddonsSaving] = useState(false);
  const [showAddonAdd, setShowAddonAdd] = useState(false);
  const [addonAddName, setAddonAddName] = useState("");
  const [addonAddDesc, setAddonAddDesc] = useState("");
  const [addonAddPricingType, setAddonAddPricingType] = useState("per_person");
  const [addonAddPrice, setAddonAddPrice] = useState(0);
  const [addonAddDiscount, setAddonAddDiscount] = useState(true);
  const [addonEditingId, setAddonEditingId] = useState<string | null>(null);
  const [addonEditName, setAddonEditName] = useState("");
  const [addonEditDesc, setAddonEditDesc] = useState("");
  const [addonEditPricingType, setAddonEditPricingType] = useState("per_person");
  const [addonEditPrice, setAddonEditPrice] = useState(0);
  const [addonEditDiscount, setAddonEditDiscount] = useState(true);
  const [addonConfirmDeleteId, setAddonConfirmDeleteId] = useState<string | null>(null);

  // Pricing rules state
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [showRuleAdd, setShowRuleAdd] = useState(false);
  const [ruleAddName, setRuleAddName] = useState("");
  const [ruleAddType, setRuleAddType] = useState("");
  const [ruleAddMultiplier, setRuleAddMultiplier] = useState("");
  const [ruleAddValue, setRuleAddValue] = useState("");
  const [ruleAddConditions, setRuleAddConditions] = useState("");
  const [ruleAddActive, setRuleAddActive] = useState(true);
  const [ruleAddJsonError, setRuleAddJsonError] = useState<string | null>(null);
  const [ruleEditingId, setRuleEditingId] = useState<string | null>(null);
  const [ruleEditName, setRuleEditName] = useState("");
  const [ruleEditType, setRuleEditType] = useState("");
  const [ruleEditMultiplier, setRuleEditMultiplier] = useState("");
  const [ruleEditValue, setRuleEditValue] = useState("");
  const [ruleEditConditions, setRuleEditConditions] = useState("");
  const [ruleEditActive, setRuleEditActive] = useState(true);
  const [ruleEditJsonError, setRuleEditJsonError] = useState<string | null>(null);
  const [ruleConfirmDeleteId, setRuleConfirmDeleteId] = useState<string | null>(null);

  const PRICING_TYPES = ["per_person", "flat"] as const;

  const fetchAddons = async () => {
    setAddonsLoading(true);
    setAddonsError(null);
    const { data, error: err } = await supabase
      .from("addons")
      .select("*")
      .eq("course_id", courseId)
      .order("name");
    if (err) setAddonsError(err.message);
    else setAddons(data ?? []);
    setAddonsLoading(false);
  };

  const fetchRules = async () => {
    setRulesLoading(true);
    setRulesError(null);
    const { data, error: err } = await supabase
      .from("pricing_rules")
      .select("*")
      .eq("course_id", courseId)
      .order("rule_type");
    if (err) setRulesError(err.message);
    else setRules(data ?? []);
    setRulesLoading(false);
  };

  useEffect(() => {
    fetchAddons();
    fetchRules();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const parseJson = (value: string): { valid: boolean; parsed: Record<string, unknown> | null } => {
    const trimmed = value.trim();
    if (!trimmed) return { valid: true, parsed: null };
    try {
      return { valid: true, parsed: JSON.parse(trimmed) };
    } catch {
      return { valid: false, parsed: null };
    }
  };

  const formatLabel = (s: string) => s.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

  // Addon CRUD
  const handleAddonAdd = async () => {
    setAddonsSaving(true);
    setAddonsError(null);
    const { error: err } = await supabase.from("addons").insert({
      course_id: courseId,
      name: addonAddName,
      description: addonAddDesc || null,
      pricing_type: addonAddPricingType,
      price: addonAddPrice,
      discount_eligible: addonAddDiscount,
    });
    if (err) {
      setAddonsError(err.message);
    } else {
      setShowAddonAdd(false);
      setAddonAddName("");
      setAddonAddDesc("");
      setAddonAddPricingType("per_person");
      setAddonAddPrice(0);
      setAddonAddDiscount(true);
      await fetchAddons();
    }
    setAddonsSaving(false);
  };

  const handleAddonEdit = async (id: string) => {
    setAddonsSaving(true);
    setAddonsError(null);
    const { error: err } = await supabase
      .from("addons")
      .update({
        name: addonEditName,
        description: addonEditDesc || null,
        pricing_type: addonEditPricingType,
        price: addonEditPrice,
        discount_eligible: addonEditDiscount,
      })
      .eq("id", id);
    if (err) {
      setAddonsError(err.message);
    } else {
      setAddonEditingId(null);
      await fetchAddons();
    }
    setAddonsSaving(false);
  };

  const handleAddonDelete = async (id: string) => {
    setAddonsSaving(true);
    setAddonsError(null);
    const { error: err } = await supabase.from("addons").delete().eq("id", id);
    if (err) {
      setAddonsError(err.message);
    } else {
      setAddonConfirmDeleteId(null);
      await fetchAddons();
    }
    setAddonsSaving(false);
  };

  const startAddonEdit = (a: Addon) => {
    setAddonEditingId(a.id);
    setAddonEditName(a.name);
    setAddonEditDesc(a.description ?? "");
    setAddonEditPricingType(a.pricing_type);
    setAddonEditPrice(a.price);
    setAddonEditDiscount(a.discount_eligible);
  };

  // Rule CRUD
  const handleRuleAdd = async () => {
    const { valid, parsed } = parseJson(ruleAddConditions);
    if (!valid) {
      setRuleAddJsonError("Invalid JSON");
      return;
    }
    setRuleAddJsonError(null);
    setRulesSaving(true);
    setRulesError(null);
    const { error: err } = await supabase.from("pricing_rules").insert({
      course_id: courseId,
      name: ruleAddName,
      rule_type: ruleAddType,
      multiplier: ruleAddMultiplier ? parseFloat(ruleAddMultiplier) : null,
      value: ruleAddValue ? parseFloat(ruleAddValue) : null,
      conditions: parsed,
      active: ruleAddActive,
    });
    if (err) {
      setRulesError(err.message);
    } else {
      setShowRuleAdd(false);
      setRuleAddName("");
      setRuleAddType("");
      setRuleAddMultiplier("");
      setRuleAddValue("");
      setRuleAddConditions("");
      setRuleAddActive(true);
      await fetchRules();
    }
    setRulesSaving(false);
  };

  const handleRuleEdit = async (id: string) => {
    const { valid, parsed } = parseJson(ruleEditConditions);
    if (!valid) {
      setRuleEditJsonError("Invalid JSON");
      return;
    }
    setRuleEditJsonError(null);
    setRulesSaving(true);
    setRulesError(null);
    const { error: err } = await supabase
      .from("pricing_rules")
      .update({
        name: ruleEditName,
        rule_type: ruleEditType,
        multiplier: ruleEditMultiplier ? parseFloat(ruleEditMultiplier) : null,
        value: ruleEditValue ? parseFloat(ruleEditValue) : null,
        conditions: parsed,
        active: ruleEditActive,
      })
      .eq("id", id);
    if (err) {
      setRulesError(err.message);
    } else {
      setRuleEditingId(null);
      await fetchRules();
    }
    setRulesSaving(false);
  };

  const handleRuleDelete = async (id: string) => {
    setRulesSaving(true);
    setRulesError(null);
    const { error: err } = await supabase.from("pricing_rules").delete().eq("id", id);
    if (err) {
      setRulesError(err.message);
    } else {
      setRuleConfirmDeleteId(null);
      await fetchRules();
    }
    setRulesSaving(false);
  };

  const startRuleEdit = (r: PricingRule) => {
    setRuleEditingId(r.id);
    setRuleEditName(r.name);
    setRuleEditType(r.rule_type);
    setRuleEditMultiplier(r.multiplier?.toString() ?? "");
    setRuleEditValue(r.value?.toString() ?? "");
    setRuleEditConditions(r.conditions ? JSON.stringify(r.conditions) : "");
    setRuleEditActive(r.active);
    setRuleEditJsonError(null);
  };

  if (addonsLoading && rulesLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Add-ons Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Add-ons</h2>

        {addonsLoading ? (
          <div className="flex items-center justify-center min-h-[100px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : addonsError && addons.length === 0 && !showAddonAdd ? (
          <div>
            <p className="text-red-600 mb-4">{addonsError}</p>
            <button onClick={fetchAddons} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
          </div>
        ) : (
          <>
            {addons.length > 0 ? (
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Pricing Type</th>
                    <th className="pb-2 pr-4">Price</th>
                    <th className="pb-2 pr-4">Discount Eligible</th>
                    <th className="pb-2 pr-4">Description</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {addons.map((a, i) => (
                    <tr key={a.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
                      {addonEditingId === a.id ? (
                        <>
                          <td className="py-2 pr-4">
                            <input type="text" value={addonEditName} onChange={(e) => setAddonEditName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <select value={addonEditPricingType} onChange={(e) => setAddonEditPricingType(e.target.value)} className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500">
                              {PRICING_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                            </select>
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={addonEditPrice} onChange={(e) => setAddonEditPrice(parseFloat(e.target.value) || 0)} className="w-24 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="checkbox" checked={addonEditDiscount} onChange={(e) => setAddonEditDiscount(e.target.checked)} className="h-4 w-4 text-green-600 rounded focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="text" value={addonEditDesc} onChange={(e) => setAddonEditDesc(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => handleAddonEdit(a.id)} disabled={addonsSaving} className="text-sm text-green-600 hover:text-green-700 font-medium">Save</button>
                              <button onClick={() => setAddonEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-gray-900">{a.name}</td>
                          <td className="py-2 pr-4"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{formatLabel(a.pricing_type)}</span></td>
                          <td className="py-2 pr-4 text-gray-600">${a.price.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-gray-600">{a.discount_eligible ? "Yes" : "No"}</td>
                          <td className="py-2 pr-4 text-gray-600 text-sm max-w-[150px] truncate">{a.description ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => startAddonEdit(a)} className="text-sm text-green-600 hover:text-green-700 font-medium">Edit</button>
                              {addonConfirmDeleteId === a.id ? (
                                <span className="flex gap-2 items-center">
                                  <span className="text-sm text-red-600">Are you sure?</span>
                                  <button onClick={() => handleAddonDelete(a.id)} disabled={addonsSaving} className="text-sm text-red-600 hover:text-red-700 font-medium">Yes</button>
                                  <button onClick={() => setAddonConfirmDeleteId(null)} className="text-sm text-gray-500 hover:text-gray-700">No</button>
                                </span>
                              ) : (
                                <button onClick={() => setAddonConfirmDeleteId(a.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
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
              <p className="text-gray-500 mb-6">No add-ons configured yet.</p>
            )}

            {addonsError && (
              <div className="mb-4 flex items-center gap-3">
                <p className="text-red-600 text-sm">{addonsError}</p>
                <button onClick={fetchAddons} className="text-sm text-green-600 hover:text-green-700 font-medium">Retry</button>
              </div>
            )}

            {showAddonAdd && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Add-on</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Name</label>
                    <input type="text" value={addonAddName} onChange={(e) => setAddonAddName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Pricing Type</label>
                    <select value={addonAddPricingType} onChange={(e) => setAddonAddPricingType(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500">
                      {PRICING_TYPES.map((t) => <option key={t} value={t}>{formatLabel(t)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Price</label>
                    <input type="number" step="0.01" value={addonAddPrice} onChange={(e) => setAddonAddPrice(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <input type="checkbox" checked={addonAddDiscount} onChange={(e) => setAddonAddDiscount(e.target.checked)} className="h-4 w-4 text-green-600 rounded focus:ring-green-500" />
                    <label className="text-sm text-gray-600">Discount Eligible</label>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-600 mb-1">Description (optional)</label>
                    <textarea value={addonAddDesc} onChange={(e) => setAddonAddDesc(e.target.value)} rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleAddonAdd} disabled={addonsSaving || !addonAddName} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {addonsSaving ? (<span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving…</span>) : "Add"}
                  </button>
                  <button onClick={() => setShowAddonAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowAddonAdd(true)} disabled={showAddonAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Add Add-on
            </button>
          </>
        )}
      </div>

      {/* Pricing Rules Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Pricing Rules</h2>

        {rulesLoading ? (
          <div className="flex items-center justify-center min-h-[100px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : rulesError && rules.length === 0 && !showRuleAdd ? (
          <div>
            <p className="text-red-600 mb-4">{rulesError}</p>
            <button onClick={fetchRules} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
          </div>
        ) : (
          <>
            {rules.length > 0 ? (
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Rule Type</th>
                    <th className="pb-2 pr-4">Multiplier</th>
                    <th className="pb-2 pr-4">Value</th>
                    <th className="pb-2 pr-4">Active</th>
                    <th className="pb-2 pr-4">Conditions</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map((r, i) => (
                    <tr key={r.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
                      {ruleEditingId === r.id ? (
                        <>
                          <td className="py-2 pr-4">
                            <input type="text" value={ruleEditName} onChange={(e) => setRuleEditName(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="text" value={ruleEditType} onChange={(e) => setRuleEditType(e.target.value)} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={ruleEditMultiplier} onChange={(e) => setRuleEditMultiplier(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={ruleEditValue} onChange={(e) => setRuleEditValue(e.target.value)} className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="checkbox" checked={ruleEditActive} onChange={(e) => setRuleEditActive(e.target.checked)} className="h-4 w-4 text-green-600 rounded focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="text" value={ruleEditConditions} onChange={(e) => { setRuleEditConditions(e.target.value); setRuleEditJsonError(null); }} className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                            {ruleEditJsonError && <p className="text-red-500 text-xs mt-1">{ruleEditJsonError}</p>}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => handleRuleEdit(r.id)} disabled={rulesSaving} className="text-sm text-green-600 hover:text-green-700 font-medium">Save</button>
                              <button onClick={() => setRuleEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-gray-900">{r.name}</td>
                          <td className="py-2 pr-4"><span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">{formatLabel(r.rule_type)}</span></td>
                          <td className="py-2 pr-4 text-gray-600">{r.multiplier ?? "—"}</td>
                          <td className="py-2 pr-4 text-gray-600">{r.value ?? "—"}</td>
                          <td className="py-2 pr-4 text-gray-600">{r.active ? "Yes" : "No"}</td>
                          <td className="py-2 pr-4 text-gray-600 text-xs max-w-[150px] truncate">{r.conditions ? JSON.stringify(r.conditions) : "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => startRuleEdit(r)} className="text-sm text-green-600 hover:text-green-700 font-medium">Edit</button>
                              {ruleConfirmDeleteId === r.id ? (
                                <span className="flex gap-2 items-center">
                                  <span className="text-sm text-red-600">Are you sure?</span>
                                  <button onClick={() => handleRuleDelete(r.id)} disabled={rulesSaving} className="text-sm text-red-600 hover:text-red-700 font-medium">Yes</button>
                                  <button onClick={() => setRuleConfirmDeleteId(null)} className="text-sm text-gray-500 hover:text-gray-700">No</button>
                                </span>
                              ) : (
                                <button onClick={() => setRuleConfirmDeleteId(r.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
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
              <p className="text-gray-500 mb-6">No pricing rules configured yet.</p>
            )}

            {rulesError && (
              <div className="mb-4 flex items-center gap-3">
                <p className="text-red-600 text-sm">{rulesError}</p>
                <button onClick={fetchRules} className="text-sm text-green-600 hover:text-green-700 font-medium">Retry</button>
              </div>
            )}

            {showRuleAdd && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Pricing Rule</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Name</label>
                    <input type="text" value={ruleAddName} onChange={(e) => setRuleAddName(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Rule Type</label>
                    <input type="text" value={ruleAddType} onChange={(e) => setRuleAddType(e.target.value)} placeholder="e.g. base_rate, day_of_week, seasonal" className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Multiplier (optional)</label>
                    <input type="number" step="0.01" value={ruleAddMultiplier} onChange={(e) => setRuleAddMultiplier(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Value (optional)</label>
                    <input type="number" step="0.01" value={ruleAddValue} onChange={(e) => setRuleAddValue(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Conditions (JSON, optional)</label>
                    <textarea value={ruleAddConditions} onChange={(e) => { setRuleAddConditions(e.target.value); setRuleAddJsonError(null); }} placeholder='{"days": [0, 6]}' rows={2} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                    {ruleAddJsonError && <p className="text-red-500 text-xs mt-1">{ruleAddJsonError}</p>}
                  </div>
                  <div className="flex items-end gap-2 pb-1">
                    <input type="checkbox" checked={ruleAddActive} onChange={(e) => setRuleAddActive(e.target.checked)} className="h-4 w-4 text-green-600 rounded focus:ring-green-500" />
                    <label className="text-sm text-gray-600">Active</label>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleRuleAdd} disabled={rulesSaving || !ruleAddName || !ruleAddType} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {rulesSaving ? (<span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving…</span>) : "Add"}
                  </button>
                  <button onClick={() => setShowRuleAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowRuleAdd(true)} disabled={showRuleAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Add Pricing Rule
            </button>
          </>
        )}
      </div>
    </div>
  );
}
