"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ModifySelectionsModal from "@/components/portal/ModifySelectionsModal";

interface BookingRow {
  id: string;
  course_id: string;
  date: string;
  status: string;
  player_count: number | null;
  format_id: string | null;
  notes: string | null;
}

interface CourseRow {
  id: string;
  name: string;
}

interface FormatRow {
  id: string;
  name: string;
}

interface PricingSnapshotData {
  total?: number;
  green_fees?: number;
  cart_fees?: number;
  fb_total?: number;
  bar_total?: number;
  addon_total?: number;
  subtotal?: number;
  hst?: number;
  displacement_floor?: { floor_amount: number; displacement_cost: number } | null;
}

interface PricingSnapshotRow {
  snapshot: PricingSnapshotData | null;
  created_at: string;
}

interface FbSelectionRow {
  fb_package_id: string;
  headcount: number;
  fb_packages: { name: string; price_per_person: number } | null;
}

interface BarSelectionRow {
  bar_package_id: string;
  headcount: number;
  bar_packages: { name: string; price_per_person: number } | null;
}

interface AddonSelectionRow {
  addon_id: string;
  quantity: number;
  addons: { name: string; price: number } | null;
}

interface ModificationWindow {
  open: boolean;
  days_remaining: number;
  window_days: number;
}

interface ParticipantRow {
  id: string;
  name: string | null;
  email: string | null;
  handicap: number | null;
}

interface FoursomeParticipantRow {
  participant_id: string;
  participants: { name: string | null } | null;
}

interface FoursomeRow {
  id: string;
  foursome_number: number | null;
  cart_number: number | null;
  starting_hole: number | null;
  foursome_participants: FoursomeParticipantRow[] | null;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  deposit_paid: "Deposit Paid",
  balance_paid: "Balance Paid",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
};

