'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase-tournament';
import { usePoll } from '@/hooks/usePoll';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';

// ─── Types ───────────────────────────────────────────────────────────────────

interface MarshalSession {
  session_id: string;
  name: string;
  tournament_round_id: string;
  course_id: string;
  booking_id: string;
  marshal_token: string;
}

interface FoursomeCard {
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  starting_hole: number;
  status: string;
  current_hole: number | null;
  current_nine_id: string | null;
  pace_note: string | null;
  finished_at: string | null;
  players: string[];
}

interface NineInfo {
  nine_id: string;
  nine_name: string;
  display_order: number;
}

interface Announcement {
  id: string;
  message: string;
  priority: string;
  created_at: string;
}

interface LeaderboardPlayer {
  name: string;
  handicap: number;
}

interface LeaderboardEntry {
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  players: LeaderboardPlayer[];
}

interface UndoItem {
  label: string;
  queueId: string;
  prevHole: number | null;
  prevNineId: string | null;
  prevStatus: string;
  foursomeId: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_PREFIX = 'greenread_marshal_';
const POLL_INTERVAL = 10000;
const UNDO_TIMEOUT = 5000;

// ─── PIN Entry Screen ────────────────────────────────────────────────────────

function PinEntry({
  onSuccess,
  token,
}: {
  onSuccess: (session: MarshalSession) => void;
  token: string;
}) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = useMemo(() => createAnonClient(), []);

  const handleDigit = (d: string) => {
    if (digits.length < 4) {
      setDigits((prev) => prev + d);
      setError('');
    }
  };

  const handleBackspace = () => {
    setDigits((prev) => prev.slice(0, -1));
    setError('');
  };

  const handleSubmit = async () => {
    if (digits.length !== 4) return;
    setLoading(true);
    setError('');

    try {
      const { data } = await supabase.rpc('validate_marshal_pin', {
        p_token: token,
        p_pin: digits,
      });

      if (data?.valid) {
        const session: MarshalSession = {
          session_id: data.session_id,
          name: data.name,
          tournament_round_id: data.tournament_round_id,
          course_id: data.course_id,
          booking_id: data.booking_id,
          marshal_token: token,
        };
        localStorage.setItem(STORAGE_PREFIX + token, JSON.stringify(session));
        onSuccess(session);
      } else {
        setDigits('');
        setError(data?.error || 'Invalid PIN');
      }
    } catch {
      setDigits('');
      setError('Connection error. Try again.');
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit when 4 digits entered
  useEffect(() => {
    if (digits.length === 4) {
      handleSubmit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [digits]);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#000',
        color: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: 500,
      }}
    >
      <h1 style={{ fontSize: '28px', marginBottom: '8px', fontWeight: 700 }}>
        Marshal Sign In
      </h1>
      <p style={{ fontSize: '18px', color: '#aaa', marginBottom: '32px' }}>
        Enter your 4-digit PIN
      </p>

      {/* PIN dots */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: i < digits.length ? '#fff' : 'transparent',
              border: '2px solid #fff',
            }}
          />
        ))}
      </div>

      {error && (
        <p
          style={{
            color: '#ff6b6b',
            fontSize: '18px',
            marginBottom: '16px',
            fontWeight: 600,
          }}
        >
          {error}
        </p>
      )}

      {/* Number pad */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '12px',
          maxWidth: '300px',
          width: '100%',
        }}
      >
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map(
          (key) => {
            if (key === '') return <div key="empty" />;
            return (
              <button
                key={key}
                onClick={() =>
                  key === '⌫' ? handleBackspace() : handleDigit(key)
                }
                disabled={loading}
                style={{
                  height: '64px',
                  fontSize: '28px',
                  fontWeight: 600,
                  background: '#222',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  opacity: loading ? 0.5 : 1,
                }}
              >
                {key}
              </button>
            );
          }
        )}
      </div>

      {loading && (
        <p style={{ marginTop: '24px', fontSize: '18px', color: '#aaa' }}>
          Verifying...
        </p>
      )}
    </div>
  );
}

