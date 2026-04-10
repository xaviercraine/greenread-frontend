'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
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

interface ContestEntry {
  id: string;
  contest_type: string;
  label: string | null;
  participant_name: string | null;
  hole_number: number | null;
  nine_id: string | null;
  feet: number | null;
  inches: number | null;
  verified: boolean;
  created_at: string;
}

interface TournamentMeta {
  tournament_round_id: string;
  status: string;
  course_name: string | null;
  tournament_date: string | null;
  format_name: string | null;
  player_count: number | null;
  started_at: string | null;
}

/* ────────────────────────────────────────────
   Component
   ──────────────────────────────────────────── */

export default function PublicResultsPage() {
  const params = useParams();
  const bookingId = params.bookingId as string;

  const supabase = useMemo(() => createAnonClient(), []);

  const [meta, setMeta] = useState<TournamentMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [contests, setContests] = useState<ContestEntry[]>([]);
  const [largeFont, setLargeFont] = useState(false);
  const [shareMsg, setShareMsg] = useState('');
  const [loading, setLoading] = useState(true);

  /* ── Resolve bookingId → tournament metadata ── */
  useEffect(() => {
    async function loadMeta() {
      try {
        // Try reading tournament_rounds by booking_id (may fail if no anon RLS)
        const { data: round, error: roundErr } = await supabase
          .from('tournament_rounds')
          .select('id, status, course_id, started_at')
          .eq('booking_id', bookingId)
          .single();

        if (roundErr || !round) {
          setMetaError('Tournament not found. This booking may not have an active tournament.');
          setLoading(false);
          return;
        }

        // Try reading booking + course + format for header metadata
        let courseName: string | null = null;
        let tournamentDate: string | null = null;
        let formatName: string | null = null;
        let playerCount: number | null = null;

        try {
          const { data: booking } = await supabase
            .from('bookings')
            .select('date, player_count, format_id, course_id, courses ( name ), tournament_formats ( name )')
            .eq('id', bookingId)
            .single();

          if (booking) {
            tournamentDate = booking.date;
            playerCount = booking.player_count;
            courseName = (booking as any).courses?.name ?? null;
            formatName = (booking as any).tournament_formats?.name ?? null;
          }
        } catch {
          // Anon can't read bookings — degrade gracefully
        }

        // Fallback: try reading course name directly
        if (!courseName && round.course_id) {
          try {
            const { data: course } = await supabase
              .from('courses')
              .select('name')
              .eq('id', round.course_id)
              .single();
            if (course) courseName = course.name;
          } catch {
            // Anon can't read courses either — that's fine
          }
        }

        setMeta({
          tournament_round_id: round.id,
          status: round.status,
          course_name: courseName,
          tournament_date: tournamentDate,
          format_name: formatName,
          player_count: playerCount,
          started_at: round.started_at,
        });
        setLoading(false);
      } catch {
        setMetaError('Unable to load tournament data.');
        setLoading(false);
      }
    }
    loadMeta();
  }, [bookingId, supabase]);

  /* ── Fetch leaderboard ── */
  const fetchLeaderboard = useCallback(async () => {
    if (!meta?.tournament_round_id) return null;
    const { data } = await supabase.rpc('get_leaderboard', {
      p_tournament_round_id: meta.tournament_round_id,
    });
    if (data?.success && data.leaderboard) {
      setLeaderboard(data.leaderboard);
    }
    return data;
  }, [meta?.tournament_round_id, supabase]);

  /* ── Fetch contest entries ── */
  const fetchContests = useCallback(async () => {
    if (!meta?.tournament_round_id) return null;
    const { data } = await supabase
      .from('contest_entries')
      .select('*')
      .eq('tournament_round_id', meta.tournament_round_id)
      .order('contest_type')
      .order('created_at', { ascending: false });
    if (data) setContests(data);
    return data;
  }, [meta?.tournament_round_id, supabase]);

  /* ── Initial data load ── */
  useEffect(() => {
    if (meta) {
      fetchLeaderboard();
      fetchContests();
    }
  }, [meta, fetchLeaderboard, fetchContests]);

  /* ── Polling (only when in_progress) ── */
  const isLive = meta?.status === 'in_progress';
  usePoll(fetchLeaderboard, 15000, isLive);
  usePoll(fetchContests, 30000, isLive);

  /* ── Share ── */
  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setShareMsg('Link copied!');
      setTimeout(() => setShareMsg(''), 2000);
    }).catch(() => {
      setShareMsg('Copy failed');
      setTimeout(() => setShareMsg(''), 2000);
    });
  };

  /* ── Print ── */
  const handlePrint = () => window.print();

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

  const positionLabel = (entry: LeaderboardEntry, idx: number) => {
    // Check for ties
    const samePos = leaderboard.filter(e => e.position === entry.position);
    if (samePos.length > 1) return `T${entry.position}`;
    return `${entry.position}`;
  };

  /* ── Split leaderboard: active vs DNF/withdrawn ── */
  const activeEntries = leaderboard.filter(
    e => e.status !== 'withdrawn' && e.status !== 'dnf'
  );
  const inactiveEntries = leaderboard.filter(
    e => e.status === 'withdrawn' || e.status === 'dnf'
  );

  /* ── Group contests by type ── */
  const contestGroups = useMemo(() => {
    const groups: Record<string, ContestEntry[]> = {};
    for (const c of contests) {
      const key = c.label || c.contest_type;
      if (!groups[key]) groups[key] = [];
      groups[key].push(c);
    }
    return groups;
  }, [contests]);

  /* ── Font scale ── */
  const fs = largeFont ? 1.5 : 1;

  /* ────────────────────────────────────────────
     Render
     ──────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto mb-4" />
          <p className="text-gray-500">Loading tournament results…</p>
        </div>
      </div>
    );
  }

  if (metaError || !meta) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Tournament Not Found</h1>
          <p className="text-sm text-red-700">{metaError || 'Unable to load tournament data.'}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* ── Print styles ── */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { border-collapse: collapse; }
          th, td { border: 1px solid #d1d5db !important; padding: 6px 10px !important; }
          .top3-row { background: #f0fdf4 !important; }
        }
      `}</style>

      <div className="min-h-screen bg-white" style={{ fontSize: `${fs}rem` }}>
        {/* ── Header ── */}
        <header className="bg-green-800 text-white py-6 px-4 sm:px-8">
          <div className="max-w-4xl mx-auto">
            {meta.course_name && (
              <h1 className="font-bold mb-1" style={{ fontSize: `${1.75 * fs}rem` }}>
                {meta.course_name}
              </h1>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 opacity-90" style={{ fontSize: `${0.95 * fs}rem` }}>
              {meta.tournament_date && <span>{formatDate(meta.tournament_date)}</span>}
              {meta.format_name && <span>• {meta.format_name}</span>}
              {meta.player_count && <span>• {meta.player_count} Players</span>}
            </div>
            {isLive && (
              <div className="mt-3 inline-flex items-center gap-2 bg-green-600 px-3 py-1 rounded-full" style={{ fontSize: `${0.85 * fs}rem` }}>
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-300" />
                </span>
                Tournament In Progress — Live Results
              </div>
            )}
            {meta.status === 'completed' && (
              <div className="mt-3 inline-block bg-white text-green-800 font-semibold px-3 py-1 rounded-full" style={{ fontSize: `${0.85 * fs}rem` }}>
                Tournament Completed — Final Scores
              </div>
            )}
            {!meta.course_name && (
              <h1 className="font-bold" style={{ fontSize: `${1.75 * fs}rem` }}>
                Tournament Results
              </h1>
            )}
          </div>
        </header>

        {/* ── Controls ── */}
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-4 flex flex-wrap gap-3 no-print">
          <button
            onClick={() => setLargeFont(!largeFont)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {largeFont ? 'Normal Font' : 'Large Font (Projector)'}
          </button>
          <button
            onClick={handleShare}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            {shareMsg || 'Share Link'}
          </button>
          <button
            onClick={handlePrint}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
          >
            Print
          </button>
        </div>

        {/* ── Leaderboard ── */}
        <div className="max-w-4xl mx-auto px-4 sm:px-8 pb-8">
          <h2 className="font-bold text-gray-900 mb-4" style={{ fontSize: `${1.35 * fs}rem` }}>
            {meta.status === 'completed' ? 'Final Leaderboard' : 'Live Leaderboard'}
          </h2>

          {activeEntries.length === 0 ? (
            <p className="text-gray-500 py-8 text-center">No scores recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse" style={{ fontSize: `${0.9 * fs}rem` }}>
                <thead>
                  <tr className="border-b-2 border-gray-200 text-left">
                    <th className="py-3 px-3 font-semibold text-gray-600 w-12">Pos</th>
                    <th className="py-3 px-3 font-semibold text-gray-600">Foursome</th>
                    <th className="py-3 px-3 font-semibold text-gray-600">Players</th>
                    <th className="py-3 px-3 font-semibold text-gray-600 text-center">Thru</th>
                    <th className="py-3 px-3 font-semibold text-gray-600 text-center">Gross</th>
                    <th className="py-3 px-3 font-semibold text-gray-600 text-center">Net</th>
                    <th className="py-3 px-3 font-semibold text-gray-600 text-center">vs Par</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEntries.map((entry, idx) => {
                    const isTop3 = entry.position <= 3;
                    return (
                      <tr
                        key={entry.foursome_id}
                        className={`border-b border-gray-100 ${isTop3 ? 'top3-row bg-green-50' : ''}`}
                      >
                        <td className="py-3 px-3 font-bold text-gray-900">
                          {positionLabel(entry, idx)}
                          {entry.position === 1 && ' 🥇'}
                          {entry.position === 2 && ' 🥈'}
                          {entry.position === 3 && ' 🥉'}
                        </td>
                        <td className="py-3 px-3 text-gray-700">
                          #{entry.foursome_number}
                          <span className="text-gray-400 ml-1 text-xs">(Cart {entry.cart_number})</span>
                        </td>
                        <td className="py-3 px-3 text-gray-800">
                          {entry.players.map(p => p.name).join(', ')}
                        </td>
                        <td className="py-3 px-3 text-center text-gray-700">
                          {entry.attested ? 'F' : entry.holes_completed}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-gray-900">
                          {entry.gross_total}
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-gray-900">
                          {entry.net_total}
                        </td>
                        <td className={`py-3 px-3 text-center font-bold ${
                          entry.vs_par < 0 ? 'text-red-600' : entry.vs_par === 0 ? 'text-green-600' : 'text-blue-600'
                        }`}>
                          {formatVsPar(entry.vs_par)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── DNF / Withdrawn ── */}
          {inactiveEntries.length > 0 && (
            <div className="mt-6">
              <h3 className="font-semibold text-gray-500 mb-2" style={{ fontSize: `${0.95 * fs}rem` }}>
                DNF / Withdrawn
              </h3>
              <div className="space-y-2">
                {inactiveEntries.map(entry => (
                  <div key={entry.foursome_id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded">
                    <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-red-100 text-red-700 uppercase">
                      {entry.status}
                    </span>
                    <span className="text-gray-600">
                      #{entry.foursome_number} — {entry.players.map(p => p.name).join(', ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Contest Winners ── */}
          {Object.keys(contestGroups).length > 0 && (
            <div className="mt-10">
              <h2 className="font-bold text-gray-900 mb-4" style={{ fontSize: `${1.35 * fs}rem` }}>
                Contest Winners
              </h2>
              <div className="space-y-6">
                {Object.entries(contestGroups).map(([label, entries]) => (
                  <div key={label}>
                    <h3 className="font-semibold text-green-800 mb-2" style={{ fontSize: `${1.05 * fs}rem` }}>
                      {label}
                    </h3>
                    <div className="space-y-2">
                      {entries.map(c => (
                        <div key={c.id} className="flex items-center gap-3 py-2 px-3 bg-gray-50 rounded">
                          <span className="font-medium text-gray-900">
                            {c.participant_name || 'Unknown'}
                          </span>
                          {(c.feet !== null || c.inches !== null) && (
                            <span className="text-gray-500">
                              {c.feet != null ? `${c.feet}'` : ''}{c.inches != null ? `${c.inches}"` : ''}
                            </span>
                          )}
                          {c.hole_number && (
                            <span className="text-gray-400 text-sm">
                              Hole {c.hole_number}
                            </span>
                          )}
                          {c.verified && (
                            <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded bg-green-100 text-green-700">
                              Verified ✓
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Footer ── */}
          <div className="mt-12 pt-6 border-t border-gray-200 text-center text-gray-400 no-print" style={{ fontSize: `${0.8 * fs}rem` }}>
            Powered by Greenread
          </div>
        </div>
      </div>
    </>
  );
}
