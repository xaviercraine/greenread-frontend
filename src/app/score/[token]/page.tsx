'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'next/navigation';
import { createAnonClient } from '@/lib/supabase-tournament';
import { useOfflineQueue } from '@/hooks/useOfflineQueue';
import { usePoll } from '@/hooks/usePoll';

// ─── Types ───────────────────────────────────────────────────────────────────

interface HolePar {
  nine_id: string;
  hole_number: number;
  par: number;
}

interface NineInfo {
  nine_id: string;
  label: string;
  holes: HolePar[];
}

interface Player {
  participant_id: string;
  name: string;
  handicap: number;
  position: number;
}

interface ScoreEntry {
  nine_id: string;
  hole_number: number;
  par: number;
  strokes: number | null;
  version: number;
  attested: boolean;
}

interface SessionData {
  session_token: string;
  tournament_round_id: string;
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  course_name: string;
  starting_hole: number;
  starting_nine_id: string;
  players: Player[];
  nines: NineInfo[];
  hole_pars: HolePar[];
  tournament_status: string;
}

interface LeaderboardEntry {
  position: number;
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  players: { name: string; handicap: number }[];
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
  priority: 'normal' | 'urgent';
  target_type: 'broadcast' | 'foursome';
  target_foursome_id: string | null;
  created_at: string;
}

interface ScorePayload {
  p_session_token: string;
  p_nine_id: string;
  p_hole_number: number;
  p_strokes: number;
  p_expected_version: number;
  p_confirmed: boolean;
}

interface ConflictData {
  nine_id: string;
  hole_number: number;
  local_strokes: number;
  server_strokes: number;
  server_version: number;
  queueItemId: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const STORAGE_KEY_SESSION = 'greenread-scoring-session';
const STORAGE_KEY_QUEUE = 'greenread-scoring-queue';
const SCORE_POLL_MS = 10_000;
const LEADERBOARD_POLL_MS = 30_000;
const ANNOUNCEMENT_POLL_MS = 10_000;
const LONG_PRESS_MS = 3000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function formatVsPar(vsPar: number): string {
  if (vsPar === 0) return 'E';
  return vsPar > 0 ? `+${vsPar}` : `${vsPar}`;
}

function getSavedSession(): { token: string; sessionToken: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_SESSION);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(token: string, sessionToken: string) {
  localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify({ token, sessionToken }));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY_SESSION);
}

// ─── Main Component ──────────────────────────────────────────────────────────