function statusBadgeClass(status: string): string {
  switch (status) {
    case "confirmed":
    case "completed":
      return "bg-green-100 text-green-800";
    case "draft":
      return "bg-yellow-100 text-yellow-800";
    case "deposit_paid":
    case "balance_paid":
      return "bg-blue-100 text-blue-800";
    case "cancelled":
      return "bg-red-100 text-red-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

function fmtMoney(n: number | null | undefined): string {
  return `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

export default function OrganizerPortalPage({
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

  const [booking, setBooking] = useState<BookingRow | null>(null);
  const [course, setCourse] = useState<CourseRow | null>(null);
  const [format, setFormat] = useState<FormatRow | null>(null);
  const [pricing, setPricing] = useState<PricingSnapshotData | null>(null);
  const [fbSelections, setFbSelections] = useState<FbSelectionRow[]>([]);
  const [barSelections, setBarSelections] = useState<BarSelectionRow[]>([]);
  const [addonSelections, setAddonSelections] = useState<AddonSelectionRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);
  const [foursomes, setFoursomes] = useState<FoursomeRow[]>([]);
  const [modificationWindow, setModificationWindow] =
    useState<ModificationWindow | null>(null);

  const [copied, setCopied] = useState(false);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [modifySuccess, setModifySuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setTokenError("Invalid or expired link. Please contact the course for a new link.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setTokenError(null);
    setLoadError(null);

    try {
      // 1) Validate token
      const { data: tokenData, error: tokenErr } = await supabase
        .from("registration_tokens")
        .select("id, booking_id, course_id, expires_at")
        .eq("token", token)
        .eq("booking_id", bookingId)
        .maybeSingle();

      if (tokenErr || !tokenData) {
        setTokenError("Invalid or expired link. Please contact the course for a new link.");
        setLoading(false);
        return;
      }

      if (tokenData.expires_at && new Date(tokenData.expires_at) < new Date()) {
        setTokenError("Invalid or expired link. Please contact the course for a new link.");
        setLoading(false);
        return;
      }

      // 2) Fetch all booking data in parallel
      const [
        bookingRes,
        pricingRes,
        fbRes,
        barRes,
        addonRes,
        participantsRes,
        foursomesRes,
      ] = await Promise.all([
        supabase
          .from("bookings")
          .select("id, course_id, date, status, player_count, format_id, notes")
          .eq("id", bookingId)
          .maybeSingle(),
        supabase
          .from("pricing_snapshots")
          .select("snapshot, created_at")
          .eq("booking_id", bookingId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("booking_fb_selections")
          .select("fb_package_id, headcount, fb_packages(name, price_per_person)")
          .eq("booking_id", bookingId),
        supabase
          .from("booking_bar_selections")
          .select("bar_package_id, headcount, bar_packages(name, price_per_person)")
          .eq("booking_id", bookingId),
        supabase
          .from("booking_addon_selections")
          .select("addon_id, quantity, addons(name, price)")
          .eq("booking_id", bookingId),
        supabase
          .from("participants")
          .select("id, name, email, handicap")
          .eq("booking_id", bookingId)
          .order("name", { ascending: true }),
        supabase
          .from("foursomes")
          .select(
            "id, foursome_number, cart_number, starting_hole, foursome_participants(participant_id, participants(name))"
          )
          .eq("booking_id", bookingId)
          .order("foursome_number", { ascending: true }),
      ]);

      if (bookingRes.error || !bookingRes.data) {
        throw new Error(bookingRes.error?.message ?? "Booking not found");
      }
      const bookingRow = bookingRes.data as BookingRow;
      setBooking(bookingRow);

      // Fetch course + format
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

      const snap = (pricingRes.data as PricingSnapshotRow | null)?.snapshot ?? null;
      setPricing(snap);

      setFbSelections(((fbRes.data ?? []) as unknown) as FbSelectionRow[]);
      setBarSelections(((barRes.data ?? []) as unknown) as BarSelectionRow[]);
      setAddonSelections(((addonRes.data ?? []) as unknown) as AddonSelectionRow[]);
      setParticipants((participantsRes.data ?? []) as ParticipantRow[]);
      setFoursomes(((foursomesRes.data ?? []) as unknown) as FoursomeRow[]);

      // Fetch modification window state
      const dashboardRes = await supabase.rpc("get_organizer_dashboard", {
        p_booking_id: bookingId,
      });
      if (!dashboardRes.error && dashboardRes.data) {
        const dash = dashboardRes.data as {
          modification_window?: ModificationWindow | null;
        };
        if (dash.modification_window) {
          setModificationWindow(dash.modification_window);
        }
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load booking details"
      );
    } finally {
      setLoading(false);
    }
  }, [bookingId, token, supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const registrationUrl = useMemo(() => {
    if (typeof window === "undefined" || !token) return "";
    return `${window.location.origin}/register/${bookingId}?token=${token}`;
  }, [bookingId, token]);

  const copyRegistrationLink = async () => {
    if (!registrationUrl) return;
    try {
      await navigator.clipboard.writeText(registrationUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
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
            Unable to Load Booking
          </h1>
          <p className="text-sm text-gray-600">
            {loadError ?? "Booking could not be found."}
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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="text-xs uppercase tracking-wider text-gray-500 mb-1">
            Organizer Portal
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {course?.name ?? "Tournament"}
          </h1>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Event Overview */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Event Overview
            </h2>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusBadgeClass(
                booking.status
              )}`}
            >
              {STATUS_LABELS[booking.status] ?? booking.status}
            </span>
          </div>
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
                Registered
              </div>
              <div className="mt-1 text-sm text-gray-900">
                {registeredCount} of {playerCount} players registered
              </div>
            </div>
          </div>
          {booking.notes && (
            <div className="mt-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider">
                Notes
              </div>
              <p className="mt-1 text-sm text-gray-700 bg-gray-50 rounded p-2">
                {booking.notes}
              </p>
            </div>
          )}
        </section>

        {/* Share Registration Link */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">
            Share Registration Link
          </h2>
          <p className="text-sm text-gray-600 mb-4">
            Send this link to your players so they can register and provide
            their details.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              readOnly
              value={registrationUrl}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono text-gray-700 bg-gray-50"
              onFocus={(e) => e.currentTarget.select()}
            />
            <button
              type="button"
              onClick={copyRegistrationLink}
              className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium"
            >
              {copied ? "Copied!" : "Copy Link"}
            </button>
          </div>
        </section>

        {/* Pricing Breakdown */}
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Pricing Breakdown
          </h2>
          {pricing ? (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Green Fees</span>
                <span className="text-gray-900">{fmtMoney(pricing.green_fees)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Cart Fees</span>
                <span className="text-gray-900">{fmtMoney(pricing.cart_fees)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">F&B Total</span>
                <span className="text-gray-900">{fmtMoney(pricing.fb_total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Bar Total</span>
                <span className="text-gray-900">{fmtMoney(pricing.bar_total)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Add-on Total</span>
                <span className="text-gray-900">{fmtMoney(pricing.addon_total)}</span>
              </div>
              <div className="border-t border-gray-100 pt-2 mt-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Subtotal</span>
                  <span className="text-gray-900">{fmtMoney(pricing.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">HST</span>
                  <span className="text-gray-900">{fmtMoney(pricing.hst)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold mt-2">
                  <span className="text-gray-900">Total</span>
                  <span className="text-gray-900">{fmtMoney(pricing.total)}</span>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No pricing available yet.</p>
          )}
        </section>

        {/* Selections */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-start justify-between mb-4 gap-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Current Selections
            </h2>
            {modificationWindow?.open === true && (
              <button
                type="button"
                onClick={() => setShowModifyModal(true)}
                className="px-4 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium whitespace-nowrap"
              >
                Modify Selections
              </button>
            )}
          </div>

          {modifySuccess && (
            <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
              {modifySuccess}
            </div>
          )}

          {modificationWindow?.open === false && (
            <div className="mb-4 rounded-md bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-600">
              Modification window closed — contact the course to make changes.
              <span className="block text-xs text-gray-500 mt-1">
                Window: {modificationWindow.window_days} days · Days remaining:{" "}
                {modificationWindow.days_remaining}
              </span>
            </div>
          )}

          <div className="space-y-5">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Food &amp; Beverage
              </h3>
              {fbSelections.length === 0 ? (
                <p className="text-sm text-gray-500">No F&amp;B selections.</p>
              ) : (
                <ul className="space-y-1">
                  {fbSelections.map((s, i) => (
                    <li
                      key={i}
                      className="flex justify-between text-sm text-gray-700"
                    >
                      <span>
                        {s.fb_packages?.name ?? "Package"}{" "}
                        <span className="text-gray-500">
                          × {s.headcount}
                        </span>
                      </span>
                      <span className="text-gray-600">
                        {fmtMoney(
                          (s.fb_packages?.price_per_person ?? 0) * s.headcount
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Bar</h3>
              {barSelections.length === 0 ? (
                <p className="text-sm text-gray-500">No bar selections.</p>
              ) : (
                <ul className="space-y-1">
                  {barSelections.map((s, i) => (
                    <li
                      key={i}
                      className="flex justify-between text-sm text-gray-700"
                    >
                      <span>
                        {s.bar_packages?.name ?? "Package"}{" "}
                        <span className="text-gray-500">
                          × {s.headcount}
                        </span>
                      </span>
                      <span className="text-gray-600">
                        {fmtMoney(
                          (s.bar_packages?.price_per_person ?? 0) * s.headcount
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                Add-ons
              </h3>
              {addonSelections.length === 0 ? (
                <p className="text-sm text-gray-500">No add-ons.</p>
              ) : (
                <ul className="space-y-1">
                  {addonSelections.map((s, i) => (
                    <li
                      key={i}
                      className="flex justify-between text-sm text-gray-700"
                    >
                      <span>
                        {s.addons?.name ?? "Add-on"}{" "}
                        <span className="text-gray-500">× {s.quantity}</span>
                      </span>
                      <span className="text-gray-600">
                        {fmtMoney((s.addons?.price ?? 0) * s.quantity)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>

        {/* Participants */}
        <section className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Participants
            </h2>
            <span className="text-sm text-gray-600">
              {registeredCount} of {playerCount}
            </span>
          </div>
          {participants.length === 0 ? (
            <p className="text-sm text-gray-500">
              No participants have registered yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Email
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Handicap
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {participants.map((p) => (
                    <tr key={p.id}>
                      <td className="px-3 py-2 text-sm text-gray-900">
                        {p.name ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {p.email ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-sm text-gray-700">
                        {p.handicap ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Foursomes */}
        {foursomes.length > 0 && (
          <section className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Foursome Assignments
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {foursomes.map((f) => (
                <div
                  key={f.id}
                  className="border border-gray-200 rounded-md p-4"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-semibold text-gray-900">
                      Foursome {f.foursome_number ?? "—"}
                    </div>
                    <div className="text-xs text-gray-500">
                      Cart {f.cart_number ?? "—"} · Hole {f.starting_hole ?? "—"}
                    </div>
                  </div>
                  <ul className="space-y-1">
                    {(f.foursome_participants ?? []).map((fp, i) => (
                      <li key={i} className="text-sm text-gray-700">
                        {fp.participants?.name ?? "—"}
                      </li>
                    ))}
                    {(!f.foursome_participants ||
                      f.foursome_participants.length === 0) && (
                      <li className="text-sm text-gray-500">
                        No players assigned.
                      </li>
                    )}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 text-center text-xs text-gray-500">
          Powered by Greenread
        </div>
      </footer>

      {showModifyModal && booking && (
        <ModifySelectionsModal
          bookingId={booking.id}
          courseId={booking.course_id}
          currentFb={fbSelections.map((s) => ({
            fb_package_id: s.fb_package_id,
            headcount: s.headcount,
          }))}
          currentBar={barSelections.map((s) => ({
            bar_package_id: s.bar_package_id,
            headcount: s.headcount,
          }))}
          currentAddons={addonSelections.map((s) => ({
            addon_id: s.addon_id,
            quantity: s.quantity,
          }))}
          onClose={() => setShowModifyModal(false)}
          onSaved={() => {
            setShowModifyModal(false);
            setModifySuccess("Selections updated successfully.");
            setTimeout(() => setModifySuccess(null), 5000);
            load();
          }}
        />
      )}
    </div>
  );
}
