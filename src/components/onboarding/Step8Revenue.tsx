"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

interface RevenueTarget {
  id: string;
  period_start: string;
  period_end: string;
  target_amount: number;
  baseline_amount: number | null;
  growth_target_pct: number | null;
  source: string | null;
}

export default function Step8Revenue({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);

  // Soft threshold
  const [threshold, setThreshold] = useState(80);
  const [thresholdLoading, setThresholdLoading] = useState(true);
  const [thresholdError, setThresholdError] = useState<string | null>(null);
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [thresholdSaved, setThresholdSaved] = useState(false);

  // Revenue targets
  const [targets, setTargets] = useState<RevenueTarget[]>([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [targetsError, setTargetsError] = useState<string | null>(null);
  const [targetsSaving, setTargetsSaving] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addPeriodStart, setAddPeriodStart] = useState("");
  const [addPeriodEnd, setAddPeriodEnd] = useState("");
  const [addTargetAmount, setAddTargetAmount] = useState(0);
  const [addBaseline, setAddBaseline] = useState("");
  const [addGrowth, setAddGrowth] = useState("");
  const [addSource, setAddSource] = useState("");

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPeriodStart, setEditPeriodStart] = useState("");
  const [editPeriodEnd, setEditPeriodEnd] = useState("");
  const [editTargetAmount, setEditTargetAmount] = useState(0);
  const [editBaseline, setEditBaseline] = useState("");
  const [editGrowth, setEditGrowth] = useState("");
  const [editSource, setEditSource] = useState("");

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Simulation
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState<string | null>(null);
  const [simResult, setSimResult] = useState<number | null>(null);
  const [simElapsed, setSimElapsed] = useState(0);

  const SIM_MESSAGES = [
    "Analyzing course layout and nine configurations...",
    "Calculating format capacities and rotation constraints...",
    "Running tournament simulations across day types...",
    "Generating constraint boundaries...",
  ];

  const fetchThreshold = async () => {
    setThresholdLoading(true);
    setThresholdError(null);
    const { data, error: err } = await supabase
      .from("courses")
      .select("soft_threshold")
      .eq("id", courseId)
      .single();
    if (err) {
      setThresholdError(err.message);
    } else {
      setThreshold(data?.soft_threshold != null ? Math.round(data.soft_threshold * 100) : 80);
    }
    setThresholdLoading(false);
  };

  const fetchTargets = async () => {
    setTargetsLoading(true);
    setTargetsError(null);
    const { data, error: err } = await supabase
      .from("revenue_targets")
      .select("*")
      .eq("course_id", courseId)
      .order("period_start");
    if (err) {
      setTargetsError(err.message);
    } else {
      setTargets(data ?? []);
    }
    setTargetsLoading(false);
  };

  useEffect(() => {
    fetchThreshold();
    fetchTargets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleSaveThreshold = async () => {
    setThresholdSaving(true);
    setThresholdError(null);
    setThresholdSaved(false);
    const { error: err } = await supabase
      .from("courses")
      .update({ soft_threshold: threshold / 100 })
      .eq("id", courseId);
    if (err) {
      setThresholdError(err.message);
    } else {
      setThresholdSaved(true);
    }
    setThresholdSaving(false);
  };

  const handleAdd = async () => {
    setTargetsSaving(true);
    setTargetsError(null);
    const { error: err } = await supabase.from("revenue_targets").insert({
      course_id: courseId,
      period_start: addPeriodStart,
      period_end: addPeriodEnd,
      target_amount: addTargetAmount,
      baseline_amount: addBaseline ? parseFloat(addBaseline) : null,
      growth_target_pct: addGrowth ? parseFloat(addGrowth) : null,
      source: addSource || null,
    });
    if (err) {
      setTargetsError(err.message);
    } else {
      setShowAdd(false);
      setAddPeriodStart("");
      setAddPeriodEnd("");
      setAddTargetAmount(0);
      setAddBaseline("");
      setAddGrowth("");
      setAddSource("");
      await fetchTargets();
    }
    setTargetsSaving(false);
  };

  const handleEdit = async (id: string) => {
    setTargetsSaving(true);
    setTargetsError(null);
    const { error: err } = await supabase
      .from("revenue_targets")
      .update({
        period_start: editPeriodStart,
        period_end: editPeriodEnd,
        target_amount: editTargetAmount,
        baseline_amount: editBaseline ? parseFloat(editBaseline) : null,
        growth_target_pct: editGrowth ? parseFloat(editGrowth) : null,
        source: editSource || null,
      })
      .eq("id", id);
    if (err) {
      setTargetsError(err.message);
    } else {
      setEditingId(null);
      await fetchTargets();
    }
    setTargetsSaving(false);
  };

  const handleDelete = async (id: string) => {
    setTargetsSaving(true);
    setTargetsError(null);
    const { error: err } = await supabase.from("revenue_targets").delete().eq("id", id);
    if (err) {
      setTargetsError(err.message);
    } else {
      setConfirmDeleteId(null);
      await fetchTargets();
    }
    setTargetsSaving(false);
  };

  const startEdit = (t: RevenueTarget) => {
    setEditingId(t.id);
    setEditPeriodStart(t.period_start);
    setEditPeriodEnd(t.period_end);
    setEditTargetAmount(t.target_amount);
    setEditBaseline(t.baseline_amount?.toString() ?? "");
    setEditGrowth(t.growth_target_pct?.toString() ?? "");
    setEditSource(t.source ?? "");
  };

  const handleRunSimulation = async () => {
    setSimLoading(true);
    setSimError(null);
    setSimResult(null);
    setSimElapsed(0);
    const startTime = Date.now();
    const interval = setInterval(() => {
      setSimElapsed(Date.now() - startTime);
    }, 100);

    const rpcPromise = supabase.rpc("run_simulation", { p_course_id: courseId });
    const minDelay = new Promise((resolve) => setTimeout(resolve, 12000));

    const [rpcResult] = await Promise.all([rpcPromise, minDelay]);
    clearInterval(interval);

    const { data, error: err } = rpcResult;
    if (err) {
      setSimError(err.message);
    } else {
      setSimResult(data?.boundaries_written ?? 0);
    }
    setSimLoading(false);
  };

  if (thresholdLoading && targetsLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Soft Threshold Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Course Soft Threshold</h2>

        {thresholdLoading ? (
          <div className="flex items-center justify-center min-h-[100px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : thresholdError && !thresholdSaved ? (
          <div>
            <p className="text-red-600 mb-4">{thresholdError}</p>
            <button onClick={fetchThreshold} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
          </div>
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-4">
              The soft threshold determines when dynamic pricing activates. At 80%, once a day reaches 80% of its maximum tournament capacity, prices begin to increase. This encourages organizers to book on less busy days and maximizes your revenue on high-demand dates.
            </p>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Soft Threshold (%)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={threshold}
                    onChange={(e) => { setThreshold(parseInt(e.target.value) || 0); setThresholdSaved(false); }}
                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <span className="text-gray-500">%</span>
                </div>
              </div>
            </div>

            {thresholdError && (
              <div className="mt-4 flex items-center gap-3">
                <p className="text-red-600 text-sm">{thresholdError}</p>
                <button onClick={handleSaveThreshold} className="text-sm text-green-600 hover:text-green-700 font-medium">Retry</button>
              </div>
            )}

            <div className="mt-4 flex items-center gap-4">
              <button
                onClick={handleSaveThreshold}
                disabled={thresholdSaving}
                className="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {thresholdSaving ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    Saving…
                  </span>
                ) : (
                  "Save"
                )}
              </button>
              {thresholdSaved && <span className="text-green-600 text-sm font-medium">Saved!</span>}
            </div>
          </>
        )}
      </div>

      {/* Revenue Targets Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Revenue Targets</h2>
        <p className="text-sm text-gray-600 mb-6">
          Revenue targets set your monthly income goals from tournaments. The system uses these to track actual bookings against your targets and flag months that need attention.
        </p>

        {targetsLoading ? (
          <div className="flex items-center justify-center min-h-[100px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        ) : targetsError && targets.length === 0 && !showAdd ? (
          <div>
            <p className="text-red-600 mb-4">{targetsError}</p>
            <button onClick={fetchTargets} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700">Retry</button>
          </div>
        ) : (
          <>
            {targets.length > 0 ? (
              <table className="w-full mb-6">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
                    <th className="pb-2 pr-4">Period Start</th>
                    <th className="pb-2 pr-4">Period End</th>
                    <th className="pb-2 pr-4">Target Amount</th>
                    <th className="pb-2 pr-4">Baseline Amount</th>
                    <th className="pb-2 pr-4">Growth %</th>
                    <th className="pb-2 pr-4">Source</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {targets.map((t, i) => (
                    <tr key={t.id} className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}>
                      {editingId === t.id ? (
                        <>
                          <td className="py-2 pr-4">
                            <input type="date" value={editPeriodStart} onChange={(e) => setEditPeriodStart(e.target.value)} className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="date" value={editPeriodEnd} onChange={(e) => setEditPeriodEnd(e.target.value)} className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={editTargetAmount} onChange={(e) => setEditTargetAmount(parseFloat(e.target.value) || 0)} className="w-28 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.01" value={editBaseline} onChange={(e) => setEditBaseline(e.target.value)} placeholder="Optional" className="w-28 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="number" step="0.1" value={editGrowth} onChange={(e) => setEditGrowth(e.target.value)} placeholder="Optional" className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2 pr-4">
                            <input type="text" value={editSource} onChange={(e) => setEditSource(e.target.value)} placeholder="Optional" className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500" />
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => handleEdit(t.id)} disabled={targetsSaving} className="text-sm text-green-600 hover:text-green-700 font-medium">Save</button>
                              <button onClick={() => setEditingId(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="py-2 pr-4 text-gray-900">{t.period_start}</td>
                          <td className="py-2 pr-4 text-gray-600">{t.period_end}</td>
                          <td className="py-2 pr-4 text-gray-600">${t.target_amount.toFixed(2)}</td>
                          <td className="py-2 pr-4 text-gray-600">{t.baseline_amount != null ? `$${t.baseline_amount.toFixed(2)}` : "—"}</td>
                          <td className="py-2 pr-4 text-gray-600">{t.growth_target_pct != null ? `${t.growth_target_pct}%` : "—"}</td>
                          <td className="py-2 pr-4 text-gray-600">{t.source ?? "—"}</td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button onClick={() => startEdit(t)} className="text-sm text-green-600 hover:text-green-700 font-medium">Edit</button>
                              {confirmDeleteId === t.id ? (
                                <span className="flex gap-2 items-center">
                                  <span className="text-sm text-red-600">Are you sure?</span>
                                  <button onClick={() => handleDelete(t.id)} disabled={targetsSaving} className="text-sm text-red-600 hover:text-red-700 font-medium">Yes</button>
                                  <button onClick={() => setConfirmDeleteId(null)} className="text-sm text-gray-500 hover:text-gray-700">No</button>
                                </span>
                              ) : (
                                <button onClick={() => setConfirmDeleteId(t.id)} className="text-sm text-red-500 hover:text-red-700 font-medium">Delete</button>
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
              <p className="text-gray-500 mb-6">No revenue targets configured yet.</p>
            )}

            {targetsError && (
              <div className="mb-4 flex items-center gap-3">
                <p className="text-red-600 text-sm">{targetsError}</p>
                <button onClick={fetchTargets} className="text-sm text-green-600 hover:text-green-700 font-medium">Retry</button>
              </div>
            )}

            {showAdd && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Add Revenue Target</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Period Start</label>
                    <input type="date" value={addPeriodStart} onChange={(e) => setAddPeriodStart(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Period End</label>
                    <input type="date" value={addPeriodEnd} onChange={(e) => setAddPeriodEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Target Amount</label>
                    <input type="number" step="0.01" value={addTargetAmount} onChange={(e) => setAddTargetAmount(parseFloat(e.target.value) || 0)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Baseline Amount (optional)</label>
                    <input type="number" step="0.01" value={addBaseline} onChange={(e) => setAddBaseline(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Growth Target % (optional)</label>
                    <input type="number" step="0.1" value={addGrowth} onChange={(e) => setAddGrowth(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Source (optional)</label>
                    <input type="text" value={addSource} onChange={(e) => setAddSource(e.target.value)} placeholder='e.g. "tournament"' className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500" />
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button onClick={handleAdd} disabled={targetsSaving || !addPeriodStart || !addPeriodEnd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                    {targetsSaving ? (<span className="flex items-center gap-2"><span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />Saving…</span>) : "Add"}
                  </button>
                  <button onClick={() => setShowAdd(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowAdd(true)} disabled={showAdd} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
              Add Revenue Target
            </button>
          </>
        )}
      </div>

      {/* Complete Setup Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-6">Complete Setup</h2>

        {simResult !== null ? (
          <div className="space-y-4">
            <p className="text-green-600 font-medium">
              Simulation complete! {simResult} constraint boundaries generated.
            </p>
            <Link
              href="/"
              className="inline-block text-green-600 hover:text-green-700 font-medium"
            >
              Go to Dashboard &rarr;
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Running the simulation analyzes your course configuration — nines, formats, and capacity — to calculate the maximum number of tournaments and players each day type (weekday, weekend, holiday) can support. These constraint boundaries power the availability engine.
            </p>
            {simError && (
              <div className="flex items-center gap-3">
                <p className="text-red-600 text-sm">{simError}</p>
                <button
                  onClick={handleRunSimulation}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Retry
                </button>
              </div>
            )}
            {simLoading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-6 border border-green-200 rounded-lg bg-green-50">
                <div className="relative">
                  <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-200 border-t-green-600" />
                </div>
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-600 animate-bounce [animation-delay:-0.3s]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-600 animate-bounce [animation-delay:-0.15s]" />
                  <span className="h-2.5 w-2.5 rounded-full bg-green-600 animate-bounce" />
                </div>
                <p className="text-green-800 font-medium text-center px-6 transition-opacity duration-300">
                  {SIM_MESSAGES[Math.min(Math.floor(simElapsed / 3000), SIM_MESSAGES.length - 1)]}
                </p>
                <div className="w-64 bg-green-200 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full bg-green-600 transition-all duration-100"
                    style={{ width: `${Math.min((simElapsed / 12000) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={handleRunSimulation}
                disabled={simLoading}
                className="px-8 py-3 bg-green-600 text-white rounded-lg text-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                Complete Setup & Run Simulation
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
