// src/lib/tournament-api.ts
// Typed RPC wrappers for Live Tournament Tracker (T2–T4).
// Response types match actual deployed RPC output — do not change without re-querying.

import { SupabaseClient } from "@supabase/supabase-js";

// ══════════════════════════════════════════════════════════
// Response Types (from actual RPC output)
// ══════════════════════════════════════════════════════════

export interface LeaderboardPlayer {
  name: string;
  handicap: number;
}

export interface LeaderboardEntry {
  position: number;
  foursome_id: string;
  foursome_number: number;
  cart_number: number;
  players: LeaderboardPlayer[];
  holes_completed: number;
  gross_total: number;
  net_total: number;
  vs_par: number;
  status: string;
  attested: boolean;
  finished_at: string | null;
}

export interface LeaderboardResponse {
  success: boolean;
  leaderboard: LeaderboardEntry[];
}

export interface ScorecardScore {
  nine_id: string;
  hole_number: number;
  par: number;
  strokes: number;
  version: number;
  attested: boolean;
}

export interface ScorecardPlayer {
  participant_id: string;
  name: string;
  handicap: number;
  position: number;
}

export interface ScorecardResponse {
  success: boolean;
  attested: boolean;
  tournament_status: string;
  scores: ScorecardScore[];
  players: ScorecardPlayer[];
}

export interface KitchenTimingResponse {
  success: boolean;
  groups_total: number;
  groups_playing: number;
  groups_finished: number;
  elapsed_minutes: number;
  last_group_cart: number;
  last_group_current_hole: number;
  estimated_last_group_finish: string;
  recommended_kitchen_fire_time: string;
}

export interface ValidateMarshalPinResponse {
  valid: boolean;
  error?: string;
  session_id?: string;
  name?: string;
  tournament_round_id?: string;
  course_id?: string;
  booking_id?: string;
}

// ══════════════════════════════════════════════════════════
// GM RPCs (called with authed client)
// ══════════════════════════════════════════════════════════

export async function startTournament(
  client: SupabaseClient,
  bookingId: string,
  courseId: string
) {
  const { data, error } = await client.rpc("start_tournament", {
    p_booking_id: bookingId,
    p_course_id: courseId,
  });
  if (error) throw error;
  return data;
}

export async function pauseTournament(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string
) {
  const { data, error } = await client.rpc("pause_tournament", {
    p_tournament_round_id: tournamentRoundId,
    p_course_id: courseId,
  });
  if (error) throw error;
  return data;
}

export async function resumeTournament(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string
) {
  const { data, error } = await client.rpc("resume_tournament", {
    p_tournament_round_id: tournamentRoundId,
    p_course_id: courseId,
  });
  if (error) throw error;
  return data;
}

export async function completeTournament(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string
) {
  const { data, error } = await client.rpc("complete_tournament", {
    p_tournament_round_id: tournamentRoundId,
    p_course_id: courseId,
  });
  if (error) throw error;
  return data;
}

export async function getLeaderboard(
  client: SupabaseClient,
  tournamentRoundId: string
): Promise<LeaderboardResponse> {
  const { data, error } = await client.rpc("get_leaderboard", {
    p_tournament_round_id: tournamentRoundId,
  });
  if (error) throw error;
  return data as LeaderboardResponse;
}

export async function getScorecard(
  client: SupabaseClient,
  tournamentRoundId: string,
  foursomeId: string
): Promise<ScorecardResponse> {
  const { data, error } = await client.rpc("get_scorecard", {
    p_tournament_round_id: tournamentRoundId,
    p_foursome_id: foursomeId,
  });
  if (error) throw error;
  return data as ScorecardResponse;
}

export async function getKitchenTiming(
  client: SupabaseClient,
  tournamentRoundId: string
): Promise<KitchenTimingResponse> {
  const { data, error } = await client.rpc("get_kitchen_timing", {
    p_tournament_round_id: tournamentRoundId,
  });
  if (error) throw error;
  return data as KitchenTimingResponse;
}

export async function gmEditScore(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string,
  foursomeId: string,
  nineId: string,
  holeNumber: number,
  strokes: number,
  reason: string
) {
  const { data, error } = await client.rpc("gm_edit_score", {
    p_tournament_round_id: tournamentRoundId,
    p_course_id: courseId,
    p_foursome_id: foursomeId,
    p_nine_id: nineId,
    p_hole_number: holeNumber,
    p_strokes: strokes,
    p_reason: reason,
  });
  if (error) throw error;
  return data;
}

export async function gmUnattestScorecard(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string,
  foursomeId: string
) {
  const { data, error } = await client.rpc("gm_unattest_scorecard", {
    p_tournament_round_id: tournamentRoundId,
    p_course_id: courseId,
    p_foursome_id: foursomeId,
  });
  if (error) throw error;
  return data;
}

export async function swapParticipant(
  client: SupabaseClient,
  bookingId: string,
  courseId: string,
  oldParticipantId: string,
  newName: string,
  newEmail: string | null,
  newHandicap: number | null
) {
  const { data, error } = await client.rpc("swap_participant", {
    p_booking_id: bookingId,
    p_course_id: courseId,
    p_old_participant_id: oldParticipantId,
    p_new_name: newName,
    p_new_email: newEmail,
    p_new_handicap: newHandicap,
  });
  if (error) throw error;
  return data;
}

