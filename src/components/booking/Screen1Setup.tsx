"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";
import NumberInput from "@/components/common/NumberInput";

type TournamentFormat = {
  id: string;
  name: string;
  min_players: number;
  max_players: number;
  nines_required: number;
  duration_hours: number;
};

const SEASON_MONTHS = [
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
];

export default function Screen1Setup({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();

  const [formats, setFormats] = useState<TournamentFormat[]>([]);
  const [loadingFormats, setLoadingFormats] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedFormat = formats.find((f) => f.id === state.formatId) ?? null;

  const playerCountValid =
    selectedFormat
      ? state.playerCount >= selectedFormat.min_players &&
        state.playerCount <= selectedFormat.max_players
      : true;

  const canProceed =
    state.formatId !== null && playerCountValid && state.month >= 5 && state.month <= 10;

  useEffect(() => {
    fetchFormats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function fetchFormats() {
    setLoadingFormats(true);
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
    setLoadingFormats(false);
  }

  return (
    <div className="space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Tournament Setup</h2>
        <p className="text-gray-500">Select a format, set player count, and pick your target month.</p>
      </div>

      {/* Format Selection */}
      <section>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Tournament Format</h3>

        {loadingFormats && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={fetchFormats}
              className="text-sm font-medium text-red-700 hover:text-red-900 underline"
            >
              Retry
            </button>
          </div>
        )}

        {!loadingFormats && !error && (
          <div className="grid grid-cols-3 gap-4">
            {formats.map((format) => (
              <button
                key={format.id}
                onClick={() =>
                  dispatch({
                    type: "SET_FORMAT",
                    formatId: format.id,
                    formatName: format.name,
                  })
                }
                className={`text-left rounded-lg border-2 p-5 transition-colors ${
                  state.formatId === format.id
                    ? "border-green-600 bg-green-50"
                    : "border-gray-200 bg-white hover:border-gray-300"
                }`}
              >
                <p className="font-semibold text-gray-900">{format.name}</p>
                <div className="mt-2 space-y-1 text-sm text-gray-500">
                  <p>Players: {format.min_players}–{format.max_players}</p>
                  <p>Nines required: {format.nines_required}</p>
                  <p>Duration: {format.duration_hours}h</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Player Count */}
      <section>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Player Count</h3>
        <div className="flex items-center gap-4">
          <NumberInput
            integer
            min={selectedFormat?.min_players ?? 1}
            max={selectedFormat?.max_players ?? 300}
            value={state.playerCount}
            onChange={(v) => dispatch({ type: "SET_PLAYER_COUNT", playerCount: v })}
            className={`w-32 rounded-lg border px-4 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500 ${
              !playerCountValid ? "border-red-400" : "border-gray-300"
            }`}
          />
          {selectedFormat ? (
            <span className={`text-sm ${playerCountValid ? "text-gray-500" : "text-red-600"}`}>
              Range: {selectedFormat.min_players}–{selectedFormat.max_players} players
            </span>
          ) : (
            <span className="text-xs text-gray-400">max 300</span>
          )}
        </div>
      </section>

      {/* Month Selection */}
      <section>
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Target Month</h3>
        <div className="flex items-center gap-4">
          <div className="flex gap-2">
            {SEASON_MONTHS.map((m) => (
              <button
                key={m.value}
                onClick={() =>
                  dispatch({ type: "SET_MONTH_YEAR", month: m.value, year: state.year })
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  state.month === m.value
                    ? "bg-green-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <select
            value={state.year}
            onChange={(e) =>
              dispatch({ type: "SET_MONTH_YEAR", month: state.month, year: Number(e.target.value) })
            }
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {[new Date().getFullYear(), new Date().getFullYear() + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Proceed Button */}
      <div>
        <button
          disabled={!canProceed}
          onClick={() => dispatch({ type: "SET_STEP", step: 2 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Find Available Dates
        </button>
      </div>
    </div>
  );
}
