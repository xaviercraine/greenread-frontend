"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import NavBar from "@/components/NavBar";
import SummaryCards from "@/components/dashboard/SummaryCards";
import RevenueBreakdownCards from "@/components/dashboard/RevenueBreakdownCards";
import BookingTable, {
  type Booking,
  type PricingSnapshot,
} from "@/components/dashboard/BookingTable";
import BookingDetail from "@/components/dashboard/BookingDetail";
import EscalatedConversations from "@/components/dashboard/EscalatedConversations";

export default function HomePage() {
  const { user, loading: authLoading, courseId } = useAuth();
  const supabase = useMemo(() => createClient(), []);

  // Summary state
  const [totalBookings, setTotalBookings] = useState<number | null>(null);
  const [upcomingBookings, setUpcomingBookings] = useState<number | null>(null);
  const [confirmedRevenue, setConfirmedRevenue] = useState<number | null>(null);
  const [escalatedCount, setEscalatedCount] = useState<number | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  // Revenue breakdown state
  const [revenueBreakdown, setRevenueBreakdown] = useState({
    greenFees: 0,
    cartCost: 0,
    fbTotal: 0,
    barTotal: 0,
    addonTotal: 0,
  });
  const [breakdownLoading, setBreakdownLoading] = useState(true);

  // Bookings state
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [pricingMap, setPricingMap] = useState<Map<string, PricingSnapshot>>(
    new Map()
  );
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsError, setBookingsError] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState("all");
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const fetchSummary = useCallback(async () => {
    if (!courseId) return;
    setSummaryLoading(true);
    setSummaryError(null);

    // Total bookings (non-cancelled)
    try {
      const { count: total, error: totalErr } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId)
        .neq("status", "cancelled");
      setTotalBookings(totalErr ? 0 : (total ?? 0));
    } catch {
      setTotalBookings(0);
    }

    // Upcoming
    try {
      const { count: upcoming, error: upcomingErr } = await supabase
        .from("bookings")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId)
        .gte("date", today)
        .neq("status", "cancelled");
      setUpcomingBookings(upcomingErr ? 0 : (upcoming ?? 0));
    } catch {
      setUpcomingBookings(0);
    }

    // Escalated conversations
    try {
      const { count: escalated, error: escalatedErr } = await supabase
        .from("conversations")
        .select("*", { count: "exact", head: true })
        .eq("course_id", courseId)
        .eq("status", "escalated");
      setEscalatedCount(escalatedErr ? 0 : (escalated ?? 0));
    } catch {
      setEscalatedCount(0);
    }

    // Revenue: get confirmed booking IDs, then sum latest snapshots
    try {
      const confirmedStatuses = [
        "deposit_paid",
        "balance_paid",
        "confirmed",
        "completed",
      ];
      const { data: confirmedBookings, error: confirmedErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("course_id", courseId)
        .in("status", confirmedStatuses);

      let revenue = 0;
      if (!confirmedErr && confirmedBookings && confirmedBookings.length > 0) {
        const confirmedIds = new Set(confirmedBookings.map((b) => b.id));
        const { data: snapshots, error: snapErr } = await supabase
          .from("pricing_snapshots")
          .select("booking_id, snapshot, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false });

        if (!snapErr && snapshots) {
          const latestByBooking = new Map<string, number>();
          for (const s of snapshots as Array<{
            booking_id: string;
            snapshot: { total?: number } | null;
            created_at: string;
          }>) {
            if (!confirmedIds.has(s.booking_id)) continue;
            if (!latestByBooking.has(s.booking_id)) {
              const total = s.snapshot?.total;
              latestByBooking.set(
                s.booking_id,
                typeof total === "number" ? total : 0
              );
            }
          }
          for (const val of latestByBooking.values()) {
            revenue += val;
          }
        }
      }
      setConfirmedRevenue(revenue);
    } catch {
      setConfirmedRevenue(0);
    }

    setSummaryLoading(false);
  }, [courseId, supabase, today]);

  const fetchRevenueBreakdown = useCallback(async () => {
    if (!courseId) return;
    setBreakdownLoading(true);
    try {
      // Get bookings that are NOT cancelled and NOT draft
      const { data: qualifyingBookings, error: bErr } = await supabase
        .from("bookings")
        .select("id")
        .eq("course_id", courseId)
        .not("status", "in", "(cancelled,draft)");

      const totals = {
        greenFees: 0,
        cartCost: 0,
        fbTotal: 0,
        barTotal: 0,
        addonTotal: 0,
      };

      if (!bErr && qualifyingBookings && qualifyingBookings.length > 0) {
        const qualifyingIds = new Set(qualifyingBookings.map((b) => b.id));
        const { data: snapshots, error: snapErr } = await supabase
          .from("pricing_snapshots")
          .select("booking_id, snapshot, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false });

        if (!snapErr && snapshots) {
          const seen = new Set<string>();
          for (const s of snapshots as Array<{
            booking_id: string;
            snapshot: {
              green_fees?: number;
              cart_cost?: number;
              fb_total?: number;
              bar_total?: number;
              addon_total?: number;
            } | null;
            created_at: string;
          }>) {
            if (!qualifyingIds.has(s.booking_id)) continue;
            if (seen.has(s.booking_id)) continue;
            seen.add(s.booking_id);
            const snap = s.snapshot ?? {};
            if (typeof snap.green_fees === "number")
              totals.greenFees += snap.green_fees;
            if (typeof snap.cart_cost === "number")
              totals.cartCost += snap.cart_cost;
            if (typeof snap.fb_total === "number")
              totals.fbTotal += snap.fb_total;
            if (typeof snap.bar_total === "number")
              totals.barTotal += snap.bar_total;
            if (typeof snap.addon_total === "number")
              totals.addonTotal += snap.addon_total;
          }
        }
      }
      setRevenueBreakdown(totals);
    } catch {
      setRevenueBreakdown({
        greenFees: 0,
        cartCost: 0,
        fbTotal: 0,
        barTotal: 0,
        addonTotal: 0,
      });
    } finally {
      setBreakdownLoading(false);
    }
  }, [courseId, supabase]);

  const fetchBookings = useCallback(async () => {
    if (!courseId) return;
    setBookingsLoading(true);
    setBookingsError(null);
    try {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, tournament_formats(name)")
        .eq("course_id", courseId)
        .order("date", { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as Booking[];
      setBookings(rows);

      // Fetch latest pricing snapshot for each booking (filter by course,
      // then group client-side — simple query PostgREST supports cleanly)
      if (rows.length > 0) {
        const { data: snapshots, error: snapErr } = await supabase
          .from("pricing_snapshots")
          .select("booking_id, snapshot, created_at")
          .eq("course_id", courseId)
          .order("created_at", { ascending: false });
        if (snapErr) throw snapErr;

        const map = new Map<string, PricingSnapshot>();
        if (snapshots) {
          for (const s of snapshots as PricingSnapshot[]) {
            if (!map.has(s.booking_id)) {
              map.set(s.booking_id, s);
            }
          }
        }
        setPricingMap(map);
      } else {
        setPricingMap(new Map());
      }
    } catch (err) {
      setBookingsError(
        err instanceof Error ? err.message : "Failed to load bookings"
      );
    } finally {
      setBookingsLoading(false);
    }
  }, [courseId, supabase]);

  useEffect(() => {
    if (!authLoading && courseId) {
      fetchSummary();
      fetchBookings();
      fetchRevenueBreakdown();
    }
  }, [authLoading, courseId, fetchSummary, fetchBookings, fetchRevenueBreakdown]);

  const handleCancelDraft = async (bookingId: string) => {
    const { error } = await supabase
      .from("bookings")
      .delete()
      .eq("id", bookingId)
      .eq("status", "draft");
    if (error) throw error;
    setSelectedBooking(null);
    fetchSummary();
    fetchBookings();
    fetchRevenueBreakdown();
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <NavBar escalatedCount={escalatedCount ?? 0} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 min-h-[calc(100vh-64px)] flex flex-col">
        <SummaryCards
          totalBookings={totalBookings}
          upcomingBookings={upcomingBookings}
          confirmedRevenue={confirmedRevenue}
          escalatedCount={escalatedCount}
          loading={summaryLoading}
          error={summaryError}
          onRetry={fetchSummary}
        />

        <RevenueBreakdownCards
          greenFees={revenueBreakdown.greenFees}
          cartCost={revenueBreakdown.cartCost}
          fbTotal={revenueBreakdown.fbTotal}
          barTotal={revenueBreakdown.barTotal}
          addonTotal={revenueBreakdown.addonTotal}
          loading={breakdownLoading}
        />

        <div className="flex-1 min-h-[600px]">
        <BookingTable
          bookings={bookings}
          pricingMap={pricingMap}
          loading={bookingsLoading}
          error={bookingsError}
          onRetry={fetchBookings}
          selectedFilter={selectedFilter}
          onFilterChange={setSelectedFilter}
          onSelectBooking={setSelectedBooking}
        />
        </div>

        <EscalatedConversations
          courseId={courseId}
          onChange={fetchSummary}
        />
      </main>

      {selectedBooking && (
        <BookingDetail
          booking={selectedBooking}
          snapshot={pricingMap.get(selectedBooking.id) ?? null}
          onClose={() => setSelectedBooking(null)}
          onCancelDraft={handleCancelDraft}
          onRefresh={() => {
            fetchSummary();
            fetchBookings();
            fetchRevenueBreakdown();
          }}
        />
      )}
    </div>
  );
}
