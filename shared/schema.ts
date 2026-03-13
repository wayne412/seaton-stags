import { z } from "zod";

// ── Types ──────────────────────────────────────────────

export const positions = [
  "Goalkeeper",
  "Defender",
  "Midfielder",
  "Forward",
] as const;

export const eventTypes = [
  "Goal",
  "Goal Conceded",
  "Yellow Card",
  "Red Card",
  "Penalty Scored",
  "Penalty Missed",
  "Note",
] as const;

export const matchPhases = [
  "Pre-Match",
  "First Half",
  "Half Time",
  "Second Half",
  "Full Time",
] as const;

export const matchTypes = ["League", "Cup", "Friendly"] as const;

// ── Player ─────────────────────────────────────────────

export const playerSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  squadNumber: z.number().min(1).max(99).nullable().default(null),
  position: z.enum(positions),
  active: z.boolean().default(true),
});

export const insertPlayerSchema = playerSchema.omit({ id: true });

export type Player = z.infer<typeof playerSchema>;
export type InsertPlayer = z.infer<typeof insertPlayerSchema>;

// ── Match Event ────────────────────────────────────────

export const matchEventSchema = z.object({
  id: z.string(),
  matchId: z.string(),
  type: z.enum(eventTypes),
  playerId: z.string().nullable().default(null), // scorer / card recipient / nullable for goal conceded, notes
  assistPlayerId: z.string().nullable().default(null), // assist on Goal or Penalty Scored
  note: z.string().default(""), // free text note on the event
  timestamp: z.string(), // ISO string — the ONLY time reference (real-time)
});

export const insertMatchEventSchema = matchEventSchema.omit({ id: true });

export type MatchEvent = z.infer<typeof matchEventSchema>;
export type InsertMatchEvent = z.infer<typeof insertMatchEventSchema>;

// ── Player Match Note ──────────────────────────────────

export const playerMatchNoteSchema = z.object({
  playerId: z.string(),
  note: z.string().default(""),
});

export type PlayerMatchNote = z.infer<typeof playerMatchNoteSchema>;

// ── Match ──────────────────────────────────────────────

export const matchSchema = z.object({
  id: z.string(),
  seasonId: z.string(),
  date: z.string(), // YYYY-MM-DD
  opponent: z.string().min(1),
  venue: z.enum(["Home", "Away", "Neutral"]),
  matchType: z.enum(["League", "Cup", "Friendly"]).default("League"),
  goalsFor: z.number().min(0).default(0),
  goalsAgainst: z.number().min(0).default(0),
  playerOfMatch: z.string().nullable().default(null), // playerId
  lineup: z.array(z.string()).default([]), // playerIds
  completed: z.boolean().default(false),
  phase: z.enum(matchPhases).default("Pre-Match"),
  events: z.array(matchEventSchema).default([]),
  playerNotes: z.array(playerMatchNoteSchema).default([]), // post-match notes per player
});

export const insertMatchSchema = matchSchema.omit({
  id: true,
  events: true,
  goalsFor: true,
  goalsAgainst: true,
  playerNotes: true,
});

export type Match = z.infer<typeof matchSchema>;
export type InsertMatch = z.infer<typeof insertMatchSchema>;

// ── Season ─────────────────────────────────────────────

export const seasonSchema = z.object({
  id: z.string(),
  name: z.string().min(1), // e.g. "2025/26 - U11s"
  ageGroup: z.string().default(""),
  active: z.boolean().default(true),
});

export const insertSeasonSchema = seasonSchema.omit({ id: true });

export type Season = z.infer<typeof seasonSchema>;
export type InsertSeason = z.infer<typeof insertSeasonSchema>;

// ── Full App State (for import/export) ─────────────────

export const appStateSchema = z.object({
  players: z.array(playerSchema),
  matches: z.array(matchSchema),
  seasons: z.array(seasonSchema),
  teamName: z.string().default("Seaton Stags"),
});

export type AppState = z.infer<typeof appStateSchema>;
