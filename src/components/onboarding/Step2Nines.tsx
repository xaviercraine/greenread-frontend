"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Nine {
  id: string;
  name: string;
  holes: number;
  sort_order: number;
}

export default function Step2Nines({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [nines, setNines] = useState<Nine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addHoles, setAddHoles] = useState(9);
  const [addSortOrder, setAddSortOrder] = useState(1);

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editHoles, setEditHoles] = useState(9);
  const [editSortOrder, setEditSortOrder] = useState(1);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchNines = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("nines")
      .select("*")
      .eq("course_id", courseId)
      .order("sort_order");
    if (err) {
      setError(err.message);
    } else {
      setNines(data ?? []);
      setAddSortOrder((data?.length ?? 0) + 1);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNines();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  const handleAdd = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("nines").insert({
      course_id: courseId,
      name: addName,
      holes: addHoles,
      sort_order: addSortOrder,
    });
    if (err) {
      setError(err.message);
    } else {
      setShowAdd(false);
      setAddName("");
      setAddHoles(9);
      await fetchNines();
    }
    setSaving(false);
  };

  const handleStandard18 = async () => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("nines").insert([
      { course_id: courseId, name: "Front 9", holes: 9, sort_order: 1 },
      { course_id: courseId, name: "Back 9", holes: 9, sort_order: 2 },
    ]);
    if (err) {
      setError(err.message);
    } else {
      await fetchNines();
    }
    setSaving(false);
  };

  const handleEdit = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("nines")
      .update({ name: editName, holes: editHoles, sort_order: editSortOrder })
      .eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setEditingId(null);
      await fetchNines();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("nines").delete().eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setConfirmDeleteId(null);
      await fetchNines();
    }
    setSaving(false);
  };

  const startEdit = (nine: Nine) => {
    setEditingId(nine.id);
    setEditName(nine.name);
    setEditHoles(nine.holes);
    setEditSortOrder(nine.sort_order);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error && nines.length === 0 && !showAdd) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchNines}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Nines</h2>

      {nines.length > 0 ? (
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Holes</th>
              <th className="pb-2 pr-4">Sort Order</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {nines.map((nine, i) => (
              <tr
                key={nine.id}
                className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}
              >
                {editingId === nine.id ? (
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
                      <input
                        type="number"
                        value={editHoles}
                        onChange={(e) => setEditHoles(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        value={editSortOrder}
                        onChange={(e) => setEditSortOrder(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(nine.id)}
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
                    <td className="py-2 pr-4 text-gray-900">{nine.name}</td>
                    <td className="py-2 pr-4 text-gray-600">{nine.holes}</td>
                    <td className="py-2 pr-4 text-gray-600">{nine.sort_order}</td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(nine)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === nine.id ? (
                          <span className="flex gap-2 items-center">
                            <span className="text-sm text-red-600">Are you sure? This cannot be undone.</span>
                            <button
                              onClick={() => handleDelete(nine.id)}
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
                            onClick={() => setConfirmDeleteId(nine.id)}
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
        <p className="text-gray-500 mb-6">No nines configured yet.</p>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={fetchNines}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Add Nine</h3>
          <div className="grid grid-cols-3 gap-4">
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
              <label className="block text-sm text-gray-600 mb-1">Holes</label>
              <input
                type="number"
                value={addHoles}
                onChange={(e) => setAddHoles(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Sort Order</label>
              <input
                type="number"
                value={addSortOrder}
                onChange={(e) => setAddSortOrder(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
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

      <div className="flex gap-3">
        <button
          onClick={() => setShowAdd(true)}
          disabled={showAdd}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          Add Nine
        </button>
        {nines.length === 0 && (
          <button
            onClick={handleStandard18}
            disabled={saving}
            className="px-4 py-2 border border-green-600 text-green-600 rounded-lg text-sm font-medium hover:bg-green-50 disabled:opacity-50"
          >
            Standard 18
          </button>
        )}
      </div>
    </div>
  );
}
