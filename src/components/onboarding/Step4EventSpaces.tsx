"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import NumberInput from "@/components/common/NumberInput";

interface EventSpace {
  id: string;
  name: string;
  min_capacity: number;
  max_capacity: number;
  pricing_tier: string;
}

const PRICING_TIERS = ["economy", "standard", "premium"] as const;

export default function Step4EventSpaces({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [spaces, setSpaces] = useState<EventSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addMinCap, setAddMinCap] = useState(0);
  const [addMaxCap, setAddMaxCap] = useState(0);
  const [addTier, setAddTier] = useState<string>("standard");

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMinCap, setEditMinCap] = useState(0);
  const [editMaxCap, setEditMaxCap] = useState(0);
  const [editTier, setEditTier] = useState<string>("standard");

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchSpaces = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("event_spaces")
      .select("*")
      .eq("course_id", courseId)
      .order("name");
    if (err) {
      setError(err.message);
    } else {
      setSpaces(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSpaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("event_spaces").insert({
      course_id: courseId,
      name: addName,
      min_capacity: addMinCap,
      max_capacity: addMaxCap,
      pricing_tier: addTier,
    });
    if (err) {
      setError(err.message);
    } else {
      setShowAdd(false);
      setAddName("");
      setAddMinCap(0);
      setAddMaxCap(0);
      setAddTier("standard");
      await fetchSpaces();
    }
    setSaving(false);
  };

  const handleEdit = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("event_spaces")
      .update({
        name: editName,
        min_capacity: editMinCap,
        max_capacity: editMaxCap,
        pricing_tier: editTier,
      })
      .eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setEditingId(null);
      await fetchSpaces();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("event_spaces").delete().eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setConfirmDeleteId(null);
      await fetchSpaces();
    }
    setSaving(false);
  };

  const startEdit = (space: EventSpace) => {
    setEditingId(space.id);
    setEditName(space.name);
    setEditMinCap(space.min_capacity);
    setEditMaxCap(space.max_capacity);
    setEditTier(space.pricing_tier);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error && spaces.length === 0 && !showAdd) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchSpaces}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Event Spaces</h2>

      {spaces.length > 0 ? (
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Min Capacity</th>
              <th className="pb-2 pr-4">Max Capacity</th>
              <th className="pb-2 pr-4">Pricing Tier</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {spaces.map((space, i) => (
              <tr
                key={space.id}
                className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}
              >
                {editingId === space.id ? (
                  <>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <NumberInput
                        integer
                        min={0}
                        max={1000}
                        value={editMinCap}
                        onChange={setEditMinCap}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <NumberInput
                        integer
                        min={0}
                        max={1000}
                        value={editMaxCap}
                        onChange={setEditMaxCap}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <select
                        value={editTier}
                        onChange={(e) => setEditTier(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {PRICING_TIERS.map((t) => (
                          <option key={t} value={t}>
                            {t.charAt(0).toUpperCase() + t.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(space.id)}
                          disabled={saving}
                          className="text-sm text-green-600 hover:text-green-700 font-medium"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-sm text-gray-500 hover:text-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="py-2 pr-4 text-gray-900">{space.name}</td>
                    <td className="py-2 pr-4 text-gray-600">{space.min_capacity}</td>
                    <td className="py-2 pr-4 text-gray-600">{space.max_capacity}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          space.pricing_tier === "premium"
                            ? "bg-purple-100 text-purple-800"
                            : space.pricing_tier === "standard"
                            ? "bg-blue-100 text-blue-800"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {space.pricing_tier.charAt(0).toUpperCase() + space.pricing_tier.slice(1)}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(space)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === space.id ? (
                          <span className="flex gap-2 items-center">
                            <span className="text-sm text-red-600">Are you sure?</span>
                            <button
                              onClick={() => handleDelete(space.id)}
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
                            onClick={() => setConfirmDeleteId(space.id)}
                            className="text-sm text-red-500 hover:text-red-700 font-medium"
                          >
                            Delete
                          </button>
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
        <p className="text-gray-500 mb-6">No event spaces configured yet.</p>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={fetchSpaces}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Add Event Space</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name</label>
              <input
                type="text"
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Min Capacity</label>
              <NumberInput
                integer
                min={0}
                max={1000}
                value={addMinCap}
                onChange={setAddMinCap}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">max 1000</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Max Capacity</label>
              <NumberInput
                integer
                min={0}
                max={1000}
                value={addMaxCap}
                onChange={setAddMaxCap}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <p className="text-xs text-gray-400 mt-1">max 1000</p>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Pricing Tier</label>
              <select
                value={addTier}
                onChange={(e) => setAddTier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {PRICING_TIERS.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !addName}
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
              onClick={() => setShowAdd(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        disabled={showAdd}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
      >
        Add Event Space
      </button>
    </div>
  );
}
