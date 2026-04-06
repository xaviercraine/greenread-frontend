"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBooking } from "@/components/booking/BookingContext";

type EventSpace = {
  id: string;
  course_id: string;
  name: string;
  min_capacity: number;
  max_capacity: number;
  pricing_tier: string;
  description: string | null;
};

export default function Screen4Space({ courseId }: { courseId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const { state, dispatch } = useBooking();

  const [spaces, setSpaces] = useState<EventSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchSpaces();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId]);

  async function fetchSpaces() {
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
  }

  function selectSpace(space: EventSpace | null) {
    dispatch({
      type: "SET_EVENT_SPACE",
      spaceId: space?.id ?? null,
      spaceName: space?.name ?? null,
    });
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
          onClick={fetchSpaces}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-red-600 hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  const noSpaceSelected = state.eventSpaceId === null;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Event Space</h2>
        <p className="text-gray-500">Select an indoor space for your event (optional)</p>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
        {/* No space option */}
        <button
          onClick={() => selectSpace(null)}
          className={`text-left rounded-lg border bg-white p-5 shadow-sm transition-colors ${
            noSpaceSelected ? "border-green-600 bg-green-50" : "border-gray-200 hover:border-gray-400"
          }`}
        >
          <h4 className="font-semibold text-gray-900 mb-1">No event space needed</h4>
          <p className="text-sm text-gray-600">Skip indoor venue selection.</p>
        </button>

        {spaces.map((space) => {
          const selected = state.eventSpaceId === space.id;
          const outOfRange =
            state.playerCount < space.min_capacity || state.playerCount > space.max_capacity;
          return (
            <button
              key={space.id}
              onClick={() => selectSpace(space)}
              className={`text-left rounded-lg border bg-white p-5 shadow-sm transition-colors ${
                selected ? "border-green-600 bg-green-50" : "border-gray-200 hover:border-gray-400"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h4 className="font-semibold text-gray-900">{space.name}</h4>
                <span className="text-xs font-semibold uppercase tracking-wide px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {space.pricing_tier}
                </span>
              </div>
              <p className="text-sm text-gray-600 mb-2">
                Capacity: {space.min_capacity}–{space.max_capacity}
              </p>
              {space.description && (
                <p className="text-sm text-gray-600 mb-2">{space.description}</p>
              )}
              {outOfRange && (
                <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-2 py-1 mt-2">
                  ⚠ Your headcount of {state.playerCount} is outside this space&apos;s range.
                </p>
              )}
            </button>
          );
        })}
      </div>

      {/* Navigation */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 3 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => dispatch({ type: "SET_STEP", step: 5 })}
          className="px-6 py-3 rounded-lg text-sm font-semibold text-white bg-green-600 hover:bg-green-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
