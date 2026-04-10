'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createAuthedClient } from '@/lib/supabase-tournament';
import { usePoll } from '@/hooks/usePoll';

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

interface LeaderboardEntry {
  position: number;
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  players: { name: string; handicap: number }[];
  holes_completed: number;
  gross_total: number | null;
  net_total: number | null;
  vs_par: number | null;
  status: string;
  attested: boolean;
  finished_at: string | null;
}

interface ScorecardScore {
  nine_id: string;
  hole_number: number;
  par: number;
  strokes: number;
  version: number;
  attested: boolean;
}

interface ScorecardPlayer {
  participant_id: string;
  name: string;
  handicap: number;
  position: number;
}

interface ScorecardData {
  success: boolean;
  attested: boolean;
  tournament_status: string;
  scores: ScorecardScore[];
  players: ScorecardPlayer[];
}

interface KitchenTiming {
  success: boolean;
  groups_total: number;
  groups_playing: number;
  groups_finished: number;
  elapsed_minutes: number;
  last_group_cart: number | null;
  last_group_current_hole: number | null;
  estimated_last_group_finish: string | null;
  recommended_kitchen_fire_time: string | null;
}

interface FoursomeStatus {
  id: string;
  tournament_round_id: string;
  foursome_id: string;
  current_hole: number;
  current_nine_id: string | null;
  status: string;
  updated_at: string;
}

interface Announcement {
  id: string;
  tournament_round_id: string;
  course_id: string;
  message: string;
  priority: string;
  target_type: string;
  target_foursome_id: string | null;
  created_at: string;
}

interface ContestEntry {
  id: string;
  tournament_round_id: string;
  course_id: string;
  contest_type: string;
  label: string | null;
  hole_number: number | null;
  nine_id: string | null;
  participant_id: string | null;
  measurement_feet: number | null;
  measurement_inches: number | null;
  verified: boolean;
  created_at: string;
}

interface TournamentRound {
  id: string;
  booking_id: string;
  course_id: string;
  status: string;
  minutes_per_hole: number;
  leaderboard_cache: unknown;
  cache_stale: boolean;
  total_paused_minutes: number;
  created_at: string;
}

interface FoursomeRow {
  id: string;
  booking_id: string;
  course_id: string;
  foursome_number: number;
  cart_number: number;
  starting_hole: number;
}

interface MarshalSession {
  id: string;
  tournament_round_id: string;
  course_id: string;
  name: string;
  token: string;
  created_at: string;
}

type TabId = 'leaderboard' | 'course' | 'announcements' | 'contests' | 'roster';

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function medal(pos: number): string {
  return '';
}

function formatVsPar(v: number | null): string {
  if (v === null) return '—';
  if (v === 0) return 'E';
  return v > 0 ? `+${v}` : `${v}`;
}

function paceColor(
  currentHole: number,
  elapsedMinutes: number,
  minutesPerHole: number
): string {
  const expected = elapsedMinutes / minutesPerHole;
  const diff = currentHole - expected;
  if (diff >= -0.5) return '#22c55e'; // green
  if (diff >= -2) return '#eab308'; // yellow
  return '#ef4444'; // red
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch { return iso; }
}

function statusBadgeColor(status: string): string {
  switch (status) {
    case 'in_progress': return '#22c55e';
    case 'paused': return '#eab308';
    case 'completed': return '#6b7280';
    default: return '#94a3b8';
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case 'in_progress': return 'In Progress';
    case 'paused': return 'Paused';
    case 'completed': return 'Completed';
    case 'not_started': return 'Not Started';
    default: return status;
  }
}

