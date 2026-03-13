import {
  type Player, type InsertPlayer,
  type Match, type InsertMatch,
  type MatchEvent, type InsertMatchEvent,
  type Season, type InsertSeason,
  type AppState,
  type PlayerMatchNote,
} from "@shared/schema";
import { randomUUID } from "crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";

export interface IStorage {
  // Players
  getPlayers(): Promise<Player[]>;
  getPlayer(id: string): Promise<Player | undefined>;
  createPlayer(player: InsertPlayer): Promise<Player>;
  updatePlayer(id: string, player: Partial<InsertPlayer>): Promise<Player | undefined>;
  deletePlayer(id: string): Promise<boolean>;

  // Matches
  getMatches(seasonId?: string): Promise<Match[]>;
  getMatch(id: string): Promise<Match | undefined>;
  createMatch(match: InsertMatch): Promise<Match>;
  updateMatch(id: string, match: Partial<Match>): Promise<Match | undefined>;
  deleteMatch(id: string): Promise<boolean>;

  // Match Events
  addMatchEvent(event: InsertMatchEvent): Promise<MatchEvent>;
  removeMatchEvent(matchId: string, eventId: string): Promise<boolean>;

  // Seasons
  getSeasons(): Promise<Season[]>;
  getSeason(id: string): Promise<Season | undefined>;
  createSeason(season: InsertSeason): Promise<Season>;
  updateSeason(id: string, season: Partial<InsertSeason>): Promise<Season | undefined>;
  deleteSeason(id: string): Promise<boolean>;

  // Import/Export
  getFullState(): Promise<AppState>;
  importState(state: AppState): Promise<void>;
}

function recalcGoals(match: Match) {
  const goalsFor = match.events.filter(
    (e) => e.type === "Goal" || e.type === "Penalty Scored"
  ).length;
  const goalsAgainst = match.events.filter(
    (e) => e.type === "Goal Conceded"
  ).length;
  match.goalsFor = goalsFor;
  match.goalsAgainst = goalsAgainst;
}

// Persistence file path — writable location on the server
const DATA_DIR = join(process.cwd(), "data");
const DATA_FILE = join(DATA_DIR, "stags-data.json");

export class MemStorage implements IStorage {
  private players: Map<string, Player> = new Map();
  private matches: Map<string, Match> = new Map();
  private seasons: Map<string, Season> = new Map();
  private teamName: string = "Seaton Stags";
  private saveTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Try to load saved state from disk
    if (existsSync(DATA_FILE)) {
      try {
        const raw = readFileSync(DATA_FILE, "utf-8");
        const state: AppState = JSON.parse(raw);
        for (const p of state.players) this.players.set(p.id, p);
        for (const m of state.matches) this.matches.set(m.id, m);
        for (const s of state.seasons) this.seasons.set(s.id, s);
        this.teamName = state.teamName || "Seaton Stags";
        console.log(`Loaded ${state.players.length} players, ${state.matches.length} matches, ${state.seasons.length} seasons from disk`);
        return;
      } catch (e) {
        console.error("Failed to load saved data, starting fresh:", e);
      }
    }