export default function ParticipantScoringPage() {
  const params = useParams();
  const registrationToken = params.token as string;
  const supabase = useMemo(() => createAnonClient(), []);

  // ── Auth / Session State ──
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [participantList, setParticipantList] = useState<Player[] | null>(null);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);

  // ── Scoring State ──
  const [scores, setScores] = useState<Map<string, ScoreEntry>>(new Map());
  const [activeHole, setActiveHole] = useState<{ nine_id: string; hole_number: number; par: number } | null>(null);
  const [expandedNines, setExpandedNines] = useState<Set<string>>(new Set());
  const [tournamentStatus, setTournamentStatus] = useState<string>('not_started');
  const [isAttested, setIsAttested] = useState(false);
  const [plausibilityConfirm, setPlausibilityConfirm] = useState<number | null>(null);

  // ── Conflict State ──
  const [conflict, setConflict] = useState<ConflictData | null>(null);

  // ── Attestation State ──
  const [showReview, setShowReview] = useState(false);
  const [attestProgress, setAttestProgress] = useState(0);
  const [attestResult, setAttestResult] = useState<{ total: number; vs_par: number } | null>(null);
  const attestTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const attestStartRef = useRef<number>(0);

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<'scorecard' | 'leaderboard'>('scorecard');

  // ── Announcements ──
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissedUrgent, setDismissedUrgent] = useState<Set<string>>(new Set());
  const [showAnnouncements, setShowAnnouncements] = useState(false);

  // ── Leaderboard ──
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // ── Online Status ──
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setIsOnline(navigator.onLine);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  // ── Score key helper ──
  const scoreKey = (nineId: string, hole: number) => `${nineId}-${hole}`;

  // ── Create Session ──
  const createSession = useCallback(async (participantId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const rpcParams: Record<string, unknown> = { p_registration_token: registrationToken };
      if (participantId) rpcParams.p_participant_id = participantId;

      const { data, error: rpcErr } = await supabase.rpc('create_scoring_session', rpcParams);
      if (rpcErr) throw rpcErr;

      const res = data as Record<string, unknown>;
      if (!res.success) {
        // If the RPC says "multiple participants" or similar, show participant picker
        if (res.participants && Array.isArray(res.participants)) {
          setParticipantList(res.participants as Player[]);
          setLoading(false);
          return;
        }
        throw new Error((res.error as string) || 'Failed to create scoring session');
      }

      const sessionToken = res.session_token as string;
      const tournamentRoundId = res.tournament_round_id as string;
      const foursomeId = res.foursome_id as string;

      // Build nines from hole_pars
      const holePars = (res.hole_pars || []) as HolePar[];
      const nineMap = new Map<string, HolePar[]>();
      holePars.forEach(hp => {
        if (!nineMap.has(hp.nine_id)) nineMap.set(hp.nine_id, []);
        nineMap.get(hp.nine_id)!.push(hp);
      });
      // Sort holes within each nine
      nineMap.forEach(holes => holes.sort((a, b) => a.hole_number - b.hole_number));

      const nines: NineInfo[] = [];
      let nineIdx = 1;
      nineMap.forEach((holes, nineId) => {
        nines.push({ nine_id: nineId, label: `Nine ${nineIdx}`, holes });
        nineIdx++;
      });

      const sessionData: SessionData = {
        session_token: sessionToken,
        tournament_round_id: tournamentRoundId,
        foursome_id: foursomeId,
        foursome_number: (res.foursome_number as number) || 1,
        cart_number: (res.cart_number as number) || 1,
        course_name: (res.course_name as string) || 'Golf Course',
        starting_hole: (res.starting_hole as number) || 1,
        starting_nine_id: (res.starting_nine_id as string) || nines[0]?.nine_id || '',
        players: (res.players || []) as Player[],
        nines,
        hole_pars: holePars,
        tournament_status: (res.tournament_status as string) || 'not_started',
      };

      setSession(sessionData);
      setTournamentStatus(sessionData.tournament_status);
      saveSession(registrationToken, sessionToken);

      // Auto-expand starting nine
      const startingNine = nines.find(n => n.nine_id === sessionData.starting_nine_id);
      if (startingNine) {
        setExpandedNines(new Set([startingNine.nine_id]));
      } else if (nines.length > 0) {
        setExpandedNines(new Set([nines[0].nine_id]));
      }

      setParticipantList(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Session creation failed';
      setError(msg);
      clearSession();
    } finally {
      setLoading(false);
    }
  }, [registrationToken, supabase]);

  // ── Initial Load ──
  useEffect(() => {
    const saved = getSavedSession();
    if (saved && saved.token === registrationToken && saved.sessionToken) {
      // Try to restore session by fetching scorecard with the saved session token
      // We still need session metadata, so just re-create
      createSession();
    } else {
      createSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrationToken]);

  // ── Fetch Scorecard (polling) ──
  const fetchScorecard = useCallback(async () => {
    if (!session) return null;
    const { data, error: err } = await supabase.rpc('get_scorecard', {
      p_tournament_round_id: session.tournament_round_id,
      p_foursome_id: session.foursome_id,
    });
    if (err) return null;
    const res = data as Record<string, unknown>;
    if (!res.success) return null;

    // Update tournament status
    const status = res.tournament_status as string;
    setTournamentStatus(status);
    setIsAttested(!!(res.attested));

    // Update scores map
    const serverScores = (res.scores || []) as ScoreEntry[];
    const newMap = new Map<string, ScoreEntry>();
    serverScores.forEach(s => {
      newMap.set(scoreKey(s.nine_id, s.hole_number), s);
    });
    setScores(newMap);
    return res;
  }, [session, supabase]);

  usePoll(fetchScorecard, SCORE_POLL_MS, !!session && activeTab === 'scorecard');

  // Initial scorecard fetch
  useEffect(() => {
    if (session) fetchScorecard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── Fetch Leaderboard (polling) ──
  const fetchLeaderboard = useCallback(async () => {
    if (!session) return null;
    const { data, error: err } = await supabase.rpc('get_leaderboard', {
      p_tournament_round_id: session.tournament_round_id,
    });
    if (err) return null;
    const res = data as Record<string, unknown>;
    if (res.success && res.leaderboard) {
      setLeaderboard(res.leaderboard as LeaderboardEntry[]);
    }
    return res;
  }, [session, supabase]);

  usePoll(fetchLeaderboard, LEADERBOARD_POLL_MS, !!session && activeTab === 'leaderboard');

  useEffect(() => {
    if (session && activeTab === 'leaderboard') fetchLeaderboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, session]);

  // ── Fetch Announcements (polling) ──
  const fetchAnnouncements = useCallback(async () => {
    if (!session) return null;
    const { data, error: err } = await supabase
      .from('announcements')
      .select('*')
      .eq('tournament_round_id', session.tournament_round_id)
      .or(`target_type.eq.broadcast,target_foursome_id.eq.${session.foursome_id}`)
      .order('created_at', { ascending: false });
    if (err) return null;
    setAnnouncements((data || []) as Announcement[]);
    return data;
  }, [session, supabase]);

  usePoll(fetchAnnouncements, ANNOUNCEMENT_POLL_MS, !!session);

  useEffect(() => {
    if (session) fetchAnnouncements();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  // ── Offline Queue ──
  const submitScoreToServer = useCallback(async (payload: ScorePayload) => {
    const { data, error: err } = await supabase.rpc('submit_score', payload);
    if (err) throw err;
    const res = data as Record<string, unknown>;
    if (!res.success) {
      if (res.conflict) return { conflict: true, ...res };
      if (res.warning && !payload.p_confirmed) return { warning: true, ...res };
      throw new Error((res.error as string) || 'Score submission failed');
    }
    return res;
  }, [supabase]);

  const { enqueue, removeFromQueue, resumeQueue, pendingCount, status: queueStatus } = useOfflineQueue<ScorePayload>({
    storageKey: STORAGE_KEY_QUEUE,
    submitFn: submitScoreToServer,
    onConflict: (item, response) => {
      const res = response as Record<string, unknown>;
      setConflict({
        nine_id: item.payload.p_nine_id,
        hole_number: item.payload.p_hole_number,
        local_strokes: item.payload.p_strokes,
        server_strokes: (res.server_strokes as number) || 0,
        server_version: (res.server_version as number) || 1,
        queueItemId: item.id,
      });
    },
    onSuccess: () => {
      // Refresh scorecard after successful sync
      fetchScorecard();
    },
    onError: (_item, err) => {
      console.error('Score sync error:', err);
    },
  });

  // ── Score Submission Handler ──
  const handleScoreSubmit = useCallback((nineId: string, holeNumber: number, par: number, strokes: number) => {
    if (!session || isAttested) return;

    // Plausibility check: par - 3 or lower
    if (strokes <= par - 3 && plausibilityConfirm !== strokes) {
      setPlausibilityConfirm(strokes);
      return; // Wait for second tap
    }

    setPlausibilityConfirm(null);

    const existing = scores.get(scoreKey(nineId, holeNumber));
    const expectedVersion = existing?.version || 0;

    // Optimistic update
    const newScores = new Map(scores);
    newScores.set(scoreKey(nineId, holeNumber), {
      nine_id: nineId,
      hole_number: holeNumber,
      par,
      strokes,
      version: expectedVersion + 1,
      attested: false,
    });
    setScores(newScores);

    // Enqueue
    enqueue({
      p_session_token: session.session_token,
      p_nine_id: nineId,
      p_hole_number: holeNumber,
      p_strokes: strokes,
      p_expected_version: expectedVersion,
      p_confirmed: plausibilityConfirm === strokes, // confirmed on second tap
    });

    setActiveHole(null);
  }, [session, isAttested, scores, plausibilityConfirm, enqueue]);

  // ── Conflict Resolution ──
  const resolveConflict = useCallback((keepLocal: boolean) => {
    if (!conflict || !session) return;

    if (keepLocal) {
      // Re-submit with confirmed + server version
      removeFromQueue(conflict.queueItemId);
      enqueue({
        p_session_token: session.session_token,
        p_nine_id: conflict.nine_id,
        p_hole_number: conflict.hole_number,
        p_strokes: conflict.local_strokes,
        p_expected_version: conflict.server_version,
        p_confirmed: true,
      });
    } else {
      // Accept server value — just remove the queued item, server already has its value
      removeFromQueue(conflict.queueItemId);
      // Update local scores with server value
      const newScores = new Map(scores);
      const key = scoreKey(conflict.nine_id, conflict.hole_number);
      const existing = newScores.get(key);
      if (existing) {
        newScores.set(key, { ...existing, strokes: conflict.server_strokes, version: conflict.server_version });
        setScores(newScores);
      }
    }

    setConflict(null);
    resumeQueue();
  }, [conflict, session, scores, removeFromQueue, enqueue, resumeQueue]);

  // ── Attestation ──
  const allHolesScored = useMemo(() => {
    if (!session) return false;
    for (const nine of session.nines) {
      for (const hole of nine.holes) {
        const entry = scores.get(scoreKey(nine.nine_id, hole.hole_number));
        if (!entry || entry.strokes === null) return false;
      }
    }
    return true;
  }, [session, scores]);

  const grossTotal = useMemo(() => {
    let total = 0;
    scores.forEach(s => { if (s.strokes !== null) total += s.strokes; });
    return total;
  }, [scores]);

  const totalPar = useMemo(() => {
    if (!session) return 0;
    let total = 0;
    session.nines.forEach(n => n.holes.forEach(h => { total += h.par; }));
    return total;
  }, [session]);

  const handleAttestStart = useCallback(() => {
    attestStartRef.current = Date.now();
    setAttestProgress(0);
    attestTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - attestStartRef.current;
      const progress = Math.min(elapsed / LONG_PRESS_MS, 1);
      setAttestProgress(progress);
      if (progress >= 1) {
        if (attestTimerRef.current) clearInterval(attestTimerRef.current);
        // Fire attestation
        (async () => {
          if (!session) return;
          const { data, error: err } = await supabase.rpc('attest_scorecard', {
            p_session_token: session.session_token,
          });
          if (err) {
            setError('Attestation failed: ' + err.message);
            return;
          }
          const res = data as Record<string, unknown>;
          if (res.success) {
            setIsAttested(true);
            setShowReview(false);
            setAttestResult({
              total: (res.total_strokes as number) || grossTotal,
              vs_par: (res.vs_par as number) || (grossTotal - totalPar),
            });
          } else {
            setError((res.error as string) || 'Attestation failed');
          }
        })();
      }
    }, 30);
  }, [session, supabase, grossTotal, totalPar]);

  const handleAttestEnd = useCallback(() => {
    if (attestTimerRef.current) clearInterval(attestTimerRef.current);
    if (attestProgress < 1) setAttestProgress(0);
  }, [attestProgress]);

  // Cleanup
  useEffect(() => {
    return () => { if (attestTimerRef.current) clearInterval(attestTimerRef.current); };
  }, []);

  // ── Nine Expand/Collapse ──
  const toggleNine = (nineId: string) => {
    setExpandedNines(prev => {
      const next = new Set(prev);
      if (next.has(nineId)) next.delete(nineId);
      else next.add(nineId);
      return next;
    });
  };

  // ── Computed: nine totals ──
  const getNineTotal = (nine: NineInfo): { scored: number; total: number; strokes: number } => {
    let scored = 0;
    let strokes = 0;
    for (const h of nine.holes) {
      const entry = scores.get(scoreKey(nine.nine_id, h.hole_number));
      if (entry?.strokes !== null && entry?.strokes !== undefined) {
        scored++;
        strokes += entry.strokes;
      }
    }
    return { scored, total: nine.holes.length, strokes };
  };

  // ── Urgent announcements (not dismissed) ──
  const urgentAnnouncements = announcements.filter(
    a => a.priority === 'urgent' && !dismissedUrgent.has(a.id)
  );
  const normalAnnouncements = announcements.filter(a => a.priority === 'normal');
  const foursomeAnnouncements = announcements.filter(
    a => a.target_type === 'foursome' && a.target_foursome_id === session?.foursome_id
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center">
          <div className="w-8 h-8 border-3 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 text-lg">Loading scoring session…</p>
        </div>
      </div>
    );
  }

  // ── Participant Picker ──
  if (participantList) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950 p-4">
        <div className="max-w-md mx-auto pt-12">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Who are you?</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Select your name to start scoring.</p>
          <div className="space-y-3">
            {participantList.map(p => (
              <button
                key={p.participant_id}
                onClick={() => {
                  setSelectedParticipantId(p.participant_id);
                  createSession(p.participant_id);
                }}
                className={cn(
                  'w-full p-4 rounded-xl text-left text-lg font-medium transition-all',
                  'bg-white dark:bg-gray-800 border-2',
                  selectedParticipantId === p.participant_id
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-gray-700 active:border-green-400'
                )}
                style={{ minHeight: 56 }}
              >
                <span className="text-gray-900 dark:text-white">{p.name}</span>
                {p.handicap > 0 && (
                  <span className="text-gray-400 dark:text-gray-500 ml-2 text-base">Hdcp {p.handicap}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error ──
  if (error && !session) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Couldn&apos;t Start Scoring</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{error}</p>
          <button
            onClick={() => createSession()}
            className="px-6 py-3 bg-green-600 text-white rounded-xl font-medium text-lg active:bg-green-700"
            style={{ minHeight: 48 }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!session) return null;

  // ── Tournament Not Started ──
  if (tournamentStatus === 'not_started') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⛳</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Tournament Hasn&apos;t Started Yet</h1>
          <p className="text-gray-500 dark:text-gray-400">Check back when your GM starts the round.</p>
        </div>
      </div>
    );
  }

  // ── Tournament Paused ──
  if (tournamentStatus === 'paused') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-yellow-50 dark:bg-yellow-950/30 p-4">
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-4">⏸️</div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Tournament Paused</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-4">Scoring will resume when the GM lifts the pause.</p>
          {urgentAnnouncements.length > 0 && (
            <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded-xl p-4 text-left">
              {urgentAnnouncements.map(a => (
                <p key={a.id} className="text-red-800 dark:text-red-200 font-medium">{a.message}</p>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Tournament Completed (read-only) ──
  const isCompleted = tournamentStatus === 'completed';

  // ── Attestation Success Screen ──
  if (attestResult && !showReview) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950">
        {/* Header */}
        <header className="bg-green-600 text-white px-4 py-4 pb-5">
          <p className="text-green-200 text-sm">{session.course_name}</p>
          <h1 className="text-xl font-bold">Scorecard Submitted! ✓</h1>
        </header>
        <div className="p-4 max-w-md mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 text-center shadow-sm mt-4">
            <div className="text-5xl mb-3">🏌️</div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {attestResult.total} ({formatVsPar(attestResult.vs_par)})
            </p>
            <p className="text-gray-500 dark:text-gray-400">Team gross score</p>
          </div>
          {/* Show tabs to view read-only scorecard or leaderboard */}
          <div className="mt-6">
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setAttestResult(null); setActiveTab('scorecard'); }}
                className="flex-1 py-3 rounded-xl font-medium text-base bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                style={{ minHeight: 48 }}
              >
                View Scorecard
              </button>
              <button
                onClick={() => { setAttestResult(null); setActiveTab('leaderboard'); }}
                className="flex-1 py-3 rounded-xl font-medium text-base bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700"
                style={{ minHeight: 48 }}
              >
                View Leaderboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Scorecard Review Screen ──
  if (showReview) {
    return (
      <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950">
        <header className="bg-gray-900 dark:bg-gray-800 text-white px-4 py-4 flex items-center gap-3">
          <button
            onClick={() => { setShowReview(false); setAttestProgress(0); }}
            className="text-2xl leading-none"
            style={{ minWidth: 48, minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ←
          </button>
          <div>
            <h1 className="text-lg font-bold">Review Scorecard</h1>
            <p className="text-gray-400 text-sm">Cart #{session.cart_number} · Foursome #{session.foursome_number}</p>
          </div>
        </header>

        <div className="p-4 max-w-md mx-auto">
          {/* Players */}
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4 shadow-sm">
            <p className="text-xs uppercase text-gray-400 dark:text-gray-500 font-semibold mb-2">Team</p>
            <p className="text-gray-900 dark:text-white font-medium">{session.players.map(p => p.name).join(', ')}</p>
          </div>

          {/* Per-nine review */}
          {session.nines.map(nine => {
            const nineTotal = getNineTotal(nine);
            const ninePar = nine.holes.reduce((s, h) => s + h.par, 0);
            return (
              <div key={nine.nine_id} className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-4 shadow-sm">
                <div className="flex justify-between items-center mb-3">
                  <p className="font-semibold text-gray-900 dark:text-white">{nine.label}</p>
                  <p className="font-bold text-lg text-gray-900 dark:text-white">
                    {nineTotal.strokes}{' '}
                    <span className="text-sm font-normal text-gray-400">
                      ({formatVsPar(nineTotal.strokes - ninePar)})
                    </span>
                  </p>
                </div>
                <div className="grid grid-cols-9 gap-1 text-center text-xs">
                  {nine.holes.map(h => (
                    <div key={h.hole_number}>
                      <div className="text-gray-400 dark:text-gray-500">{h.hole_number}</div>
                      <div className="text-gray-400 dark:text-gray-500">{h.par}</div>
                      <div className={cn(
                        'font-bold text-sm mt-0.5',
                        (() => {
                          const s = scores.get(scoreKey(nine.nine_id, h.hole_number));
                          if (!s?.strokes) return 'text-gray-300';
                          if (s.strokes < h.par) return 'text-red-500';
                          if (s.strokes === h.par) return 'text-gray-900 dark:text-white';
                          return 'text-blue-600 dark:text-blue-400';
                        })()
                      )}>
                        {scores.get(scoreKey(nine.nine_id, h.hole_number))?.strokes ?? '–'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* Grand Total */}
          <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-green-700 dark:text-green-400 uppercase font-semibold mb-1">Gross Total</p>
            <p className="text-3xl font-bold text-green-800 dark:text-green-200">
              {grossTotal}{' '}
              <span className="text-xl">({formatVsPar(grossTotal - totalPar)})</span>
            </p>
          </div>

          {/* Long-press attestation button */}
          <div className="relative">
            <button
              onMouseDown={handleAttestStart}
              onMouseUp={handleAttestEnd}
              onMouseLeave={handleAttestEnd}
              onTouchStart={handleAttestStart}
              onTouchEnd={handleAttestEnd}
              onTouchCancel={handleAttestEnd}
              className="w-full py-5 rounded-xl font-bold text-lg text-white bg-red-600 active:bg-red-700 relative overflow-hidden"
              style={{ minHeight: 64 }}
            >
              {/* Progress overlay */}
              <div
                className="absolute inset-0 bg-red-800 transition-none"
                style={{ width: `${attestProgress * 100}%` }}
              />
              <span className="relative z-10">
                {attestProgress > 0 && attestProgress < 1
                  ? 'Hold to Lock…'
                  : 'Lock Scorecard — This Cannot Be Undone'}
              </span>
            </button>
            <p className="text-center text-xs text-gray-400 dark:text-gray-500 mt-2">
              Press and hold for 3 seconds to submit
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Main Scoring Interface ──
  return (
    <div className="min-h-[100dvh] bg-gray-50 dark:bg-gray-950 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

      {/* ── Urgent Announcement Banner ── */}
      {urgentAnnouncements.map(a => (
        <div key={a.id} className="bg-red-600 text-white px-4 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">🚨</span>
          <p className="flex-1 font-medium text-sm">{a.message}</p>
          <button
            onClick={() => setDismissedUrgent(prev => new Set(prev).add(a.id))}
            className="text-red-200 text-xl leading-none shrink-0"
            style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            ✕
          </button>
        </div>
      ))}

      {/* ── Header ── */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">{session.course_name}</p>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Cart #{session.cart_number} · Group #{session.foursome_number}
            </h1>
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            {isOnline ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500" />
                <span className="text-green-600 dark:text-green-400">
                  {queueStatus === 'pending' ? `Syncing ${pendingCount}…` : 'Connected'}
                </span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-yellow-500" />
                <span className="text-yellow-600 dark:text-yellow-400">
                  Offline{pendingCount > 0 ? ` · ${pendingCount} saved` : ''}
                </span>
              </>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {session.players.map(p => p.name).join(', ')}
        </p>
        {isCompleted && (
          <div className="mt-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-xs font-semibold px-3 py-1.5 rounded-lg inline-block">
            Tournament Completed — Final Scores
          </div>
        )}
        {isAttested && !isCompleted && (
          <div className="mt-2 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 text-xs font-semibold px-3 py-1.5 rounded-lg inline-block">
            Scorecard Submitted ✓
          </div>
        )}
      </header>

      {/* ── Tab Bar ── */}
      <div className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 flex gap-1">
        {(['scorecard', 'leaderboard'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 py-3 text-sm font-semibold text-center border-b-2 transition-colors',
              activeTab === tab
                ? 'border-green-600 text-green-700 dark:text-green-400'
                : 'border-transparent text-gray-400 dark:text-gray-500'
            )}
            style={{ minHeight: 48 }}
          >
            {tab === 'scorecard' ? 'Scorecard' : 'Leaderboard'}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'scorecard' ? (
          <div className="p-4 max-w-lg mx-auto space-y-3">

            {/* ── Announcements (collapsible) ── */}
            {(normalAnnouncements.length > 0 || foursomeAnnouncements.length > 0) && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setShowAnnouncements(!showAnnouncements)}
                  className="w-full px-4 py-3 flex items-center justify-between text-left"
                  style={{ minHeight: 48 }}
                >
                  <span className="font-medium text-gray-900 dark:text-white text-sm">
                    📢 Announcements ({normalAnnouncements.length + foursomeAnnouncements.length})
                  </span>
                  <span className="text-gray-400 text-xs">{showAnnouncements ? '▲' : '▼'}</span>
                </button>
                {showAnnouncements && (
                  <div className="px-4 pb-3 space-y-2">
                    {foursomeAnnouncements.map(a => (
                      <div key={a.id} className="bg-blue-50 dark:bg-blue-900/20 rounded-lg px-3 py-2">
                        <span className="text-xs text-blue-600 dark:text-blue-400 font-semibold">To your group</span>
                        <p className="text-sm text-gray-800 dark:text-gray-200">{a.message}</p>
                      </div>
                    ))}
                    {normalAnnouncements.map(a => (
                      <div key={a.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                        <p className="text-sm text-gray-700 dark:text-gray-300">{a.message}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{new Date(a.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Nine Sections ── */}
            {session.nines.map(nine => {
              const expanded = expandedNines.has(nine.nine_id);
              const nineTotal = getNineTotal(nine);
              const ninePar = nine.holes.reduce((s, h) => s + h.par, 0);
              return (
                <div key={nine.nine_id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden">
                  {/* Nine header — always visible */}
                  <button
                    onClick={() => toggleNine(nine.nine_id)}
                    className="w-full px-4 py-3 flex items-center justify-between text-left"
                    style={{ minHeight: 48 }}
                  >
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-white">{nine.label}</span>
                      <span className="text-gray-400 dark:text-gray-500 text-xs ml-2">Par {ninePar}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {nineTotal.scored > 0 && (
                        <span className="text-sm font-bold text-gray-900 dark:text-white">
                          {nineTotal.strokes}
                          <span className="text-xs font-normal text-gray-400 ml-1">
                            ({nineTotal.scored}/{nineTotal.total})
                          </span>
                        </span>
                      )}
                      <span className="text-gray-400 text-xs">{expanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {/* Hole grid */}
                  {expanded && (
                    <div className="px-3 pb-3">
                      {/* Header row */}
                      <div className="grid grid-cols-10 gap-1 mb-1 text-center">
                        {nine.holes.map(h => (
                          <div key={h.hole_number} className="text-xs text-gray-400 dark:text-gray-500 font-medium">
                            {h.hole_number}
                          </div>
                        ))}
                        <div className="text-xs text-gray-400 dark:text-gray-500 font-medium">Tot</div>
                      </div>
                      {/* Par row */}
                      <div className="grid grid-cols-10 gap-1 mb-1 text-center">
                        {nine.holes.map(h => (
                          <div key={h.hole_number} className="text-xs text-gray-400 dark:text-gray-500">
                            {h.par}
                          </div>
                        ))}
                        <div className="text-xs text-gray-400 dark:text-gray-500">{ninePar}</div>
                      </div>
                      {/* Score row */}
                      <div className="grid grid-cols-10 gap-1 text-center">
                        {nine.holes.map(h => {
                          const entry = scores.get(scoreKey(nine.nine_id, h.hole_number));
                          const hasScore = entry?.strokes !== null && entry?.strokes !== undefined;
                          const strokes = entry?.strokes ?? null;
                          const canTap = !isAttested && !isCompleted;
                          return (
                            <button
                              key={h.hole_number}
                              disabled={!canTap}
                              onClick={() => canTap && setActiveHole({ nine_id: nine.nine_id, hole_number: h.hole_number, par: h.par })}
                              className={cn(
                                'rounded-lg py-2 text-base font-bold transition-colors',
                                hasScore
                                  ? strokes! < h.par
                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                                    : strokes === h.par
                                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                      : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                                  : canTap
                                    ? 'bg-gray-100 dark:bg-gray-700 text-gray-300 dark:text-gray-500 active:bg-gray-200'
                                    : 'bg-gray-50 dark:bg-gray-800 text-gray-300 dark:text-gray-600'
                              )}
                              style={{ minHeight: 48 }}
                            >
                              {hasScore ? strokes : '–'}
                            </button>
                          );
                        })}
                        {/* Total cell */}
                        <div className={cn(
                          'rounded-lg py-2 text-base font-bold flex items-center justify-center',
                          nineTotal.scored === nineTotal.total
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-500'
                        )} style={{ minHeight: 48 }}>
                          {nineTotal.scored > 0 ? nineTotal.strokes : '–'}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Grand Total ── */}
            {scores.size > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-gray-900 dark:text-white">Total</span>
                <div className="text-right">
                  <span className="text-xl font-bold text-gray-900 dark:text-white">{grossTotal}</span>
                  <span className="text-sm text-gray-400 dark:text-gray-500 ml-2">
                    ({formatVsPar(grossTotal - totalPar)})
                  </span>
                </div>
              </div>
            )}

            {/* ── Attest Button ── */}
            {allHolesScored && !isAttested && !isCompleted && (
              <button
                onClick={() => setShowReview(true)}
                className="w-full py-4 rounded-xl bg-green-600 text-white font-bold text-lg active:bg-green-700 shadow-sm"
                style={{ minHeight: 56 }}
              >
                Review &amp; Submit Scorecard
              </button>
            )}
          </div>
        ) : (
          /* ── Leaderboard Tab ── */
          <div className="p-4 max-w-lg mx-auto">
            {leaderboard.length === 0 ? (
              <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                <p className="text-lg">No scores yet</p>
                <p className="text-sm mt-1">Leaderboard will appear as teams submit scores.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {leaderboard.map((entry, i) => {
                  const isMyGroup = entry.foursome_id === session.foursome_id;
                  const posLabel = i > 0 && leaderboard[i - 1].position === entry.position
                    ? '' // same position as previous, don't repeat
                    : `${entry.position}`;
                  const isTied = leaderboard.filter(e => e.position === entry.position).length > 1;
                  return (
                    <div
                      key={entry.foursome_id}
                      className={cn(
                        'rounded-xl px-4 py-3 flex items-center gap-3',
                        isMyGroup
                          ? 'bg-green-50 dark:bg-green-900/20 border-2 border-green-300 dark:border-green-700'
                          : 'bg-white dark:bg-gray-800',
                        entry.status === 'dnf' || entry.status === 'withdrawn'
                          ? 'opacity-50'
                          : ''
                      )}
                    >
                      {/* Position */}
                      <div className="w-8 text-center shrink-0">
                        {entry.position <= 3 && entry.status !== 'dnf' && entry.status !== 'withdrawn' ? (
                          <span className="text-lg">{entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : '🥉'}</span>
                        ) : (
                          <span className="text-sm font-bold text-gray-400">
                            {posLabel}{isTied ? 'T' : ''}
                          </span>
                        )}
                      </div>
                      {/* Team info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {entry.players.map(p => p.name).join(', ')}
                        </p>
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Cart #{entry.cart_number} · Thru {entry.holes_completed}
                          {entry.attested && ' ✓'}
                          {(entry.status === 'dnf' || entry.status === 'withdrawn') && ` · ${entry.status.toUpperCase()}`}
                        </p>
                      </div>
                      {/* Score */}
                      <div className="text-right shrink-0">
                        <p className="text-base font-bold text-gray-900 dark:text-white">{entry.gross_total}</p>
                        <p className={cn(
                          'text-xs font-semibold',
                          entry.vs_par < 0 ? 'text-red-500' : entry.vs_par === 0 ? 'text-gray-400' : 'text-blue-500'
                        )}>
                          {formatVsPar(entry.vs_par)}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Score Entry Bottom Sheet ── */}
      {activeHole && !isAttested && !isCompleted && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => { setActiveHole(null); setPlausibilityConfirm(null); }}
          />
          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl"
            style={{ maxHeight: '60dvh', paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
          >
            <div className="px-4 pt-4 pb-2">
              {/* Handle */}
              <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600 mx-auto mb-4" />
              {/* Title */}
              <div className="text-center mb-4">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                  Hole {activeHole.hole_number} — Par {activeHole.par}
                </h2>
                {plausibilityConfirm !== null && (
                  <p className="text-yellow-600 dark:text-yellow-400 text-sm font-semibold mt-1">
                    Eagle or better — tap again to confirm
                  </p>
                )}
              </div>

              {/* Score buttons: par-3 to par+4, plus "Other" */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {Array.from({ length: 8 }, (_, i) => {
                  const strokes = activeHole.par - 3 + i;
                  if (strokes < 1) return null;
                  const isPlausibilityWarn = strokes <= activeHole.par - 3;
                  const needsConfirm = isPlausibilityWarn && plausibilityConfirm !== strokes;
                  const existing = scores.get(scoreKey(activeHole.nine_id, activeHole.hole_number));
                  const isCurrent = existing?.strokes === strokes;
                  return (
                    <button
                      key={strokes}
                      onClick={() => handleScoreSubmit(activeHole.nine_id, activeHole.hole_number, activeHole.par, strokes)}
                      className={cn(
                        'rounded-xl font-bold text-xl transition-colors',
                        isCurrent
                          ? 'bg-green-600 text-white'
                          : isPlausibilityWarn && plausibilityConfirm === strokes
                            ? 'bg-yellow-400 text-yellow-900 animate-pulse'
                            : needsConfirm
                              ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white active:bg-gray-200 dark:active:bg-gray-600'
                      )}
                      style={{ minHeight: 56 }}
                    >
                      {strokes}
                    </button>
                  );
                }).filter(Boolean)}
              </div>

              {/* Other (9+) row */}
              <div className="grid grid-cols-4 gap-2">
                {[activeHole.par + 5, activeHole.par + 6, activeHole.par + 7, activeHole.par + 8].map(strokes => (
                  <button
                    key={strokes}
                    onClick={() => handleScoreSubmit(activeHole.nine_id, activeHole.hole_number, activeHole.par, strokes)}
                    className={cn(
                      'rounded-xl font-bold text-lg',
                      scores.get(scoreKey(activeHole.nine_id, activeHole.hole_number))?.strokes === strokes
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400 active:bg-gray-100'
                    )}
                    style={{ minHeight: 48 }}
                  >
                    {strokes}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Version Conflict Modal ── */}
      {conflict && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" />
          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-5 max-w-sm mx-auto">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">Score Conflict</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Someone else entered <strong>{conflict.server_strokes}</strong> for Hole {conflict.hole_number}.
              You entered <strong>{conflict.local_strokes}</strong>. Which do you want to keep?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => resolveConflict(true)}
                className="flex-1 py-3 rounded-xl bg-green-600 text-white font-semibold active:bg-green-700"
                style={{ minHeight: 48 }}
              >
                Keep Mine ({conflict.local_strokes})
              </button>
              <button
                onClick={() => resolveConflict(false)}
                className="flex-1 py-3 rounded-xl bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white font-semibold active:bg-gray-300"
                style={{ minHeight: 48 }}
              >
                Use Theirs ({conflict.server_strokes})
              </button>
            </div>
            {pendingCount > 1 && (
              <p className="text-xs text-gray-400 text-center mt-3">{pendingCount - 1} more score{pendingCount > 2 ? 's' : ''} pending</p>
            )}
          </div>
        </>
      )}

      {/* ── Error Toast ── */}
      {error && session && (
        <div className="fixed bottom-4 left-4 right-4 z-30 bg-red-600 text-white rounded-xl px-4 py-3 flex items-center gap-3 shadow-lg max-w-sm mx-auto">
          <p className="flex-1 text-sm">{error}</p>
          <button onClick={() => setError(null)} className="text-red-200 font-bold text-lg" style={{ minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>
      )}
    </div>
  );
}