// ─── Stepper Input ───────────────────────────────────────────────────────────

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
      <span style={{ fontSize: '16px', color: '#aaa', fontWeight: 500 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          onClick={() => onChange(Math.max(min, value - 1))}
          style={{
            width: '56px',
            height: '56px',
            fontSize: '28px',
            fontWeight: 700,
            background: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
          }}
        >
          −
        </button>
        <span style={{ fontSize: '32px', fontWeight: 700, minWidth: '48px', textAlign: 'center' }}>
          {value}
        </span>
        <button
          onClick={() => onChange(Math.min(max, value + 1))}
          style={{
            width: '56px',
            height: '56px',
            fontSize: '28px',
            fontWeight: 700,
            background: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '12px',
            cursor: 'pointer',
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

// ─── Main Marshal App ────────────────────────────────────────────────────────

function MarshalApp({ session }: { session: MarshalSession }) {
  const supabase = useMemo(() => createAnonClient(), []);

  // ── State ──
  const [foursomes, setFoursomes] = useState<FoursomeCard[]>([]);
  const [nines, setNines] = useState<NineInfo[]>([]);
  const [selectedFoursome, setSelectedFoursome] = useState<FoursomeCard | null>(null);
  const [showHolePicker, setShowHolePicker] = useState(false);
  const [showCtpEntry, setShowCtpEntry] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [urgentAnnouncement, setUrgentAnnouncement] = useState<Announcement | null>(null);
  const [dismissedUrgentIds, setDismissedUrgentIds] = useState<Set<string>>(new Set());
  const [undoItem, setUndoItem] = useState<UndoItem | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // CTP state
  const [ctpFeet, setCtpFeet] = useState(0);
  const [ctpInches, setCtpInches] = useState(0);
  const [ctpPlayerName, setCtpPlayerName] = useState('');
  const [ctpSubmitting, setCtpSubmitting] = useState(false);
  const [allPlayers, setAllPlayers] = useState<{ name: string; participant_id: string | null }[]>([]);

  // ── Offline queue ──
  const offlineQueue = useOfflineQueue({
    submitFn: async (entry: {
      foursome_id: string;
      status?: string;
      current_hole?: number;
      current_nine_id?: string;
      pace_note?: string;
    }) => {
      const { data } = await supabase.rpc('mark_foursome_status', {
        p_marshal_token: session.marshal_token,
        p_foursome_id: entry.foursome_id,
        p_status: entry.status ?? null,
        p_current_hole: entry.current_hole ?? null,
        p_current_nine_id: entry.current_nine_id ?? null,
        p_pace_note: entry.pace_note ?? null,
      });
      if (data?.error) throw new Error(data.error);
      return data;
    },
    storageKey: STORAGE_PREFIX + 'queue_' + session.tournament_round_id,
  });

  // ── Discover nines from scorecard (booking_nines/nines tables lack anon RLS) ──
  const ninesLoaded = useRef(false);
  useEffect(() => {
    if (ninesLoaded.current) return;
    async function discoverNines() {
      // Get leaderboard first to find a foursome_id
      const { data: lb } = await supabase.rpc('get_leaderboard', {
        p_tournament_round_id: session.tournament_round_id,
      });
      if (!lb?.success || !lb.leaderboard?.length) return;

      const firstFoursomeId = (lb.leaderboard as LeaderboardEntry[])[0].foursome_id;
      const { data: sc } = await supabase.rpc('get_scorecard', {
        p_tournament_round_id: session.tournament_round_id,
        p_foursome_id: firstFoursomeId,
      });
      if (!sc?.success || !sc.scores) return;

      // Extract distinct nine_ids in order of first appearance
      const seen = new Set<string>();
      const orderedNines: NineInfo[] = [];
      for (const score of sc.scores as { nine_id: string }[]) {
        if (!seen.has(score.nine_id)) {
          seen.add(score.nine_id);
          orderedNines.push({
            nine_id: score.nine_id,
            nine_name: `Nine ${orderedNines.length + 1}`,
            display_order: orderedNines.length,
          });
        }
      }
      setNines(orderedNines);
      ninesLoaded.current = true;
    }
    discoverNines();
  }, [supabase, session.tournament_round_id]);

  // ── Fetch all players for CTP dropdown ──
  useEffect(() => {
    async function loadPlayers() {
      const { data } = await supabase.rpc('get_leaderboard', {
        p_tournament_round_id: session.tournament_round_id,
      });
      if (data?.success && data.leaderboard) {
        const players: { name: string; participant_id: string | null }[] = [];
        for (const entry of data.leaderboard as LeaderboardEntry[]) {
          for (const p of entry.players) {
            players.push({ name: p.name, participant_id: null });
          }
        }
        setAllPlayers(players);
      }
    }
    loadPlayers();
  }, [supabase, session.tournament_round_id]);

  // ── Fetch foursomes (leaderboard RPC + foursome_status direct read) ──
  const fetchFoursomes = useCallback(async () => {
    // 1. Get leaderboard (SECURITY DEFINER — works for anon)
    const { data: lb } = await supabase.rpc('get_leaderboard', {
      p_tournament_round_id: session.tournament_round_id,
    });

    // 2. Get foursome_status (anon SELECT verified)
    const { data: statusData } = await supabase
      .from('foursome_status')
      .select('foursome_id, status, current_hole, current_nine_id, pace_note, finished_at')
      .eq('tournament_round_id', session.tournament_round_id);

    if (!lb?.success || !lb.leaderboard || !statusData) return null;

    // 3. Merge by foursome_id
    const statusMap = new Map<string, any>();
    for (const s of statusData) {
      statusMap.set(s.foursome_id, s);
    }

    const cards: FoursomeCard[] = (lb.leaderboard as LeaderboardEntry[]).map((entry) => {
      const st = statusMap.get(entry.foursome_id);
      return {
        foursome_id: entry.foursome_id,
        foursome_number: entry.foursome_number,
        cart_number: entry.cart_number,
        starting_hole: 1,
        status: st?.status ?? 'playing',
        current_hole: st?.current_hole ?? null,
        current_nine_id: st?.current_nine_id ?? null,
        pace_note: st?.pace_note ?? null,
        finished_at: st?.finished_at ?? null,
        players: entry.players.map((p) => p.name),
      };
    });

    cards.sort((a, b) => a.foursome_number - b.foursome_number);
    setFoursomes(cards);

    // Update selected foursome if open
    if (selectedFoursome) {
      const updated = cards.find((c) => c.foursome_id === selectedFoursome.foursome_id);
      if (updated) setSelectedFoursome(updated);
    }

    return cards;
  }, [supabase, session.tournament_round_id, selectedFoursome]);

  // ── Fetch announcements ──
  const fetchAnnouncements = useCallback(async () => {
    const { data } = await supabase
      .from('announcements')
      .select('id, message, priority, created_at')
      .eq('tournament_round_id', session.tournament_round_id)
      .eq('target_type', 'broadcast')
      .order('created_at', { ascending: false })
      .limit(20);

    if (data) {
      setAnnouncements(data);
      // Find newest urgent not yet dismissed
      const urgent = data.find(
        (a: Announcement) => a.priority === 'urgent' && !dismissedUrgentIds.has(a.id)
      );
      setUrgentAnnouncement(urgent ?? null);
    }
    return data;
  }, [supabase, session.tournament_round_id, dismissedUrgentIds]);

  // ── Polling ──
  usePoll(fetchFoursomes, POLL_INTERVAL, true);
  usePoll(fetchAnnouncements, POLL_INTERVAL, true);

  // ── Undo management ──
  const startUndo = (item: UndoItem) => {
    // Clear existing timer
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoItem(item);
    undoTimerRef.current = setTimeout(() => {
      setUndoItem(null);
      undoTimerRef.current = null;
    }, UNDO_TIMEOUT);
  };

  const executeUndo = () => {
    if (!undoItem) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);

    // Remove queued entry
    offlineQueue.removeFromQueue(undoItem.queueId);

    // Revert local state
    setFoursomes((prev) =>
      prev.map((f) =>
        f.foursome_id === undoItem.foursomeId
          ? {
              ...f,
              current_hole: undoItem.prevHole,
              current_nine_id: undoItem.prevNineId,
              status: undoItem.prevStatus,
            }
          : f
      )
    );

    // Update selected foursome if it matches
    if (selectedFoursome?.foursome_id === undoItem.foursomeId) {
      setSelectedFoursome((prev) =>
        prev
          ? {
              ...prev,
              current_hole: undoItem.prevHole,
              current_nine_id: undoItem.prevNineId,
              status: undoItem.prevStatus,
            }
          : null
      );
    }

    setUndoItem(null);
  };

  // ── Helpers ──
  const getNineName = (nineId: string | null): string => {
    if (!nineId) return '';
    const nine = nines.find((n) => n.nine_id === nineId);
    return nine?.nine_name ?? '';
  };

  const getNextNine = (currentNineId: string | null): NineInfo | null => {
    if (!currentNineId || nines.length === 0) return null;
    const currentIdx = nines.findIndex((n) => n.nine_id === currentNineId);
    if (currentIdx === -1 || currentIdx >= nines.length - 1) return null;
    return nines[currentIdx + 1];
  };

  // ── Actions ──
  const handleAdvance = (foursome: FoursomeCard) => {
    const prevHole = foursome.current_hole;
    const prevNineId = foursome.current_nine_id;
    const prevStatus = foursome.status;

    let newHole = (foursome.current_hole ?? 0) + 1;
    let newNineId = foursome.current_nine_id;
    let newStatus: string | undefined;

    if (newHole > 9) {
      const nextNine = getNextNine(foursome.current_nine_id);
      if (nextNine) {
        newHole = 1;
        newNineId = nextNine.nine_id;
      } else {
        // Last nine, last hole → finished
        newHole = 9;
        newStatus = 'finished';
      }
    }

    // Optimistic update
    const update: FoursomeCard = {
      ...foursome,
      current_hole: newHole,
      current_nine_id: newNineId,
      status: newStatus ?? foursome.status,
    };
    setFoursomes((prev) =>
      prev.map((f) => (f.foursome_id === foursome.foursome_id ? update : f))
    );
    setSelectedFoursome(update);

    // Enqueue
    const queueId = offlineQueue.enqueue({
      foursome_id: foursome.foursome_id,
      current_hole: newHole,
      current_nine_id: newNineId,
      ...(newStatus ? { status: newStatus } : {}),
    });

    const nineName = newNineId ? getNineName(newNineId) : '';
    startUndo({
      label: `Cart #${foursome.cart_number} → Hole ${newHole}${nineName ? ` (${nineName})` : ''}`,
      queueId,
      prevHole,
      prevNineId,
      prevStatus,
      foursomeId: foursome.foursome_id,
    });
  };

  const handleSetHole = (foursome: FoursomeCard, hole: number, nineId: string) => {
    const prevHole = foursome.current_hole;
    const prevNineId = foursome.current_nine_id;
    const prevStatus = foursome.status;

    const update: FoursomeCard = {
      ...foursome,
      current_hole: hole,
      current_nine_id: nineId,
    };
    setFoursomes((prev) =>
      prev.map((f) => (f.foursome_id === foursome.foursome_id ? update : f))
    );
    setSelectedFoursome(update);

    const queueId = offlineQueue.enqueue({
      foursome_id: foursome.foursome_id,
      current_hole: hole,
      current_nine_id: nineId,
    });

    startUndo({
      label: `Cart #${foursome.cart_number} → Hole ${hole} (${getNineName(nineId)})`,
      queueId,
      prevHole,
      prevNineId,
      prevStatus,
      foursomeId: foursome.foursome_id,
    });

    setShowHolePicker(false);
  };

  const handleStatus = (foursome: FoursomeCard, status: string) => {
    if (foursome.status === status) return;

    const prevHole = foursome.current_hole;
    const prevNineId = foursome.current_nine_id;
    const prevStatus = foursome.status;

    const update: FoursomeCard = { ...foursome, status };
    setFoursomes((prev) =>
      prev.map((f) => (f.foursome_id === foursome.foursome_id ? update : f))
    );
    setSelectedFoursome(update);

    const queueId = offlineQueue.enqueue({
      foursome_id: foursome.foursome_id,
      status,
    });

    const statusLabels: Record<string, string> = {
      playing: 'On Pace',
      slow: 'Slow',
      needs_gm: 'Needs GM',
    };

    startUndo({
      label: `Cart #${foursome.cart_number} → ${statusLabels[status] ?? status}`,
      queueId,
      prevHole,
      prevNineId,
      prevStatus,
      foursomeId: foursome.foursome_id,
    });
  };

  const handleCtpSubmit = async () => {
    if (!ctpPlayerName || !selectedFoursome) return;
    setCtpSubmitting(true);

    try {
      await supabase.from('contest_entries').insert({
        tournament_round_id: session.tournament_round_id,
        course_id: session.course_id,
        contest_type: 'closest_to_pin',
        contest_label: `CTP Hole ${selectedFoursome.current_hole}`,
        hole_number: selectedFoursome.current_hole,
        nine_id: selectedFoursome.current_nine_id,
        participant_id: null, // Known issue: leaderboard lacks participant_id
        measurement_feet: ctpFeet,
        measurement_inches: ctpInches,
        notes: `Player: ${ctpPlayerName} (entered by marshal ${session.name})`,
      });

      setShowCtpEntry(false);
      setCtpFeet(0);
      setCtpInches(0);
      setCtpPlayerName('');
    } catch {
      // Silent fail — marshal can retry
    } finally {
      setCtpSubmitting(false);
    }
  };

  // ── Status colors ──
  const statusColor = (status: string): string => {
    switch (status) {
      case 'playing': return '#22c55e';
      case 'slow': return '#eab308';
      case 'needs_gm': return '#ef4444';
      case 'finished': return '#6b7280';
      default: return '#6b7280';
    }
  };

  const statusBg = (status: string): string => {
    switch (status) {
      case 'playing': return '#14532d';
      case 'slow': return '#422006';
      case 'needs_gm': return '#450a0a';
      case 'finished': return '#1f2937';
      default: return '#1f2937';
    }
  };

  // ─── Urgent Announcement Overlay ──────────────────────────────────────────

  if (urgentAnnouncement) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#b91c1c',
          color: '#fff',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          zIndex: 9999,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 500,
        }}
      >
        <span style={{ fontSize: '48px', marginBottom: '24px' }}>⚠️</span>
        <h1 style={{ fontSize: '28px', fontWeight: 700, marginBottom: '16px', textAlign: 'center' }}>
          URGENT ANNOUNCEMENT
        </h1>
        <p
          style={{
            fontSize: '22px',
            textAlign: 'center',
            maxWidth: '400px',
            lineHeight: 1.5,
            marginBottom: '40px',
          }}
        >
          {urgentAnnouncement.message}
        </p>
        <button
          onClick={() => {
            setDismissedUrgentIds((prev) => new Set([...prev, urgentAnnouncement.id]));
            setUrgentAnnouncement(null);
          }}
          style={{
            height: '64px',
            padding: '0 48px',
            fontSize: '22px',
            fontWeight: 700,
            background: '#fff',
            color: '#b91c1c',
            border: 'none',
            borderRadius: '16px',
            cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }

  // ─── CTP Entry Overlay ────────────────────────────────────────────────────

  if (showCtpEntry && selectedFoursome) {
    return (
      <div
        style={{
          minHeight: '100dvh',
          background: '#000',
          color: '#fff',
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 500,
        }}
      >
        <button
          onClick={() => setShowCtpEntry(false)}
          style={{
            fontSize: '18px',
            fontWeight: 600,
            background: 'none',
            color: '#aaa',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '24px',
            padding: '8px 0',
          }}
        >
          ← Back
        </button>

        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>
          Contest Entry — Hole {selectedFoursome.current_hole}
        </h2>

        {/* Player selector */}
        <div style={{ marginBottom: '24px' }}>
          <label style={{ fontSize: '16px', color: '#aaa', display: 'block', marginBottom: '8px' }}>
            Player
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {allPlayers.map((p) => (
              <button
                key={p.name}
                onClick={() => setCtpPlayerName(p.name)}
                style={{
                  height: '48px',
                  fontSize: '18px',
                  fontWeight: 600,
                  background: ctpPlayerName === p.name ? '#22c55e' : '#222',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  textAlign: 'left',
                  padding: '0 16px',
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        </div>

        {/* Steppers */}
        <div style={{ display: 'flex', gap: '32px', justifyContent: 'center', marginBottom: '32px' }}>
          <Stepper label="Feet" value={ctpFeet} min={0} max={50} onChange={setCtpFeet} />
          <Stepper label="Inches" value={ctpInches} min={0} max={11} onChange={setCtpInches} />
        </div>

        <div
          style={{
            textAlign: 'center',
            fontSize: '20px',
            color: '#aaa',
            marginBottom: '24px',
          }}
        >
          {ctpFeet}′ {ctpInches}″
        </div>

        <button
          onClick={handleCtpSubmit}
          disabled={!ctpPlayerName || ctpSubmitting}
          style={{
            width: '100%',
            height: '64px',
            fontSize: '22px',
            fontWeight: 700,
            background: ctpPlayerName ? '#22c55e' : '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '16px',
            cursor: ctpPlayerName ? 'pointer' : 'default',
            opacity: ctpSubmitting ? 0.5 : 1,
          }}
        >
          {ctpSubmitting ? 'Submitting...' : 'Submit Entry'}
        </button>
      </div>
    );
  }

  // ─── Hole Picker Overlay ──────────────────────────────────────────────────

  if (showHolePicker && selectedFoursome) {
    const activeNineId = selectedFoursome.current_nine_id ?? nines[0]?.nine_id;

    return (
      <div
        style={{
          minHeight: '100dvh',
          background: '#000',
          color: '#fff',
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 500,
        }}
      >
        <button
          onClick={() => setShowHolePicker(false)}
          style={{
            fontSize: '18px',
            fontWeight: 600,
            background: 'none',
            color: '#aaa',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '24px',
            padding: '8px 0',
          }}
        >
          ← Back
        </button>

        <h2 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '24px' }}>
          Set Hole — Cart #{selectedFoursome.cart_number}
        </h2>

        {/* Nine tabs */}
        {nines.length > 1 && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', flexWrap: 'wrap' }}>
            {nines.map((nine) => (
              <button
                key={nine.nine_id}
                onClick={() => {
                  // Update the selected foursome's nine for the picker display
                  setSelectedFoursome((prev) =>
                    prev ? { ...prev, current_nine_id: nine.nine_id } : null
                  );
                }}
                style={{
                  height: '48px',
                  padding: '0 20px',
                  fontSize: '16px',
                  fontWeight: 600,
                  background: activeNineId === nine.nine_id ? '#22c55e' : '#222',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                }}
              >
                {nine.nine_name}
              </button>
            ))}
          </div>
        )}

        {/* Hole grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
          }}
        >
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((hole) => {
            const isActive =
              selectedFoursome.current_hole === hole &&
              selectedFoursome.current_nine_id === activeNineId;
            return (
              <button
                key={hole}
                onClick={() => handleSetHole(selectedFoursome, hole, activeNineId!)}
                style={{
                  height: '72px',
                  fontSize: '32px',
                  fontWeight: 700,
                  background: isActive ? '#22c55e' : '#222',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                }}
              >
                {hole}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── Foursome Detail View ─────────────────────────────────────────────────

  if (selectedFoursome) {
    const isFinished = selectedFoursome.status === 'finished';
    const nineName = getNineName(selectedFoursome.current_nine_id);

    return (
      <div
        style={{
          minHeight: '100dvh',
          background: '#000',
          color: '#fff',
          padding: '24px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
          fontWeight: 500,
        }}
      >
        {/* Back */}
        <button
          onClick={() => setSelectedFoursome(null)}
          style={{
            fontSize: '18px',
            fontWeight: 600,
            background: 'none',
            color: '#aaa',
            border: 'none',
            cursor: 'pointer',
            marginBottom: '16px',
            padding: '8px 0',
          }}
        >
          ← All Groups
        </button>

        {/* Cart info */}
        <div style={{ marginBottom: '24px' }}>
          <h2 style={{ fontSize: '32px', fontWeight: 700, marginBottom: '4px' }}>
            Cart #{selectedFoursome.cart_number}
          </h2>
          <p style={{ fontSize: '18px', color: '#aaa' }}>
            Foursome {selectedFoursome.foursome_number} ·{' '}
            {selectedFoursome.players.join(', ') || 'No players assigned'}
          </p>
          <p style={{ fontSize: '20px', marginTop: '8px', color: statusColor(selectedFoursome.status) }}>
            Hole {selectedFoursome.current_hole ?? '—'}
            {nineName ? ` · ${nineName}` : ''}
          </p>
        </div>

        {/* Passed button */}
        {!isFinished && (
          <>
            <button
              onClick={() => handleAdvance(selectedFoursome)}
              style={{
                width: '100%',
                height: '72px',
                fontSize: '28px',
                fontWeight: 700,
                background: '#22c55e',
                color: '#fff',
                border: 'none',
                borderRadius: '16px',
                cursor: 'pointer',
                marginBottom: '8px',
              }}
            >
              Passed ✓
            </button>

            <button
              onClick={() => setShowHolePicker(true)}
              style={{
                display: 'block',
                margin: '0 auto 32px',
                fontSize: '16px',
                fontWeight: 500,
                background: 'none',
                color: '#6b9fff',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Set hole...
            </button>

            {/* Status buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '32px' }}>
              {[
                { key: 'playing', label: '✓ On Pace', color: '#22c55e', bg: '#14532d' },
                { key: 'slow', label: '⚠ Slow', color: '#eab308', bg: '#422006' },
                { key: 'needs_gm', label: '🚩 Needs GM', color: '#ef4444', bg: '#450a0a' },
              ].map((btn) => {
                const active = selectedFoursome.status === btn.key;
                return (
                  <button
                    key={btn.key}
                    onClick={() => handleStatus(selectedFoursome, btn.key)}
                    style={{
                      flex: 1,
                      height: '56px',
                      fontSize: '16px',
                      fontWeight: 700,
                      background: active ? btn.color : btn.bg,
                      color: '#fff',
                      border: active ? '3px solid #fff' : '2px solid transparent',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {isFinished && (
          <div
            style={{
              textAlign: 'center',
              padding: '32px 0',
              fontSize: '22px',
              color: '#6b7280',
              fontWeight: 600,
            }}
          >
            ✓ Finished
          </div>
        )}

        {/* CTP button */}
        <button
          onClick={() => setShowCtpEntry(true)}
          style={{
            width: '100%',
            height: '56px',
            fontSize: '18px',
            fontWeight: 600,
            background: '#1e293b',
            color: '#fff',
            border: '2px solid #334155',
            borderRadius: '12px',
            cursor: 'pointer',
          }}
        >
          📏 Add Contest Entry
        </button>

        {/* Undo toast */}
        {undoItem && undoItem.foursomeId === selectedFoursome.foursome_id && (
          <div
            style={{
              position: 'fixed',
              bottom: '32px',
              left: '16px',
              right: '16px',
              background: '#1e293b',
              color: '#fff',
              borderRadius: '12px',
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '16px',
              fontWeight: 600,
              zIndex: 100,
            }}
          >
            <span>{undoItem.label}</span>
            <button
              onClick={executeUndo}
              style={{
                fontSize: '16px',
                fontWeight: 700,
                background: 'none',
                color: '#6b9fff',
                border: 'none',
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              Undo
            </button>
          </div>
        )}
      </div>
    );
  }

  // ─── Foursome Grid (Main View) ────────────────────────────────────────────

  const normalAnnouncements = announcements.filter((a) => a.priority !== 'urgent').slice(0, 3);

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#000',
        color: '#fff',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        fontWeight: 500,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 20px',
          borderBottom: '1px solid #222',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0 }}>
            Marshal — {session.name}
          </h1>
        </div>
        <div
          style={{
            fontSize: '14px',
            fontWeight: 600,
            color: offlineQueue.pendingCount > 0 ? '#eab308' : '#22c55e',
          }}
        >
          {offlineQueue.pendingCount > 0
            ? `⏳ ${offlineQueue.pendingCount} pending`
            : '✓ Synced'}
        </div>
      </div>

      {/* Normal announcements banner */}
      {normalAnnouncements.length > 0 && (
        <div style={{ padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155' }}>
          <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600, marginBottom: '4px' }}>
            📢 Announcements
          </div>
          {normalAnnouncements.map((a) => (
            <p key={a.id} style={{ fontSize: '16px', margin: '4px 0', lineHeight: 1.4 }}>
              {a.message}
            </p>
          ))}
        </div>
      )}

      {/* Foursome cards */}
      <div style={{ padding: '16px' }}>
        {foursomes.length === 0 && (
          <p style={{ textAlign: 'center', fontSize: '18px', color: '#6b7280', marginTop: '48px' }}>
            Loading groups...
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {foursomes.map((f) => (
            <button
              key={f.foursome_id}
              onClick={() => setSelectedFoursome(f)}
              style={{
                width: '100%',
                padding: '20px',
                background: statusBg(f.status),
                border: `2px solid ${statusColor(f.status)}`,
                borderRadius: '16px',
                color: '#fff',
                cursor: 'pointer',
                textAlign: 'left',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '28px', fontWeight: 700 }}>
                  Cart #{f.cart_number}
                </div>
                <div style={{ fontSize: '18px', color: '#ccc', marginTop: '4px' }}>
                  Hole {f.current_hole ?? '—'}
                  {f.current_nine_id ? ` · ${getNineName(f.current_nine_id)}` : ''}
                </div>
              </div>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: statusColor(f.status),
                  textTransform: 'uppercase',
                }}
              >
                {f.status === 'playing' && '✓ ON PACE'}
                {f.status === 'slow' && '⚠ SLOW'}
                {f.status === 'needs_gm' && '🚩 NEEDS GM'}
                {f.status === 'finished' && '✓ FINISHED'}
                {!['playing', 'slow', 'needs_gm', 'finished'].includes(f.status) &&
                  f.status.toUpperCase()}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Undo toast (grid view) */}
      {undoItem && !selectedFoursome && (
        <div
          style={{
            position: 'fixed',
            bottom: '32px',
            left: '16px',
            right: '16px',
            background: '#1e293b',
            color: '#fff',
            borderRadius: '12px',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '16px',
            fontWeight: 600,
            zIndex: 100,
          }}
        >
          <span>{undoItem.label}</span>
          <button
            onClick={executeUndo}
            style={{
              fontSize: '16px',
              fontWeight: 700,
              background: 'none',
              color: '#6b9fff',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Page Component ──────────────────────────────────────────────────────────

export default function MarshalPage() {
  const params = useParams();
  const token = params.token as string;
  const [session, setSession] = useState<MarshalSession | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_PREFIX + token);
    if (stored) {
      try {
        setSession(JSON.parse(stored));
      } catch {
        // Corrupted — clear and show PIN
        localStorage.removeItem(STORAGE_PREFIX + token);
      }
    }
    setChecked(true);
  }, [token]);

  if (!checked) return null;

  if (!session) {
    return <PinEntry token={token} onSuccess={setSession} />;
  }

  return <MarshalApp session={session} />;
}
