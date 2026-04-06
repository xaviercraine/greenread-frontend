"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface TournamentFormat {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  nines_required: number;
  duration_hours: number;
  time_restrictions: Record<string, unknown> | null;
}

export default function Step5Formats({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addName, setAddName] = useState("");
  const [addMinPlayers, setAddMinPlayers] = useState(0);
  const [addMaxPlayers, setAddMaxPlayers] = useState(0);
  const [addNinesRequired, setAddNinesRequired] = useState(0);
  const [addDuration, setAddDuration] = useState(0);
  const [addTimeRestrictions, setAddTimeRestrictions] = useState("");
  const [addJsonError, setAddJsonError] = useState<string | null>(null);

  // Inline edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMinPlayers, setEditMinPlayers] = useState(0);
  const [editMaxPlayers, setEditMaxPlayers] = useState(0);
  const [editNinesRequired, setEditNinesRequired] = useState(0);
  const [editDuration, setEditDuration] = useState(0);
  const [editTimeRestrictions, setEditTimeRestrictions] = useState("");
  const [editJsonError, setEditJsonError] = useState<string | null>(null);

  // Delete confirmation
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const fetchFormats = async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from("tournament_formats")
      .select("*")
      .eq("course_id", courseId)
      .order("name");
    if (err) {
      setError(err.message);
    } else {
      setFormats(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchFormats();
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

  const handleAdd = async () => {
    const { valid, parsed } = parseJson(addTimeRestrictions);
    if (!valid) {
      setAddJsonError("Invalid JSON");
      return;
    }
    setAddJsonError(null);
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("tournament_formats").insert({
      course_id: courseId,
      name: addName,
      min_players: addMinPlayers,
      max_players: addMaxPlayers,
      nines_required: addNinesRequired,
      duration_hours: addDuration,
      time_restrictions: parsed,
    });
    if (err) {
      setError(err.message);
    } else {
      setShowAdd(false);
      setAddName("");
      setAddMinPlayers(0);
      setAddMaxPlayers(0);
      setAddNinesRequired(0);
      setAddDuration(0);
      setAddTimeRestrictions("");
      await fetchFormats();
    }
    setSaving(false);
  };

  const handleEdit = async (id: string) => {
    const { valid, parsed } = parseJson(editTimeRestrictions);
    if (!valid) {
      setEditJsonError("Invalid JSON");
      return;
    }
    setEditJsonError(null);
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from("tournament_formats")
      .update({
        name: editName,
        min_players: editMinPlayers,
        max_players: editMaxPlayers,
        nines_required: editNinesRequired,
        duration_hours: editDuration,
        time_restrictions: parsed,
      })
      .eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setEditingId(null);
      await fetchFormats();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from("tournament_formats").delete().eq("id", id);
    if (err) {
      setError(err.message);
    } else {
      setConfirmDeleteId(null);
      await fetchFormats();
    }
    setSaving(false);
  };

  const startEdit = (f: TournamentFormat) => {
    setEditingId(f.id);
    setEditName(f.name);
    setEditMinPlayers(f.min_players);
    setEditMaxPlayers(f.max_players);
    setEditNinesRequired(f.nines_required);
    setEditDuration(f.duration_hours);
    setEditTimeRestrictions(f.time_restrictions ? JSON.stringify(f.time_restrictions) : "");
    setEditJsonError(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6 flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (error && formats.length === 0 && !showAdd) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchFormats}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-6">Tournament Formats</h2>

      {formats.length > 0 ? (
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b border-gray-200 text-left text-sm font-medium text-gray-500">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Min Players</th>
              <th className="pb-2 pr-4">Max Players</th>
              <th className="pb-2 pr-4">Nines Required</th>
              <th className="pb-2 pr-4">Duration (hrs)</th>
              <th className="pb-2 pr-4">Time Restrictions</th>
              <th className="pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {formats.map((f, i) => (
              <tr
                key={f.id}
                className={`border-b border-gray-100 ${i % 2 === 0 ? "bg-gray-50" : ""}`}
              >
                {editingId === f.id ? (
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
                        value={editMinPlayers}
                        onChange={(e) => setEditMinPlayers(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        value={editMaxPlayers}
                        onChange={(e) => setEditMaxPlayers(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        value={editNinesRequired}
                        onChange={(e) => setEditNinesRequired(parseInt(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="number"
                        step="0.5"
                        value={editDuration}
                        onChange={(e) => setEditDuration(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </td>
                    <td className="py-2 pr-4">
                      <input
                        type="text"
                        value={editTimeRestrictions}
                        onChange={(e) => { setEditTimeRestrictions(e.target.value); setEditJsonError(null); }}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      {editJsonError && <p className="text-red-500 text-xs mt-1">{editJsonError}</p>}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(f.id)}
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
                    <td className="py-2 pr-4 text-gray-900">{f.name}</td>
                    <td className="py-2 pr-4 text-gray-600">{f.min_players}</td>
                    <td className="py-2 pr-4 text-gray-600">{f.max_players}</td>
                    <td className="py-2 pr-4 text-gray-600">{f.nines_required}</td>
                    <td className="py-2 pr-4 text-gray-600">{f.duration_hours}</td>
                    <td className="py-2 pr-4 text-gray-600 text-xs max-w-[150px] truncate">
                      {f.time_restrictions ? JSON.stringify(f.time_restrictions) : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(f)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium"
                        >
                          Edit
                        </button>
                        {confirmDeleteId === f.id ? (
                          <span className="flex gap-2 items-center">
                            <span className="text-sm text-red-600">Are you sure?</span>
                            <button
                              onClick={() => handleDelete(f.id)}
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
                            onClick={() => setConfirmDeleteId(f.id)}
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
        <p className="text-gray-500 mb-6">No tournament formats configured yet.</p>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-3">
          <p className="text-red-600 text-sm">{error}</p>
          <button
            onClick={fetchFormats}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {showAdd && (
        <div className="border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Add Tournament Format</h3>
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
              <label className="block text-sm text-gray-600 mb-1">Min Players</label>
              <input
                type="number"
                value={addMinPlayers}
                onChange={(e) => setAddMinPlayers(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Max Players</label>
              <input
                type="number"
                value={addMaxPlayers}
                onChange={(e) => setAddMaxPlayers(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Nines Required</label>
              <input
                type="number"
                value={addNinesRequired}
                onChange={(e) => setAddNinesRequired(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Duration (hours)</label>
              <input
                type="number"
                step="0.5"
                value={addDuration}
                onChange={(e) => setAddDuration(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Time Restrictions (JSON, optional)</label>
              <textarea
                value={addTimeRestrictions}
                onChange={(e) => { setAddTimeRestrictions(e.target.value); setAddJsonError(null); }}
                placeholder='{"allowed_starts": ["08:00","13:00"]}'
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {addJsonError && <p className="text-red-500 text-xs mt-1">{addJsonError}</p>}
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
        Add Format
      </button>
    </div>
  );
}
