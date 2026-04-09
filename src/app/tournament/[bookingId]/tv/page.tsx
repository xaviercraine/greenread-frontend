'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase-tournament';
import { usePoll } from '@/hooks/usePoll';

/* ────────────────────────────────────────────
   Types
   ──────────────────────────────────────────── */

interface Player {
  name: string;
  handicap: number;
}

interface LeaderboardEntry {
  position: number;
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  players: Player[];
  holes_completed: number;
  gross_total: number;
  net_total: number;
  vs_par: number;
  status: string;
  attested: boolean;
  finished_at: string | null;
}

interface Announcement {
  id: string;
  message: string;
  priority: string;
  created_at: string;
}

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export default function TVModePage() {
  const params = useParams();
  const bookingId = params.bookingId as string;

  const supabase = useMemo(() => createAnonClient(), []);

  const [roundId, setRoundId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('not_started');
  const [courseName, setCourseName] = useState<string | null>(null);
  const [tournamentDate, setTournamentDate] = useState<string | null>(null);
  const [formatName, setFormatName] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [urgentAnnouncement, setUrgentAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* ── Auto-scroll refs ── */
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollDirectionRef = useRef<'down' | 'up'>('down');
  const pauseUntilRef = useRef<number>(0);

  /* ── Resolve bookingId → tournament_round_id + metadata ── */
  useEffect(() => {
    async function init() {
      try {
        const { data: round, error: rErr } = await supabase
          .from('tournament_rounds')
          .select('id, status, course_id')
          .eq('booking_id', bookingId)
          .single();

        if (rErr || !round) {
          setError('Tournament not found.');
          setLoading(false);
          return;
        }

        setRoundId(round.id);
        setStatus(round.status);

        // Try metadata (may fail without anon RLS)
        try {
          const { data: booking } = await supabase
            .from('bookings')
            .select('date, courses ( name ), tournament_formats ( name )')
            .eq('id', bookingId)
            .single();
          if (booking) {
            setTournamentDate(booking.date);
            setCourseName((booking as any).courses?.name ?? null);
            setFormatName((booking as any).tournament_formats?.name ?? null);
          }
        } catch { /* degrade gracefully */ }

        setLoading(false);
      } catch {
        setError('Unable to load tournament.');
        setLoading(false);
      }
    }
    init();
  }, [bookingId, supabase]);

  /* ── Fetch leaderboard ── */
  const fetchLeaderboard = useCallback(async () => {
    if (!roundId) return null;
    const { data } = await supabase.rpc('get_leaderboard', {
      p_tournament_round_id: roundId,
    });
    if (data?.success && data.leaderboard) {
      setLeaderboard(data.leaderboard);
    }
    // Also refresh status
    const { data: roundData } = await supabase
      .from('tournament_rounds')
      .select('status')
      .eq('id', roundId)
      .single();
    if (roundData) setStatus(roundData.status);
    return data;
  }, [roundId, supabase]);

  /* ── Fetch urgent announcements ── */
  const fetchAnnouncements = useCallback(async () => {
    if (!roundId) return null;
    const { data } = await supabase
      .from('announcements')
      .select('id, message, priority, created_at')
      .eq('tournament_round_id', roundId)
      .eq('priority', 'urgent')
      .eq('target_type', 'broadcast')
      .order('created_at', { ascending: false })
      .limit(1);
    if (data && data.length > 0) {
      setUrgentAnnouncement(data[0]);
    } else {
      setUrgentAnnouncement(null);
    }
    return data;
  }, [roundId, supabase]);

  /* ── Initial load ── */
  useEffect(() => {
    if (roundId) {
      fetchLeaderboard();
      fetchAnnouncements();
    }
  }, [roundId, fetchLeaderboard, fetchAnnouncements]);

  /* ── Polling: 15s ── */
  usePoll(fetchLeaderboard, 15000, !!roundId);
  usePoll(fetchAnnouncements, 15000, !!roundId);

  /* ── Auto-scroll ── */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const interval = setInterval(() => {
      const now = Date.now();
      if (now < pauseUntilRef.current) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const maxScroll = scrollHeight - clientHeight;

      if (maxScroll <= 0) return; // everything fits, no scroll needed

      if (scrollDirectionRef.current === 'down') {
        if (scrollTop >= maxScroll - 2) {
          // Reached bottom — pause 5s then scroll up
          pauseUntilRef.current = now + 5000;
          scrollDirectionRef.current = 'up';
        } else {
          el.scrollTop += 1;
        }
      } else {
        if (scrollTop <= 2) {
          // Reached top — pause 5s then scroll down
          pauseUntilRef.current = now + 5000;
          scrollDirectionRef.current = 'down';
        } else {
          el.scrollTop -= 1;
        }
      }
    }, 40); // ~25fps smooth scroll

    return () => clearInterval(interval);
  }, [leaderboard]);

  /* ── Helpers ── */
  const formatDate = (d: string | null) => {
    if (!d) return '';
    try {
      return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return d; }
  };

  const formatVsPar = (v: number) => {
    if (v === 0) return 'E';
    return v > 0 ? `+${v}` : `${v}`;
  };

  const positionLabel = (entry: LeaderboardEntry) => {
    const samePos = leaderboard.filter(e => e.position === entry.position);
    if (samePos.length > 1) return `T${entry.position}`;
    return `${entry.position}`;
  };

  const activeEntries = leaderboard.filter(
    e => e.status !== 'withdrawn' && e.status !== 'dnf'
  );

  /* ────────────────────────────────────────────
     Render
     ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white text-2xl">
        {error}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col overflow-hidden" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* ── Urgent announcement banner ── */}
      {urgentAnnouncement && (
        <div className="bg-red-600 text-white px-6 py-3 text-center font-bold" style={{ fontSize: '28px' }}>
          ⚠ {urgentAnnouncement.message}
        </div>
      )}

      {/* ── Header ── */}
      <header className="px-8 py-6 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="font-bold text-green-400" style={{ fontSize: '42px', lineHeight: 1.1 }}>
              {courseName || 'Tournament Leaderboard'}
            </h1>
            <div className="flex gap-4 mt-2 text-gray-400" style={{ fontSize: '24px' }}>
              {tournamentDate && <span>{formatDate(tournamentDate)}</span>}
              {formatName && <span>• {formatName}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {status === 'in_progress' && (
              <div className="flex items-center gap-2 bg-green-900 px-4 py-2 rounded-full" style={{ fontSize: '20px' }}>
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-green-400" />
                </span>
                LIVE
              </div>
            )}
            {status === 'completed' && (
              <div className="bg-white text-black font-bold px-4 py-2 rounded-full" style={{ fontSize: '20px' }}>
                FINAL
              </div>
            )}
            {status === 'paused' && (
              <div className="bg-yellow-500 text-black font-bold px-4 py-2 rounded-full" style={{ fontSize: '20px' }}>
                PAUSED
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Leaderboard table ── */}
      <div ref={scrollRef} className="flex-1 overflow-hidden px-8 py-4">
        {activeEntries.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500" style={{ fontSize: '36px' }}>
            Waiting for scores…
          </div>
        ) : (
          <table className="w-full" style={{ fontSize: '24px' }}>
            <thead>
              <tr className="border-b-2 border-gray-700 text-gray-400" style={{ fontSize: '20px' }}>
                <th className="py-4 px-4 text-left font-semibold w-20">POS</th>
                <th className="py-4 px-4 text-left font-semibold w-24">TEAM</th>
                <th className="py-4 px-4 text-left font-semibold">PLAYERS</th>
                <th className="py-4 px-4 text-center font-semibold w-24">THRU</th>
                <th className="py-4 px-4 text-center font-semibold w-28">GROSS</th>
                <th className="py-4 px-4 text-center font-semibold w-28">NET</th>
                <th className="py-4 px-4 text-center font-semibold w-28">VS PAR</th>
              </tr>
            </thead>
            <tbody>
              {activeEntries.map((entry) => {
                const isTop3 = entry.position <= 3;
                return (
                  <tr
                    key={entry.foursome_id}
                    className={`border-b border-gray-800 ${isTop3 ? 'bg-green-900/30' : ''}`}
                  >
                    <td className="py-4 px-4 font-bold" style={{ fontSize: '28px' }}>
                      {positionLabel(entry)}
                      {entry.position === 1 && ' 🥇'}
                      {entry.position === 2 && ' 🥈'}
                      {entry.position === 3 && ' 🥉'}
                    </td>
                    <td className="py-4 px-4 text-green-400 font-semibold">
                      #{entry.foursome_number}
                    </td>
                    <td className="py-4 px-4">
                      {entry.players.map(p => p.name).join(', ')}
                    </td>
                    <td className="py-4 px-4 text-center text-gray-300">
                      {entry.attested ? 'F' : entry.holes_completed}
                    </td>
                    <td className="py-4 px-4 text-center font-semibold">
                      {entry.gross_total}
                    </td>
                    <td className="py-4 px-4 text-center font-semibold">
                      {entry.net_total}
                    </td>
                    <td className={`py-4 px-4 text-center font-bold ${
                      entry.vs_par < 0 ? 'text-red-400' : entry.vs_par === 0 ? 'text-green-400' : 'text-blue-400'
                    }`} style={{ fontSize: '28px' }}>
                      {formatVsPar(entry.vs_par)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="px-8 py-3 border-t border-gray-800 flex-shrink-0 text-center text-gray-600" style={{ fontSize: '16px' }}>
        Powered by Greenread
      </footer>
    </div>
  );
}