export async function createMarshalSession(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string,
  name: string,
  pin: string
) {
  const { data, error } = await client.rpc("create_marshal_session", {
    p_tournament_round_id: tournamentRoundId,
    p_course_id: courseId,
    p_name: name,
    p_pin: pin,
  });
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════
// Participant RPCs (called with anon client, token-based auth)
// ══════════════════════════════════════════════════════════

export async function createScoringSession(
  client: SupabaseClient,
  registrationToken: string,
  participantId: string | null
) {
  const { data, error } = await client.rpc("create_scoring_session", {
    p_registration_token: registrationToken,
    p_participant_id: participantId,
  });
  if (error) throw error;
  return data;
}

export async function submitScore(
  client: SupabaseClient,
  sessionToken: string,
  nineId: string,
  holeNumber: number,
  strokes: number,
  expectedVersion: number | null,
  confirmed: boolean
) {
  const { data, error } = await client.rpc("submit_score", {
    p_session_token: sessionToken,
    p_nine_id: nineId,
    p_hole_number: holeNumber,
    p_strokes: strokes,
    p_expected_version: expectedVersion,
    p_confirmed: confirmed,
  });
  if (error) throw error;
  return data;
}

export async function attestScorecard(
  client: SupabaseClient,
  sessionToken: string
) {
  const { data, error } = await client.rpc("attest_scorecard", {
    p_session_token: sessionToken,
  });
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════
// Marshal RPCs (called with anon client, token-based auth)
// ══════════════════════════════════════════════════════════

export async function validateMarshalPin(
  client: SupabaseClient,
  token: string,
  pin: string
): Promise<ValidateMarshalPinResponse> {
  const { data, error } = await client.rpc("validate_marshal_pin", {
    p_token: token,
    p_pin: pin,
  });
  if (error) throw error;
  return data as ValidateMarshalPinResponse;
}

export async function markFoursomeStatus(
  client: SupabaseClient,
  marshalToken: string,
  foursomeId: string,
  status: string,
  currentHole: number | null,
  currentNineId: string | null,
  paceNote: string | null
) {
  const { data, error } = await client.rpc("mark_foursome_status", {
    p_marshal_token: marshalToken,
    p_foursome_id: foursomeId,
    p_status: status,
    p_current_hole: currentHole,
    p_current_nine_id: currentNineId,
    p_pace_note: paceNote,
  });
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════
// Direct table reads (anon SELECT allowed via RLS)
// ══════════════════════════════════════════════════════════

export async function getTournamentRound(
  client: SupabaseClient,
  bookingId: string
) {
  const { data, error } = await client
    .from("tournament_rounds")
    .select("*")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function getBookingForTournament(
  client: SupabaseClient,
  bookingId: string
) {
  const { data, error } = await client
    .from("bookings")
    .select("id, course_id, date, player_count, status, courses(id, name), tournament_formats(name)")
    .eq("id", bookingId)
    .single();
  if (error) throw error;
  return data;
}

export async function getFoursomeStatuses(
  client: SupabaseClient,
  tournamentRoundId: string
) {
  const { data, error } = await client
    .from("foursome_status")
    .select("*, foursomes(foursome_number, cart_number, starting_hole)")
    .eq("tournament_round_id", tournamentRoundId);
  if (error) throw error;
  return data;
}

export async function getAnnouncements(
  client: SupabaseClient,
  tournamentRoundId: string
) {
  const { data, error } = await client
    .from("announcements")
    .select("*")
    .eq("tournament_round_id", tournamentRoundId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getContestEntries(
  client: SupabaseClient,
  tournamentRoundId: string
) {
  const { data, error } = await client
    .from("contest_entries")
    .select("*")
    .eq("tournament_round_id", tournamentRoundId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getParticipants(
  client: SupabaseClient,
  bookingId: string
) {
  const { data, error } = await client
    .from("participants")
    .select("id, name, email, handicap")
    .eq("booking_id", bookingId)
    .order("name");
  if (error) throw error;
  return data;
}

export async function getMarshalSessions(
  client: SupabaseClient,
  tournamentRoundId: string
) {
  const { data, error } = await client
    .from("marshal_sessions")
    .select("id, name, token, expires_at, created_at")
    .eq("tournament_round_id", tournamentRoundId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// ══════════════════════════════════════════════════════════
// Direct table writes (GM only, RLS enforced)
// ══════════════════════════════════════════════════════════

export async function sendAnnouncement(
  client: SupabaseClient,
  tournamentRoundId: string,
  courseId: string,
  message: string,
  priority: "normal" | "urgent",
  targetType: "broadcast" | "foursome",
  targetFoursomeId: string | null
) {
  const { error } = await client.from("announcements").insert({
    tournament_round_id: tournamentRoundId,
    course_id: courseId,
    message,
    priority,
    target_type: targetType,
    target_foursome_id: targetFoursomeId,
  });
  if (error) throw error;
}

export async function addContestEntry(
  client: SupabaseClient,
  entry: {
    tournament_round_id: string;
    course_id: string;
    contest_type: string;
    contest_label: string;
    participant_id: string;
    hole_number?: number | null;
    nine_id?: string | null;
    measurement_feet?: number | null;
    measurement_inches?: number | null;
    verified?: boolean;
    notes?: string | null;
  }
) {
  const { data, error } = await client
    .from("contest_entries")
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContestEntry(
  client: SupabaseClient,
  entryId: string
) {
  const { error } = await client
    .from("contest_entries")
    .delete()
    .eq("id", entryId);
  if (error) throw error;
}