function foursomeStatusLabel(s: string): { text: string; color: string } {
  switch (s) {
    case 'playing': return { text: 'Playing', color: '#22c55e' };
    case 'slow': return { text: 'Slow', color: '#eab308' };
    case 'needs_gm': return { text: 'Needs GM', color: '#ef4444' };
    case 'finished': return { text: 'Finished', color: '#6b7280' };
    case 'dnf': return { text: 'DNF', color: '#ef4444' };
    case 'withdrawn': return { text: 'Withdrawn', color: '#ef4444' };
    default: return { text: s, color: '#94a3b8' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function GMTournamentDashboard() {
  const params = useParams();
  const router = useRouter();
  const bookingId = params.bookingId as string;
  const supabase = useMemo(() => createAuthedClient(), []);

  // ─── Core state ────────────────────────────────────────────
  const [round, setRound] = useState<TournamentRound | null>(null);
  const [foursomes, setFoursomes] = useState<FoursomeRow[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('leaderboard');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ─── Scorecard slide-out ───────────────────────────────────
  const [selectedFoursomeId, setSelectedFoursomeId] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [editingHole, setEditingHole] = useState<{ nineId: string; hole: number } | null>(null);
  const [editStrokes, setEditStrokes] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  // ─── Modals ────────────────────────────────────────────────
  const [showEndModal, setShowEndModal] = useState(false);
  const [endingTournament, setEndingTournament] = useState(false);

  // ─── Announcement form ─────────────────────────────────────
  const [annMessage, setAnnMessage] = useState('');
  const [annPriority, setAnnPriority] = useState<'normal' | 'urgent'>('normal');
  const [annTarget, setAnnTarget] = useState<'broadcast' | 'foursome'>('broadcast');
  const [annFoursomeId, setAnnFoursomeId] = useState('');
  const [annSending, setAnnSending] = useState(false);

  // ─── Contest form ──────────────────────────────────────────
  const [contestType, setContestType] = useState('ctp');
  const [contestLabel, setContestLabel] = useState('');
  const [contestHole, setContestHole] = useState('');
  const [contestParticipant, setContestParticipant] = useState('');
  const [contestFeet, setContestFeet] = useState('');
  const [contestInches, setContestInches] = useState('');
  const [contestVerified, setContestVerified] = useState(false);
  const [contestSaving, setContestSaving] = useState(false);

  // ─── Roster: Swap ──────────────────────────────────────────
  const [swapParticipantId, setSwapParticipantId] = useState<string | null>(null);
  const [swapFoursomeId, setSwapFoursomeId] = useState<string | null>(null);
  const [swapName, setSwapName] = useState('');
  const [swapEmail, setSwapEmail] = useState('');
  const [swapHandicap, setSwapHandicap] = useState('');
  const [swapSaving, setSwapSaving] = useState(false);

  // ─── Roster: Marshal ───────────────────────────────────────
  const [showMarshalModal, setShowMarshalModal] = useState(false);
  const [marshalName, setMarshalName] = useState('');
  const [marshalPin, setMarshalPin] = useState('');
  const [marshalSaving, setMarshalSaving] = useState(false);
  const [marshalSessions, setMarshalSessions] = useState<MarshalSession[]>([]);

  // ─── Contest entries state ─────────────────────────────────
  const [contestEntries, setContestEntries] = useState<ContestEntry[]>([]);

  // ═══════════════════════════════════════════════════════════════
  // Init: Load tournament round + foursomes
  // ═══════════════════════════════════════════════════════════════

  useEffect(() => {
    async function init() {
      setLoading(true);
      try {
        const { data: rounds, error: rErr } = await supabase
          .from('tournament_rounds')
          .select('*')
          .eq('booking_id', bookingId)
          .limit(1);
        if (rErr) throw rErr;
        if (!rounds || rounds.length === 0) {
          setError('No tournament round found for this booking.');
          setLoading(false);
          return;
        }
        const r = rounds[0] as TournamentRound;
        setRound(r);

        const { data: fs, error: fErr } = await supabase
          .from('foursomes')
          .select('*')
          .eq('booking_id', bookingId)
          .order('foursome_number');
        if (fErr) throw fErr;
        setFoursomes((fs || []) as FoursomeRow[]);

        // Load marshal sessions
        const { data: ms } = await supabase
          .from('marshal_sessions')
          .select('*')
          .eq('tournament_round_id', r.id)
          .order('created_at');
        setMarshalSessions((ms || []) as MarshalSession[]);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Failed to load tournament');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [bookingId, supabase]);

  // ═══════════════════════════════════════════════════════════════
  // Polling
  // ═══════════════════════════════════════════════════════════════

  const fetchLeaderboard = useCallback(async () => {
    if (!round) return null;
    const { data } = await supabase.rpc('get_leaderboard', {
      p_tournament_round_id: round.id,
    });
    return data as { success: boolean; leaderboard: LeaderboardEntry[] } | null;
  }, [round, supabase]);

  const fetchKitchen = useCallback(async () => {
    if (!round) return null;
    const { data } = await supabase.rpc('get_kitchen_timing', {
      p_tournament_round_id: round.id,
    });
    return data as KitchenTiming | null;
  }, [round, supabase]);

  const fetchFoursomeStatus = useCallback(async () => {
    if (!round) return null;
    const { data } = await supabase
      .from('foursome_status')
      .select('*')
      .eq('tournament_round_id', round.id);
    return (data || []) as FoursomeStatus[];
  }, [round, supabase]);

  const fetchAnnouncements = useCallback(async () => {
    if (!round) return null;
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .eq('tournament_round_id', round.id)
      .order('created_at', { ascending: false });
    return (data || []) as Announcement[];
  }, [round, supabase]);

  const fetchContestEntries = useCallback(async () => {
    if (!round) return null;
    const { data } = await supabase
      .from('contest_entries')
      .select('*')
      .eq('tournament_round_id', round.id)
      .order('created_at', { ascending: false });
    return (data || []) as ContestEntry[];
  }, [round, supabase]);

  const leaderboardPoll = usePoll(fetchLeaderboard, 15000, !!round);
  const kitchenPoll = usePoll(fetchKitchen, 15000, !!round && activeTab === 'course');
  const foursomeStatusPoll = usePoll(fetchFoursomeStatus, 10000, !!round && activeTab === 'course');
  const announcementsPoll = usePoll(fetchAnnouncements, 10000, !!round && activeTab === 'announcements');
  const contestsPoll = usePoll(fetchContestEntries, 15000, !!round && activeTab === 'contests');

  const leaderboard: LeaderboardEntry[] = leaderboardPoll.data?.leaderboard || [];

  // Keep contestEntries in sync with poll
  useEffect(() => {
    if (contestsPoll.data) setContestEntries(contestsPoll.data);
  }, [contestsPoll.data]);

  // Build a flat participant list from leaderboard for dropdowns
  const allParticipants = useMemo(() => {
    const list: { name: string; foursomeId: string; foursomeNumber: number }[] = [];
    for (const entry of leaderboard) {
      for (const p of entry.players) {
        list.push({ name: p.name, foursomeId: entry.foursome_id, foursomeNumber: entry.foursome_number });
      }
    }
    return list;
  }, [leaderboard]);

  // ═══════════════════════════════════════════════════════════════
  // Actions
  // ═══════════════════════════════════════════════════════════════

  async function handlePause() {
    if (!round) return;
    await supabase.rpc('pause_tournament', {
      p_tournament_round_id: round.id,
      p_course_id: round.course_id,
    });
    setRound({ ...round, status: 'paused' });
  }

  async function handleResume() {
    if (!round) return;
    await supabase.rpc('resume_tournament', {
      p_tournament_round_id: round.id,
      p_course_id: round.course_id,
    });
    setRound({ ...round, status: 'in_progress' });
  }

  async function handleEndTournament() {
    if (!round) return;
    setEndingTournament(true);
    try {
      await supabase.rpc('complete_tournament', {
        p_tournament_round_id: round.id,
        p_course_id: round.course_id,
      });
      setRound({ ...round, status: 'completed' });
      setShowEndModal(false);
      leaderboardPoll.refresh();
    } finally {
      setEndingTournament(false);
    }
  }

  // ─── Scorecard ─────────────────────────────────────────────

  async function openScorecard(foursomeId: string) {
    if (!round) return;
    setSelectedFoursomeId(foursomeId);
    setScorecardLoading(true);
    setEditingHole(null);
    try {
      const { data } = await supabase.rpc('get_scorecard', {
        p_tournament_round_id: round.id,
        p_foursome_id: foursomeId,
      });
      setScorecard(data as ScorecardData);
    } finally {
      setScorecardLoading(false);
    }
  }

  async function handleEditScore() {
    if (!round || !selectedFoursomeId || !editingHole) return;
    setEditSaving(true);
    try {
      await supabase.rpc('gm_edit_score', {
        p_tournament_round_id: round.id,
        p_course_id: round.course_id,
        p_foursome_id: selectedFoursomeId,
        p_nine_id: editingHole.nineId,
        p_hole_number: editingHole.hole,
        p_new_strokes: parseInt(editStrokes),
        p_reason: editReason,
      });
      // Refresh scorecard
      const { data } = await supabase.rpc('get_scorecard', {
        p_tournament_round_id: round.id,
        p_foursome_id: selectedFoursomeId,
      });
      setScorecard(data as ScorecardData);
      setEditingHole(null);
      setEditStrokes('');
      setEditReason('');
      leaderboardPoll.refresh();
    } finally {
      setEditSaving(false);
    }
  }

  async function handleUnattest() {
    if (!round || !selectedFoursomeId) return;
    await supabase.rpc('gm_unattest_scorecard', {
      p_tournament_round_id: round.id,
      p_course_id: round.course_id,
      p_foursome_id: selectedFoursomeId,
    });
    // Refresh
    const { data } = await supabase.rpc('get_scorecard', {
      p_tournament_round_id: round.id,
      p_foursome_id: selectedFoursomeId,
    });
    setScorecard(data as ScorecardData);
    leaderboardPoll.refresh();
  }

  // ─── Announcements ────────────────────────────────────────

  async function handleSendAnnouncement() {
    if (!round || !annMessage.trim()) return;
    setAnnSending(true);
    try {
      await supabase.from('announcements').insert({
        tournament_round_id: round.id,
        course_id: round.course_id,
        message: annMessage.trim(),
        priority: annPriority,
        target_type: annTarget,
        target_foursome_id: annTarget === 'foursome' ? annFoursomeId : null,
      });
      setAnnMessage('');
      setAnnPriority('normal');
      setAnnTarget('broadcast');
      announcementsPoll.refresh();
    } finally {
      setAnnSending(false);
    }
  }

  // ─── Contests ──────────────────────────────────────────────

  async function handleAddContest() {
    if (!round) return;
    setContestSaving(true);
    try {
      await supabase.from('contest_entries').insert({
        tournament_round_id: round.id,
        course_id: round.course_id,
        contest_type: contestType,
        label: contestLabel || null,
        hole_number: contestHole ? parseInt(contestHole) : null,
        nine_id: null,
        participant_id: contestParticipant || null,
        measurement_feet: contestFeet ? parseInt(contestFeet) : null,
        measurement_inches: contestInches ? parseInt(contestInches) : null,
        verified: contestVerified,
      });
      setContestType('ctp');
      setContestLabel('');
      setContestHole('');
      setContestParticipant('');
      setContestFeet('');
      setContestInches('');
      setContestVerified(false);
      contestsPoll.refresh();
    } finally {
      setContestSaving(false);
    }
  }

  async function handleDeleteContest(id: string) {
    await supabase.from('contest_entries').delete().eq('id', id);
    contestsPoll.refresh();
  }

  // ─── Swap Participant ──────────────────────────────────────

  async function handleSwap() {
    if (!round || !swapParticipantId || !swapFoursomeId || !swapName.trim()) return;
    setSwapSaving(true);
    try {
      await supabase.rpc('swap_participant', {
        p_tournament_round_id: round.id,
        p_course_id: round.course_id,
        p_foursome_id: swapFoursomeId,
        p_old_participant_id: swapParticipantId,
        p_new_name: swapName.trim(),
        p_new_email: swapEmail.trim() || null,
        p_new_handicap: swapHandicap ? parseInt(swapHandicap) : 0,
      });
      setSwapParticipantId(null);
      setSwapFoursomeId(null);
      setSwapName('');
      setSwapEmail('');
      setSwapHandicap('');
      leaderboardPoll.refresh();
    } finally {
      setSwapSaving(false);
    }
  }

  // ─── Create Marshal Session ────────────────────────────────

  async function handleCreateMarshal() {
    if (!round || !marshalName.trim() || marshalPin.length !== 4) return;
    setMarshalSaving(true);
    try {
      const { data } = await supabase.rpc('create_marshal_session', {
        p_tournament_round_id: round.id,
        p_course_id: round.course_id,
        p_name: marshalName.trim(),
        p_pin: marshalPin,
      });
      setMarshalName('');
      setMarshalPin('');
      setShowMarshalModal(false);
      // Reload marshal sessions
      const { data: ms } = await supabase
        .from('marshal_sessions')
        .select('*')
        .eq('tournament_round_id', round.id)
        .order('created_at');
      setMarshalSessions((ms || []) as MarshalSession[]);
    } finally {
      setMarshalSaving(false);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Render helpers
  // ═══════════════════════════════════════════════════════════════

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: "'DM Sans', sans-serif" }}>
        <p style={{ fontSize: 18, opacity: 0.7 }}>Loading tournament…</p>
      </div>
    );
  }

  if (error || !round) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#0a0a0a', color: '#fff', fontFamily: "'DM Sans', sans-serif", flexDirection: 'column', gap: 12 }}>
        <p style={{ fontSize: 18, color: '#ef4444' }}>{error || 'Tournament not found'}</p>
        <button onClick={() => router.back()} style={{ padding: '8px 20px', background: '#1a1a1a', color: '#fff', border: '1px solid #333', borderRadius: 6, cursor: 'pointer' }}>
          Go Back
        </button>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'leaderboard', label: 'Leaderboard' },
    { id: 'course', label: 'Course Status' },
    { id: 'announcements', label: 'Announcements' },
    { id: 'contests', label: 'Contests' },
    { id: 'roster', label: 'Roster' },
  ];

  // ═══════════════════════════════════════════════════════════════
  // Styles
  // ═══════════════════════════════════════════════════════════════

  const s = {
    page: { minHeight: '100vh', background: '#0a0a0a', color: '#e5e5e5', fontFamily: "'DM Sans', -apple-system, sans-serif", padding: '0 0 40px 0' } as React.CSSProperties,
    header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #1f1f1f', flexWrap: 'wrap' as const, gap: 12 },
    headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
    headerRight: { display: 'flex', alignItems: 'center', gap: 8 },
    badge: (color: string) => ({ display: 'inline-block', padding: '4px 12px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: color + '22', color, border: `1px solid ${color}44` }) as React.CSSProperties,
    btn: (bg: string, fg: string = '#fff') => ({ padding: '8px 16px', background: bg, color: fg, border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' as const }) as React.CSSProperties,
    btnOutline: { padding: '8px 16px', background: 'transparent', color: '#a3a3a3', border: '1px solid #333', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer' } as React.CSSProperties,
    tabBar: { display: 'flex', gap: 0, borderBottom: '1px solid #1f1f1f', padding: '0 24px', overflowX: 'auto' as const },
    tab: (active: boolean) => ({ padding: '12px 20px', fontSize: 14, fontWeight: active ? 600 : 400, color: active ? '#fff' : '#737373', background: 'transparent', border: 'none', borderBottom: active ? '2px solid #22c55e' : '2px solid transparent', cursor: 'pointer', whiteSpace: 'nowrap' as const }) as React.CSSProperties,
    content: { padding: '20px 24px' },
    table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 14 },
    th: { textAlign: 'left' as const, padding: '10px 12px', borderBottom: '1px solid #1f1f1f', color: '#737373', fontWeight: 500, fontSize: 12, textTransform: 'uppercase' as const, letterSpacing: '0.05em' },
    td: { padding: '10px 12px', borderBottom: '1px solid #141414' },
    card: { background: '#141414', border: '1px solid #1f1f1f', borderRadius: 8, padding: 16 },
    input: { width: '100%', padding: '8px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#e5e5e5', fontSize: 14, outline: 'none' } as React.CSSProperties,
    select: { padding: '8px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#e5e5e5', fontSize: 14, outline: 'none' } as React.CSSProperties,
    textarea: { width: '100%', padding: '8px 12px', background: '#1a1a1a', border: '1px solid #333', borderRadius: 6, color: '#e5e5e5', fontSize: 14, outline: 'none', resize: 'vertical' as const, minHeight: 60 } as React.CSSProperties,
    slideOut: { position: 'fixed' as const, top: 0, right: 0, width: '480px', maxWidth: '100vw', height: '100vh', background: '#0f0f0f', borderLeft: '1px solid #1f1f1f', zIndex: 50, overflowY: 'auto' as const, padding: 24 },
    overlay: { position: 'fixed' as const, inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 49 },
    modal: { position: 'fixed' as const, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#141414', border: '1px solid #1f1f1f', borderRadius: 12, padding: 24, zIndex: 51, width: 400, maxWidth: '90vw' },
    label: { display: 'block', fontSize: 12, color: '#737373', marginBottom: 4, fontWeight: 500 },
    formGroup: { marginBottom: 12 },
  };

  // ═══════════════════════════════════════════════════════════════
  // Tab: Leaderboard
  // ═══════════════════════════════════════════════════════════════

  function renderLeaderboard() {
    if (leaderboardPoll.loading && leaderboard.length === 0) {
      return <p style={{ color: '#737373' }}>Loading leaderboard…</p>;
    }

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Pos</th>
              <th style={s.th}>Foursome</th>
              <th style={s.th}>Cart</th>
              <th style={s.th}>Players</th>
              <th style={s.th}>Thru</th>
              <th style={s.th}>Gross</th>
              <th style={s.th}>Net</th>
              <th style={s.th}>vs Par</th>
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {leaderboard.map((entry) => {
              const isDead = entry.status === 'dnf' || entry.status === 'withdrawn';
              const rowStyle: React.CSSProperties = {
                cursor: 'pointer',
                opacity: isDead ? 0.4 : 1,
                transition: 'background 0.15s',
              };
              // Check if this position is shared (tie)
              const isTied = leaderboard.filter(e => e.position === entry.position).length > 1;

              return (
                <tr
                  key={entry.foursome_id}
                  style={rowStyle}
                  onClick={() => openScorecard(entry.foursome_id)}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#1a1a1a')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={s.td}>
                    {medal(entry.position)} {entry.position}{isTied ? '(T)' : ''}
                  </td>
                  <td style={s.td}>#{entry.foursome_number}</td>
                  <td style={s.td}>{entry.cart_number}</td>
                  <td style={s.td}>
                    {entry.players.map(p => p.name).join(', ')}
                  </td>
                  <td style={s.td}>{entry.holes_completed}</td>
                  <td style={s.td}>{entry.gross_total ?? '—'}</td>
                  <td style={s.td}>{entry.net_total ?? '—'}</td>
                  <td style={{ ...s.td, fontWeight: 600, color: (entry.vs_par ?? 0) < 0 ? '#22c55e' : (entry.vs_par ?? 0) > 0 ? '#ef4444' : '#e5e5e5' }}>
                    {formatVsPar(entry.vs_par)}
                  </td>
                  <td style={s.td}>
                    {entry.attested && <span style={{ marginRight: 6, color: '#22c55e' }}>✓</span>}
                    {isDead && <span style={{ color: '#ef4444', fontWeight: 600, fontSize: 12, textTransform: 'uppercase' }}>{entry.status}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {leaderboard.length === 0 && (
          <p style={{ color: '#737373', textAlign: 'center', padding: 40 }}>No leaderboard data yet.</p>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Scorecard Slide-Out
  // ═══════════════════════════════════════════════════════════════

  function renderScorecardSlideOut() {
    if (!selectedFoursomeId) return null;
    const entry = leaderboard.find(e => e.foursome_id === selectedFoursomeId);

    return (
      <>
        <div style={s.overlay} onClick={() => setSelectedFoursomeId(null)} />
        <div style={s.slideOut}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              Scorecard — Foursome #{entry?.foursome_number ?? '?'}
            </h2>
            <button onClick={() => setSelectedFoursomeId(null)} aria-label="Close scorecard" style={{ background: 'none', border: 'none', color: '#737373', cursor: 'pointer', fontSize: 20 }}>✕</button>
          </div>

          {scorecardLoading && <p style={{ color: '#737373' }}>Loading scorecard…</p>}

          {scorecard && !scorecardLoading && (
            <>
              {/* Players */}
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: '#737373', marginBottom: 4 }}>Players</p>
                {scorecard.players.map(p => (
                  <span key={p.participant_id} style={{ display: 'inline-block', background: '#1a1a1a', padding: '4px 10px', borderRadius: 4, marginRight: 6, marginBottom: 4, fontSize: 13 }}>
                    {p.name} ({p.handicap})
                  </span>
                ))}
              </div>

              {/* Un-attest button (v3 delta #11) */}
              {scorecard.attested && (
                <button
                  onClick={handleUnattest}
                  style={{ ...s.btn('#eab308', '#000'), marginBottom: 16 }}
                >
                  Un-attest Scorecard
                </button>
              )}

              {/* Scores grouped by nine_id */}
              {(() => {
                const nineIds = [...new Set(scorecard.scores.map(sc => sc.nine_id))];
                return nineIds.map((nineId, nIdx) => {
                  const nineScores = scorecard.scores
                    .filter(sc => sc.nine_id === nineId)
                    .sort((a, b) => a.hole_number - b.hole_number);
                  const totalStrokes = nineScores.reduce((sum, sc) => sum + (sc.strokes || 0), 0);
                  const totalPar = nineScores.reduce((sum, sc) => sum + sc.par, 0);

                  return (
                    <div key={nineId} style={{ marginBottom: 20 }}>
                      <p style={{ fontSize: 12, color: '#737373', marginBottom: 8, fontWeight: 600 }}>
                        Nine {nIdx + 1}
                      </p>
                      <div style={{ overflowX: 'auto' }}>
                      <table style={{ ...s.table, fontSize: 13 }}>
                        <thead>
                          <tr>
                            <th style={{ ...s.th, fontSize: 11 }}>Hole</th>
                            {nineScores.map(sc => (
                              <th key={sc.hole_number} style={{ ...s.th, fontSize: 11, textAlign: 'center' }}>{sc.hole_number}</th>
                            ))}
                            <th style={{ ...s.th, fontSize: 11, textAlign: 'center' }}>Tot</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td style={{ ...s.td, color: '#737373', fontSize: 12 }}>Par</td>
                            {nineScores.map(sc => (
                              <td key={sc.hole_number} style={{ ...s.td, textAlign: 'center', color: '#737373' }}>{sc.par}</td>
                            ))}
                            <td style={{ ...s.td, textAlign: 'center', color: '#737373', fontWeight: 600 }}>{totalPar}</td>
                          </tr>
                          <tr>
                            <td style={{ ...s.td, fontSize: 12 }}>Score</td>
                            {nineScores.map(sc => {
                              const isEditing = editingHole?.nineId === nineId && editingHole?.hole === sc.hole_number;
                              const diff = sc.strokes ? sc.strokes - sc.par : 0;
                              const cellColor = !sc.strokes ? '#737373' : diff < 0 ? '#22c55e' : diff > 0 ? '#ef4444' : '#e5e5e5';

                              return (
                                <td
                                  key={sc.hole_number}
                                  style={{ ...s.td, textAlign: 'center', color: cellColor, fontWeight: 600, cursor: 'pointer', position: 'relative' }}
                                  onClick={() => {
                                    if (!isEditing) {
                                      setEditingHole({ nineId, hole: sc.hole_number });
                                      setEditStrokes(sc.strokes ? String(sc.strokes) : '');
                                      setEditReason('');
                                    }
                                  }}
                                >
                                  {sc.strokes || '—'}
                                </td>
                              );
                            })}
                            <td style={{ ...s.td, textAlign: 'center', fontWeight: 700 }}>{totalStrokes || '—'}</td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    </div>
                  );
                });
              })()}

              {/* Edit form */}
              {editingHole && (
                <div style={{ ...s.card, marginTop: 12 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    Edit Hole {editingHole.hole}
                  </p>
                  <div style={s.formGroup}>
                    <label style={s.label}>Strokes</label>
                    <input
                      type="number"
                      value={editStrokes}
                      onChange={e => setEditStrokes(e.target.value)}
                      style={{ ...s.input, width: 80 }}
                      min={1}
                    />
                  </div>
                  <div style={s.formGroup}>
                    <label style={s.label}>Reason (required)</label>
                    <input
                      value={editReason}
                      onChange={e => setEditReason(e.target.value)}
                      style={s.input}
                      placeholder="e.g., Scorekeeper error"
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={handleEditScore}
                      disabled={editSaving || !editStrokes || !editReason.trim()}
                      style={{ ...s.btn('#22c55e'), opacity: editSaving || !editStrokes || !editReason.trim() ? 0.5 : 1 }}
                    >
                      {editSaving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setEditingHole(null)} style={s.btnOutline}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Tab: Course Status
  // ═══════════════════════════════════════════════════════════════

  function renderCourseStatus() {
    const kitchen = kitchenPoll.data;
    const statuses: FoursomeStatus[] = foursomeStatusPoll.data || [];

    return (
      <div>
        {/* Kitchen timing banner */}
        {kitchen && kitchen.success && (
          <div style={{ ...s.card, marginBottom: 20, borderColor: '#22c55e33' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span style={{ fontSize: 12, color: '#737373' }}>Last Group</span>
                <p style={{ margin: '2px 0', fontWeight: 600 }}>
                  Cart #{kitchen.last_group_cart ?? '?'} — Hole {kitchen.last_group_current_hole ?? '?'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#737373' }}>Est. Finish</span>
                <p style={{ margin: '2px 0', fontWeight: 600 }}>{formatTime(kitchen.estimated_last_group_finish)}</p>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#737373' }}>Kitchen Fire</span>
                <p style={{ margin: '2px 0', fontWeight: 600, color: '#22c55e' }}>{formatTime(kitchen.recommended_kitchen_fire_time)}</p>
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#737373' }}>Progress</span>
                <p style={{ margin: '2px 0', fontWeight: 600 }}>{kitchen.groups_finished}/{kitchen.groups_total} finished</p>
              </div>
            </div>
          </div>
        )}

        {/* Foursome cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {foursomes.map(f => {
            const status = statuses.find(fs => fs.foursome_id === f.id);
            const lbEntry = leaderboard.find(e => e.foursome_id === f.id);
            const fsLabel = status ? foursomeStatusLabel(status.status) : { text: '—', color: '#737373' };
            const isFinished = status?.status === 'finished';
            const isDead = status?.status === 'dnf' || status?.status === 'withdrawn';

            return (
              <div key={f.id} style={{ ...s.card, opacity: isDead ? 0.5 : 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600 }}>#{f.foursome_number} — Cart {f.cart_number}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: fsLabel.color }}>{fsLabel.text}</span>
                </div>
                {!isFinished && !isDead && status && (
                  <>
                    <p style={{ fontSize: 13, margin: '0 0 4px', color: '#a3a3a3' }}>
                      Hole {status.current_hole}
                    </p>
                    {kitchen && (
                      <div style={{ height: 4, borderRadius: 2, background: '#1f1f1f', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%',
                          borderRadius: 2,
                          background: paceColor(status.current_hole, kitchen.elapsed_minutes, round.minutes_per_hole),
                          width: `${Math.min(100, (status.current_hole / 18) * 100)}%`,
                          transition: 'width 0.3s',
                        }} />
                      </div>
                    )}
                  </>
                )}
                {isFinished && lbEntry?.finished_at && (
                  <p style={{ fontSize: 12, color: '#737373', margin: 0 }}>
                    Finished {new Date(lbEntry.finished_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
                {lbEntry && (
                  <p style={{ fontSize: 12, color: '#737373', marginTop: 4 }}>
                    {lbEntry.players.map(p => p.name).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Tab: Announcements
  // ═══════════════════════════════════════════════════════════════

  function renderAnnouncements() {
    const anns: Announcement[] = announcementsPoll.data || [];

    return (
      <div>
        {/* Send form */}
        <div style={{ ...s.card, marginBottom: 20 }}>
          <div style={s.formGroup}>
            <label style={s.label}>Message</label>
            <textarea
              value={annMessage}
              onChange={e => setAnnMessage(e.target.value)}
              style={s.textarea}
              placeholder="Type announcement…"
            />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div>
              <label style={s.label}>Priority</label>
              <select value={annPriority} onChange={e => setAnnPriority(e.target.value as 'normal' | 'urgent')} style={s.select}>
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Target</label>
              <select value={annTarget} onChange={e => setAnnTarget(e.target.value as 'broadcast' | 'foursome')} style={s.select}>
                <option value="broadcast">Broadcast (All)</option>
                <option value="foursome">Specific Foursome</option>
              </select>
            </div>
            {annTarget === 'foursome' && (
              <div>
                <label style={s.label}>Foursome</label>
                <select value={annFoursomeId} onChange={e => setAnnFoursomeId(e.target.value)} style={s.select}>
                  <option value="">Select…</option>
                  {foursomes.map(f => (
                    <option key={f.id} value={f.id}>#{f.foursome_number} (Cart {f.cart_number})</option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={handleSendAnnouncement}
              disabled={annSending || !annMessage.trim()}
              style={{ ...s.btn('#22c55e'), opacity: annSending || !annMessage.trim() ? 0.5 : 1 }}
            >
              {annSending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>

        {/* Sent list */}
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: '#a3a3a3' }}>Sent Announcements</h3>
        {anns.length === 0 && <p style={{ color: '#737373' }}>No announcements yet.</p>}
        {anns.map(a => (
          <div key={a.id} style={{ ...s.card, marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: 14 }}>{a.message}</p>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: '#737373' }}>
                {a.target_type === 'foursome' ? `Foursome` : 'All'} · {new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            {a.priority === 'urgent' && (
              <span style={{ ...s.badge('#ef4444'), fontSize: 11, flexShrink: 0 }}>Urgent</span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Tab: Contests
  // ═══════════════════════════════════════════════════════════════

  function renderContests() {
    return (
      <div>
        {/* Entry form */}
        <div style={{ ...s.card, marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <label style={s.label}>Type</label>
              <select value={contestType} onChange={e => setContestType(e.target.value)} style={s.select}>
                <option value="ctp">Closest to Pin</option>
                <option value="longest_drive">Longest Drive</option>
                <option value="hole_in_one">Hole-in-One</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label style={s.label}>Label</label>
              <input value={contestLabel} onChange={e => setContestLabel(e.target.value)} style={{ ...s.input, width: 140 }} placeholder="e.g., Hole 7 CTP" />
            </div>
            <div>
              <label style={s.label}>Hole #</label>
              <input type="number" value={contestHole} onChange={e => setContestHole(e.target.value)} style={{ ...s.input, width: 60 }} min={1} max={18} />
            </div>
            <div>
              <label style={s.label}>Participant</label>
              <select value={contestParticipant} onChange={e => setContestParticipant(e.target.value)} style={s.select}>
                <option value="">Select…</option>
                {allParticipants.map((p, i) => (
                  <option key={i} value="">{p.name} (#{p.foursomeNumber})</option>
                ))}
              </select>
            </div>
            {(contestType === 'ctp') && (
              <>
                <div>
                  <label style={s.label}>Feet</label>
                  <input type="number" value={contestFeet} onChange={e => setContestFeet(e.target.value)} style={{ ...s.input, width: 60 }} min={0} />
                </div>
                <div>
                  <label style={s.label}>Inches</label>
                  <input type="number" value={contestInches} onChange={e => setContestInches(e.target.value)} style={{ ...s.input, width: 60 }} min={0} max={11} />
                </div>
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" id="verified" checked={contestVerified} onChange={e => setContestVerified(e.target.checked)} />
              <label htmlFor="verified" style={{ fontSize: 13, color: '#a3a3a3' }}>Verified</label>
            </div>
            <button
              onClick={handleAddContest}
              disabled={contestSaving}
              style={{ ...s.btn('#22c55e'), opacity: contestSaving ? 0.5 : 1 }}
            >
              {contestSaving ? 'Adding…' : 'Add Entry'}
            </button>
          </div>
        </div>

        {/* Entries by type */}
        {['ctp', 'longest_drive', 'hole_in_one', 'custom'].map(type => {
          const entries = contestEntries.filter(e => e.contest_type === type);
          if (entries.length === 0) return null;
          const typeLabel = type === 'ctp' ? 'Closest to Pin' : type === 'longest_drive' ? 'Longest Drive' : type === 'hole_in_one' ? 'Hole-in-One' : 'Custom';
          return (
            <div key={type} style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: '#a3a3a3' }}>{typeLabel}</h3>
              {entries.map(e => (
                <div key={e.id} style={{ ...s.card, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: 14 }}>{e.label || typeLabel}</span>
                    {e.measurement_feet !== null && (
                      <span style={{ marginLeft: 8, fontSize: 13, color: '#a3a3a3' }}>{e.measurement_feet}′{e.measurement_inches ?? 0}″</span>
                    )}
                    {e.verified && <span style={{ marginLeft: 8, color: '#22c55e', fontSize: 12 }}>✓ Verified</span>}
                    {e.hole_number && <span style={{ marginLeft: 8, fontSize: 12, color: '#737373' }}>Hole {e.hole_number}</span>}
                  </div>
                  <button onClick={() => handleDeleteContest(e.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>Delete</button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Tab: Roster
  // ═══════════════════════════════════════════════════════════════

  function renderRoster() {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#a3a3a3', margin: 0 }}>Participants</h3>
          <button onClick={() => setShowMarshalModal(true)} style={s.btn('#3b82f6')}>
            + Add Marshal
          </button>
        </div>

        {/* Participant list by foursome */}
        {leaderboard.map(entry => (
          <div key={entry.foursome_id} style={{ ...s.card, marginBottom: 8 }}>
            <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: '#a3a3a3' }}>
              Foursome #{entry.foursome_number} — Cart {entry.cart_number}
            </p>
            {entry.players.map((p, pIdx) => (
              <div key={pIdx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: pIdx < entry.players.length - 1 ? '1px solid #1f1f1f' : 'none' }}>
                <span style={{ fontSize: 14 }}>{p.name} <span style={{ color: '#737373', fontSize: 12 }}>({p.handicap})</span></span>
                <button
                  onClick={() => {
                    // We don't have participant_id from leaderboard players - use scorecard to get it
                    // For now, open scorecard to get participant IDs then swap
                    // Workaround: set swap state with name, open scorecard fetch
                    setSwapFoursomeId(entry.foursome_id);
                    setSwapParticipantId(null); // Will be resolved
                    setSwapName('');
                    setSwapEmail('');
                    setSwapHandicap('');
                    // Fetch scorecard to get participant IDs
                    (async () => {
                      const { data } = await supabase.rpc('get_scorecard', {
                        p_tournament_round_id: round.id,
                        p_foursome_id: entry.foursome_id,
                      });
                      const sc = data as ScorecardData;
                      const matched = sc?.players?.find(sp => sp.name === p.name);
                      if (matched) setSwapParticipantId(matched.participant_id);
                    })();
                  }}
                  style={{ fontSize: 12, background: 'none', border: '1px solid #333', color: '#a3a3a3', padding: '4px 10px', borderRadius: 4, cursor: 'pointer' }}
                >
                  Swap
                </button>
              </div>
            ))}
          </div>
        ))}

        {/* Marshal sessions */}
        {marshalSessions.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#a3a3a3', marginBottom: 8 }}>Active Marshals</h3>
            {marshalSessions.map(ms => {
              const marshalUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/marshal/${ms.token}`;
              return (
                <div key={ms.id} style={{ ...s.card, marginBottom: 8 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 4px' }}>{ms.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      readOnly
                      value={marshalUrl}
                      style={{ ...s.input, fontSize: 12, flex: 1 }}
                      onClick={e => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => navigator.clipboard.writeText(marshalUrl)}
                      style={{ ...s.btn('#1a1a1a', '#a3a3a3'), border: '1px solid #333', fontSize: 12 }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Swap Modal
  // ═══════════════════════════════════════════════════════════════

  function renderSwapModal() {
    if (!swapFoursomeId) return null;
    return (
      <>
        <div style={s.overlay} onClick={() => setSwapFoursomeId(null)} />
        <div style={s.modal}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Swap Participant</h3>
          {!swapParticipantId && <p style={{ color: '#737373', fontSize: 13 }}>Loading participant…</p>}
          {swapParticipantId && (
            <>
              <div style={s.formGroup}>
                <label style={s.label}>New Name</label>
                <input value={swapName} onChange={e => setSwapName(e.target.value)} style={s.input} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Email (optional)</label>
                <input value={swapEmail} onChange={e => setSwapEmail(e.target.value)} style={s.input} />
              </div>
              <div style={s.formGroup}>
                <label style={s.label}>Handicap</label>
                <input type="number" value={swapHandicap} onChange={e => setSwapHandicap(e.target.value)} style={{ ...s.input, width: 80 }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={handleSwap}
                  disabled={swapSaving || !swapName.trim()}
                  style={{ ...s.btn('#22c55e'), opacity: swapSaving || !swapName.trim() ? 0.5 : 1 }}
                >
                  {swapSaving ? 'Swapping…' : 'Confirm Swap'}
                </button>
                <button onClick={() => setSwapFoursomeId(null)} style={s.btnOutline}>Cancel</button>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Marshal Modal
  // ═══════════════════════════════════════════════════════════════

  function renderMarshalModal() {
    if (!showMarshalModal) return null;
    return (
      <>
        <div style={s.overlay} onClick={() => setShowMarshalModal(false)} />
        <div style={s.modal}>
          <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Create Marshal Session</h3>
          <div style={s.formGroup}>
            <label style={s.label}>Marshal Name</label>
            <input value={marshalName} onChange={e => setMarshalName(e.target.value)} style={s.input} placeholder="e.g., Bob" />
          </div>
          <div style={s.formGroup}>
            <label style={s.label}>4-Digit PIN</label>
            <input
              value={marshalPin}
              onChange={e => { if (/^\d{0,4}$/.test(e.target.value)) setMarshalPin(e.target.value); }}
              style={{ ...s.input, width: 100, letterSpacing: '0.3em', textAlign: 'center' }}
              placeholder="0000"
              maxLength={4}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreateMarshal}
              disabled={marshalSaving || !marshalName.trim() || marshalPin.length !== 4}
              style={{ ...s.btn('#3b82f6'), opacity: marshalSaving || !marshalName.trim() || marshalPin.length !== 4 ? 0.5 : 1 }}
            >
              {marshalSaving ? 'Creating…' : 'Create'}
            </button>
            <button onClick={() => setShowMarshalModal(false)} style={s.btnOutline}>Cancel</button>
          </div>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // End Tournament Modal
  // ═══════════════════════════════════════════════════════════════

  function renderEndModal() {
    if (!showEndModal) return null;
    return (
      <>
        <div style={s.overlay} onClick={() => setShowEndModal(false)} />
        <div style={s.modal}>
          <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 600 }}>End Tournament</h3>
          <p style={{ color: '#a3a3a3', fontSize: 14, marginBottom: 20 }}>
            This will freeze the final leaderboard and lock all scoring. This action cannot be undone.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleEndTournament}
              disabled={endingTournament}
              style={{ ...s.btn('#ef4444'), opacity: endingTournament ? 0.5 : 1 }}
            >
              {endingTournament ? 'Ending…' : 'End Tournament'}
            </button>
            <button onClick={() => setShowEndModal(false)} style={s.btnOutline}>Cancel</button>
          </div>
        </div>
      </>
    );
  }

  // ═══════════════════════════════════════════════════════════════
  // Page Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <div style={s.page}>
      {/* Google Font */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={s.header}>
        <div style={s.headerLeft}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#fff' }}>Live Tournament</h1>
          <span style={s.badge(statusBadgeColor(round.status))}>{statusLabel(round.status)}</span>
        </div>
        <div style={s.headerRight}>
          {round.status === 'in_progress' && (
            <button onClick={handlePause} style={s.btn('#eab308', '#000')}>Pause</button>
          )}
          {round.status === 'paused' && (
            <button onClick={handleResume} style={s.btn('#22c55e')}>Resume</button>
          )}
          {round.status !== 'completed' && (
            <button onClick={() => setShowEndModal(true)} style={s.btn('#ef4444')}>End Tournament</button>
          )}
          <button
            onClick={() => window.open(`/tournament/${bookingId}/tv`, '_blank')}
            style={s.btnOutline}
          >
            TV Mode ↗
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={s.tabBar}>
        {tabs.map(t => (
          <button key={t.id} style={s.tab(activeTab === t.id)} onClick={() => setActiveTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={s.content}>
        {activeTab === 'leaderboard' && renderLeaderboard()}
        {activeTab === 'course' && renderCourseStatus()}
        {activeTab === 'announcements' && renderAnnouncements()}
        {activeTab === 'contests' && renderContests()}
        {activeTab === 'roster' && renderRoster()}
      </div>

      {/* Slide-outs and Modals */}
      {renderScorecardSlideOut()}
      {renderSwapModal()}
      {renderMarshalModal()}
      {renderEndModal()}
    </div>
  );
}
