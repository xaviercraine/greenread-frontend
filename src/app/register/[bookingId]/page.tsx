"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface BookingRow {
  id: string;
  course_id: string;
  date: string;
  player_count: number | null;
  format_id: string | null;
}

interface CourseRow {
  id: string;
  name: string;
}

interface FormatRow {
  id: string;
  name: string;
}

interface TokenData {
  id: string;
  booking_id: string;
  course_id: string;
  expires_at: string | null;
}

interface ParticipantNameRow {
  id: string;
  name: string | null;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export default function ParticipantRegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { bookingId } = use(params);
  const { token } = use(searchParams);

  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tokenData, setTokenData] = useState<TokenData | null>(null);
  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [course, setCourse] = useState<CourseRow | null>(null);
  const [format, setFormat] = useState<FormatRow | null>(null);
  const [participants, setParticipants] = useState<ParticipantNameRow[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [handicap, setHandicap] = useState("");
  const [phone, setPhone] = useState("");
  const [dietaryNotes, setDietaryNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const load = useCallback(async () => {
    if (!token) {
      setTokenError("Invalid or expired link. Please contact the organizer for a new link.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setTokenError(null);
    setLoadError(null);

    try {
      // 1) Validate token
      const { data: tokenRow, error: tokenErr } = await supabase
        .from("registration_tokens")
        .select("id, booking_id, course_id, expires_at")
        .eq("token", token)
        .eq("booking_id", bookingId)
        .maybeSingle();

      if (tokenErr || !tokenRow) {
        setTokenError("Invalid or expired link. Please contact the organizer for a new link.");
        setLoading(false);
        return;
      }

      if (tokenRow.expires_at && new Date(tokenRow.expires_at) < new Date()) {
        setTokenError("Invalid or expired link. Please contact the organizer for a new link.");
        setLoading(false);
        return;
      }

      setTokenData(tokenRow as TokenData);

      // 2) Fetch booking + participants in parallel
      const [bookingRes, participantsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, course_id, date, player_count, format_id")
          .eq("id", bookingId)
          .maybeSingle(),
        supabase
          .from("participants")
          .select("id, name")
          .eq("booking_id", bookingId)
          .order("name", { ascending: true }),
      ]);

      if (bookingRes.error || !bookingRes.data) {
        throw new Error(bookingRes.error?.message ?? "Booking not found");
      }
      const bookingRow = bookingRes.data as BookingRow;
      setBooking(bookingRow);
      setParticipants((participantsRes.data ?? []) as ParticipantNameRow[]);

      // 3) Fetch course + format
      const [courseRes, formatRes] = await Promise.all([
        supabase
          .from("public_courses")
          .select("id, name")
          .eq("id", bookingRow.course_id)
          .maybeSingle(),
        bookingRow.format_id
          ? supabase
              .from("tournament_formats")
              .select("id, name")
              .eq("id", bookingRow.format_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (courseRes.data) setCourse(courseRes.data as CourseRow);
      if (formatRes.data) setFormat(formatRes.data as FormatRow);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load event details"
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId, token, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshParticipants = useCallback(async () => {
    const { data } = await supabase
      .from("participants")
      .select("id, name")
      .eq("booking_id", bookingId)
      .order("name", { ascending: true });
    setParticipants((data ?? []) as ParticipantNameRow[]);
  }, [bookingId, supabase]);

  const resetForm = () => {
    setName("");
    setEmail("");
    setHandicap("");
    setPhone("");
    setDietaryNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenData) return;
    if (!name.trim() || !email.trim()) {
      setSubmitError("Name and email are required.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setSubmitSuccess(false);

    const handicapValue = handicap.trim() ? Number(handicap) : null;
    if (handicap.trim() && Number.isNaN(handicapValue)) {
      setSubmitError("Handicap must be a number.");
      setSubmitting(false);
      return;
    }

    const { error } = await supabase.from("participants").insert({
      booking_id: bookingId,
      course_id: tokenData.course_id,
      name: name.trim(),
      email: email.trim(),
      handicap: handicapValue,
      phone: phone.trim() || null,
      dietary_notes: dietaryNotes.trim() || null,
    });

    if (error) {
      const msg = error.message?.toLowerCase() ?? "";
      if (
        msg.includes("duplicate") ||
        msg.includes("unique") ||
        error.code === "23505"
      ) {
        setSubmitError("This email is already registered for this event.");
      } else {
        setSubmitError(error.message || "Failed to register. Please try again.");
      }
      setSubmitting(false);
      return;
    }

    setSubmitSuccess(true);
    resetForm();
    setSubmitting(false);
    await refreshParticipants();
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600" />
      </div>
    );
  }

  if (tokenError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Link Unavailable
          </h1>
          <p className="text-sm text-gray-600">{tokenError}</p>
        </div>
      </div>
    );
  }

  if (loadError || !booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="max-w-md w-full bg-white rounded-lg shadow p-8 text-center">
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Unable to Load Event
          </h1>
          <p className="text-sm text-gray-600">
            {loadError ?? "Event could not be found."}
          </p>
        </div>
      </div>
    );
  }

  const playerCount = booking.player_count ?? 0;
  const registeredCount = participants.length;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Player Registration
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {course?.name ?? "Tournament"}
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Event Info */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Event Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">
                Date
              </div>
              <div className="mt-1 text-sm text-gray-900">
                {fmtDate(booking.date)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">
                Format
              </div>
              <div className="mt-1 text-sm text-gray-900">
                {format?.name ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">
                Players
              </div>
              <div className="mt-1 text-sm text-gray-900">{playerCount}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">
                Spots Filled
              </div>
              <div className="mt-1 text-sm text-gray-900">
                {registeredCount} of {playerCount}
              </div>
            </div>
          </div>
        </section>

        {/* Success Message */}
        {submitSuccess && (
          <section className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-lg font-semibold text-green-900 mb-2">
              You&apos;re registered! 🎉
            </h2>
            <p className="text-sm text-green-800">
              See you at <strong>{course?.name}</strong> on{" "}
              <strong>{fmtDate(booking.date)}</strong>.
            </p>
            <p className="text-sm text-green-800 mt-2">
              The form has been cleared so the next player can register on this
              device.
            </p>
          </section>
        )}

        {/* Registration Form */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Register
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Name <span className="text-red-500">*</span>
              </label>
              <input
                id="name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email <span className="text-red-500">*</span>
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label
                htmlFor="handicap"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Handicap
              </label>
              <input
                id="handicap"
                type="number"
                step="0.1"
                value={handicap}
                onChange={(e) => setHandicap(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label
                htmlFor="phone"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Phone
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div>
              <label
                htmlFor="dietary"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Dietary Notes
              </label>
              <textarea
                id="dietary"
                rows={3}
                value={dietaryNotes}
                onChange={(e) => setDietaryNotes(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {submitError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-800">
                {submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full px-4 py-2.5 rounded-md bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-sm font-medium"
            >
              {submitting ? "Registering..." : "Register"}
            </button>
          </form>
        </section>

        {/* Already Registered */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Already Registered
            </h2>
            <span className="text-sm text-gray-600">
              {registeredCount} of {playerCount}
            </span>
          </div>
          {participants.length === 0 ? (
            <p className="text-sm text-gray-500">
              Be the first to register!
            </p>
          ) : (
            <ul className="space-y-1">
              {participants.map((p) => (
                <li
                  key={p.id}
                  className="text-sm text-gray-700 py-1 border-b border-gray-100 last:border-0"
                >
                  {p.name ?? "—"}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-gray-500">
          Powered by Greenread
        </div>
      </footer>
    </div>
  );
}
