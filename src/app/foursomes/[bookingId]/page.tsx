"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface BookingRow {
  id: string;
  course_id: string;
  player_count: number | null;
  format_id: string | null;
}

interface FormatRow {
  id: string;
  name: string;
}

interface ParticipantRow {
  id: string;
  name: string | null;
  email: string | null;
  handicap: number | null;
}

interface FoursomeParticipantRow {
  participant_id: string;
  participants: {
    id: string;
    name: string | null;
    handicap: number | null;
  } | null;
}

interface FoursomeRow {
  id: string;
  foursome_number: number | null;
  cart_number: number | null;
  starting_hole: number | null;
  foursome_participants: FoursomeParticipantRow[] | null;
}

export default function FoursomeBuilderPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = use(params);
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionRunning, setActionRunning] = useState<"random" | "handicap" | null>(
    null
  );

  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [format, setFormat] = useState<FormatRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [foursomes, setFoursomes] = useState<FoursomeRow[]>([]);

  const loadFoursomes = useCallback(async () => {
    const { data, error } = await supabase
      .from("foursomes")
      .select(
        "id, foursome_number, cart_number, starting_hole, foursome_participants(participant_id, participants(id, name, handicap))"
      )
      .eq("booking_id", bookingId)
      .order("foursome_number", { ascending: true });
    if (error) throw new Error(error.message);
    setFoursomes(((data ?? []) as unknown) as FoursomeRow[]);
  }, [bookingId, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [bookingRes, participantsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, course_id, player_count, format_id")
          .eq("id", bookingId)
          .maybeSingle(),
        supabase
          .from("participants")
          .select("id, name, email, handicap")
          .eq("booking_id", bookingId)
          .order("name", { ascending: true }),
      ]);

      if (bookingRes.error || !bookingRes.data) {
        throw new Error(bookingRes.error?.message ?? "Booking not found");
      }
      const bookingRow = bookingRes.data as BookingRow;
      setBooking(bookingRow);
      setParticipants((participantsRes.data ?? []) as ParticipantRow[]);

      if (bookingRow.format_id) {
        const { data: formatData } = await supabase
          .from("tournament_formats")
          .select("id, name")
          .eq("id", bookingRow.format_id)
          .maybeSingle();
        if (formatData) setFormat(formatData as FormatRow);
      }

      await loadFoursomes();
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load foursome data"
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId, supabase, loadFoursomes]);

  useEffect(() => {
    load();
  }, [load]);

  const runAutoAssign = async (method: "random" | "handicap") => {
    if (!booking) return;
    setActionRunning(method);
    setActionError(null);
    try {
      const { error } = await supabase.rpc("auto_assign_foursomes", {
        p_booking_id: bookingId,
        p_course_id: booking.course_id,
        p_method: method,
      });
      if (error) throw new Error(error.message);
      await loadFoursomes();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Auto-assign failed"
      );
    } finally {
      setActionRunning(null);
    }
  };

  const assignedParticipantIds = useMemo(() => {
    const ids = new Set<string>();
    for (const f of foursomes) {
      for (const fp of f.foursome_participants ?? []) {
        if (fp.participant_id) ids.add(fp.participant_id);
      }
    }
    return ids;
  }, [foursomes]);

  const unassignedParticipants = useMemo(
    () => participants.filter((p) => !assignedParticipantIds.has(p.id)),
    [participants, assignedParticipantIds]
  );

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">Loading…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white shadow rounded-lg p-6 max-w-md">
          <h2 className="text-lg font-semibold text-red-700 mb-2">
            Unable to load
          </h2>
          <p className="text-sm text-gray-700 mb-4">{loadError}</p>
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            ← Back to Dashboard
          </Link>
        </div>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">
            Foursome Builder
          </h1>
          <div className="text-sm text-gray-600">
            {format ? `Format: ${format.name}` : "No format selected"}
            {booking?.player_count != null && (
              <span className="ml-3">Players: {booking.player_count}</span>
            )}
            <span className="ml-3">Registered: {participants.length}</span>
          </div>

          <div className="flex flex-wrap gap-3 mt-5">
            <button
              onClick={() => runAutoAssign("random")}
              disabled={actionRunning !== null || participants.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {actionRunning === "random" && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              Auto-Assign (Random)
            </button>
            <button
              onClick={() => runAutoAssign("handicap")}
              disabled={actionRunning !== null || participants.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {actionRunning === "handicap" && (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              )}
              Auto-Assign (By Handicap)
            </button>
          </div>

          {actionError && (
            <p className="mt-3 text-sm text-red-600">{actionError}</p>
          )}
        </div>

        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Foursomes</h2>
          {foursomes.length === 0 ? (
            <div className="bg-white shadow rounded-lg p-6 text-sm text-gray-600">
              No foursomes yet. Use one of the auto-assign buttons above.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {foursomes.map((f) => (
                <div
                  key={f.id}
                  className="bg-white shadow rounded-lg p-4 border border-gray-200"
                >
                  <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-base font-semibold text-gray-900">
                      Foursome {f.foursome_number ?? "—"}
                    </h3>
                    <div className="text-xs text-gray-600">
                      {f.cart_number != null && (
                        <span>Cart {f.cart_number}</span>
                      )}
                      {f.cart_number != null && f.starting_hole != null && (
                        <span> · </span>
                      )}
                      {f.starting_hole != null && (
                        <span>Hole {f.starting_hole}</span>
                      )}
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {(f.foursome_participants ?? []).map((fp) => (
                      <li
                        key={fp.participant_id}
                        className="flex justify-between text-sm text-gray-800"
                      >
                        <span>{fp.participants?.name ?? "—"}</span>
                        <span className="text-gray-500">
                          HCP{" "}
                          {fp.participants?.handicap != null
                            ? fp.participants.handicap
                            : "—"}
                        </span>
                      </li>
                    ))}
                    {(!f.foursome_participants ||
                      f.foursome_participants.length === 0) && (
                      <li className="text-sm text-gray-500 italic">
                        No players assigned
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Unassigned Participants
          </h2>
          <div className="bg-white shadow rounded-lg p-4">
            {unassignedParticipants.length === 0 ? (
              <p className="text-sm text-gray-600">
                All registered participants are assigned to a foursome.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {unassignedParticipants.map((p) => (
                  <li
                    key={p.id}
                    className="flex justify-between py-2 text-sm text-gray-800"
                  >
                    <span>{p.name ?? "—"}</span>
                    <span className="text-gray-500">
                      HCP {p.handicap != null ? p.handicap : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
