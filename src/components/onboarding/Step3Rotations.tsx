"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Nine {
  id: string;
  name: string;
}

interface RotationPair {
  id: string;
  nine_a_id: string;
  nine_b_id: string;
  nine_a: { name: string } | null;
  nine_b: { name: string } | null;
}

export default function Step3Rotations({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [pairs, setPairs] = useState<RotationPair[]>([]);
  const [nines, setNines] = useState<Nine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [nineAId, setNineAId] = useState("");
  const [nineBId, setNineBId] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    const [pairsRes, ninesRes] = await Promise.all([
      supabase
        .from("rotation_pairs")
        .select(
          "*, nine_a:nines!rotation_pairs_nine_a_id_fkey(name), nine_b:nines!rotation_pairs_nine_b_id_fkey(name)"
        )
        .eq("course_id", courseId),
      supabase
        .from("nines")
        .select("id, name")
        .eq("course_id", courseId)
        .order("sort_order"),
    ]);
    if (pairsRes.error) {
      setError(pairsRes.error.message);
    } else if (ninesRes.error) {
      setError(ninesRes.error.message);
    } else {
      setPairs(pairsRes.data ?? []);
      setNines(ninesRes.data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleAdd = async () => {
    setValidationError(null);
    if (!nineAId || !nineBId) {
      setValidationError("Please select both nines.");
      return;
    }
    if (nineAId === nineBId) {
      setValidationError("Nine A and Nine B must be different.");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("rotation_pairs").insert({
      course_id: courseId,
      nine_a_id: nineAId,
      nine_b_id: nineBId,
    });
    if (err) {
      setError(err.message);
    } else {
      setShowAdd(false);
      setNineAId("");
      setNineBId("");
      await fetchData();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("rotation_pairs").delete().eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setConfirmDeleteId(null);
      await fetchData();
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error && pairs.length === 0 && nines.length === 0 && !showAdd) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Rotation Pairs</h2>

      {nines.length === 0 && (
        <p className="text-amber-600 mb-4 text-sm">
          No nines configured yet. Go to Step 2 to add nines first.
        </p>
      )}

      {pairs.length > 0 ? (
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
              <th className="pb-2 pr-4">Nine A</th>
              <th className="pb-2 pr-4"></th>
              <th className="pb-2 pr-4">Nine B</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((pair, i) => (
              <tr
                key={pair.id}
                className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}
              >
                <td className="py-2 pr-4 text-gray-900">{pair.nine_a?.name ?? "—"}</td>
                <td className="py-2 pr-4 text-gray-400 text-center">↔</td>
                <td className="py-2 pr-4 text-gray-900">{pair.nine_b?.name ?? "—"}</td>
                <td className="py-2">
                  {confirmDeleteId === pair.id ? (
                    <span className="flex gap-2 items-center">
                      <span className="text-sm text-red-600">Are you sure?</span>
                      <button
                        onClick={() => handleDelete(pair.id)}
                        disabled={saving}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-sm text-gray-500 hover:text-gray-700"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(pair.id)}
                      className="text-sm text-red-500 hover:text-red-700 font-medium"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-500 mb-6">No rotation pairs configured yet.</p>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={fetchData}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Add Rotation Pair</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nine A</label>
              <select
                value={nineAId}
                onChange={(e) => { setNineAId(e.target.value); setValidationError(null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select…</option>
                {nines.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nine B</label>
              <select
                value={nineBId}
                onChange={(e) => { setNineBId(e.target.value); setValidationError(null); }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                <option value="">Select…</option>
                {nines.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {validationError && (
            <p className="mt-2 text-sm text-red-600">{validationError}</p>
          )}
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Saving…
                </span>
              ) : (
                "Add"
              )}
            </button>
            <button
              onClick={() => { setShowAdd(false); setValidationError(null); }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        disabled={showAdd || nines.length < 2}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        Add Rotation Pair
      </button>
    </div>
  );
}