    // No saved data — seed a default season
    const seasonId = randomUUID();
    this.seasons.set(seasonId, {
      id: seasonId,
      name: "2025/26 - U11s",
      ageGroup: "U11",
      active: true,
    });
  }

  // Debounced save — writes to disk 200ms after last change (batches rapid events)
  private scheduleSave() {
    if (this.saveTimeout) clearTimeout(this.saveTimeout);
    this.saveTimeout = setTimeout(() => {
      try {
        if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
        const state: AppState = {
          players: Array.from(this.players.values()),
          matches: Array.from(this.matches.values()),
          seasons: Array.from(this.seasons.values()),
          teamName: this.teamName,
        };
        writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
      } catch (e) {
        console.error("Failed to save data to disk:", e);
      }
    }, 200);
  }

  // Players
  async getPlayers(): Promise<Player[]> {
    return Array.from(this.players.values());
  }

  async getPlayer(id: string): Promise<Player | undefined> {
    return this.players.get(id);
  }

  async createPlayer(data: InsertPlayer): Promise<Player> {
    const id = randomUUID();
    const player: Player = { ...data, id };
    this.players.set(id, player);
    this.scheduleSave();
    return player;
  }

  async updatePlayer(id: string, data: Partial<InsertPlayer>): Promise<Player | undefined> {
    const existing = this.players.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.players.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  async deletePlayer(id: string): Promise<boolean> {
    const ok = this.players.delete(id);
    if (ok) this.scheduleSave();
    return ok;
  }

  // Matches
  async getMatches(seasonId?: string): Promise<Match[]> {
    const all = Array.from(this.matches.values());
    const filtered = seasonId ? all.filter((m) => m.seasonId === seasonId) : all;
    return filtered.sort((a, b) => b.date.localeCompare(a.date));
  }

  async getMatch(id: string): Promise<Match | undefined> {
    return this.matches.get(id);
  }

  async createMatch(data: InsertMatch): Promise<Match> {
    const id = randomUUID();
    const match: Match = {
      ...data,
      id,
      goalsFor: 0,
      goalsAgainst: 0,
      events: [],
      playerNotes: [],
    };
    this.matches.set(id, match);
    this.scheduleSave();
    return match;
  }

  async updateMatch(id: string, data: Partial<Match>): Promise<Match | undefined> {
    const existing = this.matches.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.matches.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  async deleteMatch(id: string): Promise<boolean> {
    const ok = this.matches.delete(id);
    if (ok) this.scheduleSave();
    return ok;
  }

  // Match Events
  async addMatchEvent(data: InsertMatchEvent): Promise<MatchEvent> {
    const match = this.matches.get(data.matchId);
    if (!match) throw new Error("Match not found");
    const event: MatchEvent = { ...data, id: randomUUID() };
    match.events.push(event);
    recalcGoals(match);
    this.matches.set(match.id, match);
    this.scheduleSave();
    return event;
  }

  async removeMatchEvent(matchId: string, eventId: string): Promise<boolean> {
    const match = this.matches.get(matchId);
    if (!match) return false;
    const idx = match.events.findIndex((e) => e.id === eventId);
    if (idx === -1) return false;
    match.events.splice(idx, 1);
    recalcGoals(match);
    this.matches.set(match.id, match);
    this.scheduleSave();
    return true;
  }

  // Seasons
  async getSeasons(): Promise<Season[]> {
    return Array.from(this.seasons.values());
  }

  async getSeason(id: string): Promise<Season | undefined> {
    return this.seasons.get(id);
  }

  async createSeason(data: InsertSeason): Promise<Season> {
    const id = randomUUID();
    const season: Season = { ...data, id };
    this.seasons.set(id, season);
    this.scheduleSave();
    return season;
  }

  async updateSeason(id: string, data: Partial<InsertSeason>): Promise<Season | undefined> {
    const existing = this.seasons.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...data };
    this.seasons.set(id, updated);
    this.scheduleSave();
    return updated;
  }

  async deleteSeason(id: string): Promise<boolean> {
    const ok = this.seasons.delete(id);
    if (ok) this.scheduleSave();
    return ok;
  }

  // Import/Export
  async getFullState(): Promise<AppState> {
    return {
      players: Array.from(this.players.values()),
      matches: Array.from(this.matches.values()),
      seasons: Array.from(this.seasons.values()),
      teamName: this.teamName,
    };
  }

  async importState(state: AppState): Promise<void> {
    this.players.clear();
    this.matches.clear();
    this.seasons.clear();
    this.teamName = state.teamName || "Seaton Stags";

    for (const p of state.players) this.players.set(p.id, p);
    for (const m of state.matches) this.matches.set(m.id, m);
    for (const s of state.seasons) this.seasons.set(s.id, s);
    this.scheduleSave();
  }
}

export const storage = new MemStorage();
