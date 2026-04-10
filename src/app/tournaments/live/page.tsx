'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/components/AuthProvider';

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface TournamentRow {
  booking_id: string;
  date: string;
  player_count: number;
  format_name: string;
  course_name: string;
  booking_status: string;
  round_id: string | null;
  round_status: string | null;
}

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export default function LiveTournamentsPage() {
  const supabase = useMemo(() => createClient(), []);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [rows, setRows] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;

    async function load() {
      try {
        if (!user) {
          setLoading(false);
          return;
        }

        const today = new Date().toISOString().split('T')[0];

        // 1. Confirmed bookings for today
        const { data: todayBookings } = await supabase
          .from('bookings')
          .select('id, date, player_count, status, courses ( name ), tournament_formats ( name )')
          .eq('status', 'confirmed')
          .eq('date', today);

        // 2. All bookings with tournament_rounds (any status)
        const { data: rounds } = await supabase
          .from('tournament_rounds')
          .select('id, booking_id, status')
          .order('created_at', { ascending: false });

        // Merge into deduplicated list
        const seen = new Set<string>();
        const merged: TournamentRow[] = [];

        // Fetch bookings for rounds
        if (rounds && rounds.length > 0) {
          const roundBookingIds = [...new Set(rounds.map((r: any) => r.booking_id))];
          const { data: roundBookings } = await supabase
            .from('bookings')
            .select('id, date, player_count, status, courses ( name ), tournament_formats ( name )')
            .in('id', roundBookingIds);

          const bookingMap = new Map<string, any>();
          if (roundBookings) {
            for (const b of roundBookings) bookingMap.set(b.id, b);
          }

          for (const r of rounds) {
            const b = bookingMap.get((r as any).booking_id);
            if (!b) continue;
            seen.add(b.id);
            merged.push({
              booking_id: b.id,
              date: b.date,
              player_count: b.player_count,
              format_name: (b as any).tournament_formats?.name ?? 'Tournament',
              course_name: (b as any).courses?.name ?? '',
              booking_status: b.status,
              round_id: (r as any).id,
              round_status: (r as any).status,
            });
          }
        }
        // Add today's confirmed bookings that don't have rounds yet
        if (todayBookings) {
          for (const b of todayBookings) {
            if (seen.has(b.id)) continue;
            merged.push({
              booking_id: b.id,
              date: b.date,
              player_count: b.player_count,
              format_name: (b as any).tournament_formats?.name ?? 'Tournament',
              course_name: (b as any).courses?.name ?? '',
              booking_status: b.status,
              round_id: null,
              round_status: null,
            });
          }
        }

        // Sort: in_progress first, then today's not_started, then completed by date desc
        merged.sort((a, b) => {
          const order = (r: TournamentRow) => {
            if (r.round_status === 'in_progress') return 0;
            if (r.round_status === 'paused') return 1;
            if (!r.round_status) return 2;
            if (r.round_status === 'not_started') return 3;
            return 4; // completed
          };
          const diff = order(a) - order(b);
          if (diff !== 0) return diff;
          return b.date.localeCompare(a.date);
        });

        setRows(merged);
      } catch {
        // Silently handle — empty state shown
      }
      setLoading(false);
    }
    load();
  }, [supabase, user, authLoading]);

  /* ── Helpers ── */
  const formatDate = (d: string) => {
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      });
    } catch { return d; }
  };

  const statusBadge = (row: TournamentRow) => {
    if (row.round_status === 'in_progress') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Live
        </span>
      );
    }
    if (row.round_status === 'paused') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800">Paused</span>;
    }
    if (row.round_status === 'completed') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">Completed</span>;
    }
    if (row.round_status === 'not_started') {
      return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">Not Started</span>;
    }
    // No round yet
    return <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">Ready</span>;
  };

  const actionButton = (row: TournamentRow) => {
    if (row.round_status === 'in_progress' || row.round_status === 'paused' || row.round_status === 'not_started') {
      return (
        <button
          onClick={() => router.push(`/tournament/${row.booking_id}`)}
          className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
        >
          Live Dashboard
        </button>
      );
    }
    if (row.round_status === 'completed') {
      return (
        <button
          onClick={() => router.push(`/results/${row.booking_id}`)}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
        >
          View Results
        </button>
      );
    }
    // No round — start tournament
    return (
      <button
        onClick={() => router.push(`/tournament/${row.booking_id}`)}
        className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition"
      >
        Start Tournament
      </button>
    );
  };

  /* ────────────────────────────────────────────
     Render
     ──────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-8 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Live Tournaments</h1>

        {loading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-600" />
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-16 text-gray-500">
            <p className="text-lg font-medium mb-1">No tournaments today</p>
            <p className="text-sm">Confirmed bookings for today will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.booking_id}
                className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="font-semibold text-gray-900">{row.format_name}</span>
                    {statusBadge(row)}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {formatDate(row.date)} • {row.player_count} players
                    {row.course_name && ` • ${row.course_name}`}
                  </div>
                </div>
                <div className="flex-shrink-0">
                  {actionButton(row)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
