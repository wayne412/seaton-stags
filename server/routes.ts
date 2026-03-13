import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import {
  insertPlayerSchema,
  insertMatchSchema,
  insertMatchEventSchema,
  insertSeasonSchema,
  appStateSchema,
} from "@shared/schema";
import Anthropic from "@anthropic-ai/sdk";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // ── Players ────────────────────────────────────────

  app.get("/api/players", async (_req, res) => {
    const players = await storage.getPlayers();
    res.json(players);
  });

  app.get("/api/players/:id", async (req, res) => {
    const player = await storage.getPlayer(req.params.id);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  });

  app.post("/api/players", async (req, res) => {
    const parsed = insertPlayerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const player = await storage.createPlayer(parsed.data);
    res.status(201).json(player);
  });

  app.patch("/api/players/:id", async (req, res) => {
    const player = await storage.updatePlayer(req.params.id, req.body);
    if (!player) return res.status(404).json({ error: "Player not found" });
    res.json(player);
  });

  app.delete("/api/players/:id", async (req, res) => {
    const ok = await storage.deletePlayer(req.params.id);
    if (!ok) return res.status(404).json({ error: "Player not found" });
    res.status(204).send();
  });

  // ── Seasons ────────────────────────────────────────

  app.get("/api/seasons", async (_req, res) => {
    const seasons = await storage.getSeasons();
    res.json(seasons);
  });

  app.post("/api/seasons", async (req, res) => {
    const parsed = insertSeasonSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const season = await storage.createSeason(parsed.data);
    res.status(201).json(season);
  });

  app.patch("/api/seasons/:id", async (req, res) => {
    const season = await storage.updateSeason(req.params.id, req.body);
    if (!season) return res.status(404).json({ error: "Season not found" });
    res.json(season);
  });

  app.delete("/api/seasons/:id", async (req, res) => {
    const ok = await storage.deleteSeason(req.params.id);
    if (!ok) return res.status(404).json({ error: "Season not found" });
    res.status(204).send();
  });

  // ── Matches ────────────────────────────────────────

  app.get("/api/matches", async (req, res) => {
    const seasonId = req.query.seasonId as string | undefined;
    const matches = await storage.getMatches(seasonId);
    res.json(matches);
  });

  app.get("/api/matches/:id", async (req, res) => {
    const match = await storage.getMatch(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    res.json(match);
  });

  app.post("/api/matches", async (req, res) => {
    const parsed = insertMatchSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const match = await storage.createMatch(parsed.data);
    res.status(201).json(match);
  });

  app.patch("/api/matches/:id", async (req, res) => {
    const match = await storage.updateMatch(req.params.id, req.body);
    if (!match) return res.status(404).json({ error: "Match not found" });
    res.json(match);
  });

  app.delete("/api/matches/:id", async (req, res) => {
    const ok = await storage.deleteMatch(req.params.id);
    if (!ok) return res.status(404).json({ error: "Match not found" });
    res.status(204).send();
  });

  // ── Match Events ───────────────────────────────────

  app.post("/api/matches/:matchId/events", async (req, res) => {
    const data = { ...req.body, matchId: req.params.matchId };
    const parsed = insertMatchEventSchema.safeParse(data);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const event = await storage.addMatchEvent(parsed.data);
      res.status(201).json(event);
    } catch (e: any) {
      res.status(404).json({ error: e.message });
    }
  });

  app.delete("/api/matches/:matchId/events/:eventId", async (req, res) => {
    const ok = await storage.removeMatchEvent(req.params.matchId, req.params.eventId);
    if (!ok) return res.status(404).json({ error: "Event not found" });
    res.status(204).send();
  });

  // ── Match Report (LLM) ────────────────────────────

  app.post("/api/matches/:id/report", async (req, res) => {
    try {
      const match = await storage.getMatch(req.params.id);
      if (!match) return res.status(404).json({ error: "Match not found" });

      const players = await storage.getPlayers();
      const playerMap = new Map(players.map(p => [p.id, p]));

      // Build structured match data for the LLM
      const events = [...match.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const date = new Date(match.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

      // Compile event log
      const eventLines: string[] = [];
      for (const event of events) {
        const player = event.playerId ? playerMap.get(event.playerId) : null;
        const assistPlayer = event.assistPlayerId ? playerMap.get(event.assistPlayerId) : null;
        const time = new Date(event.timestamp).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
        const noteText = event.note ? ` — ${event.note}` : "";

        switch (event.type) {
          case "Goal":
            eventLines.push(`[${time}] GOAL — ${player?.name || "Unknown"}${assistPlayer ? ` (assist: ${assistPlayer.name})` : ""}${noteText}`);
            break;
          case "Penalty Scored":
            eventLines.push(`[${time}] PENALTY SCORED — ${player?.name || "Unknown"}${assistPlayer ? ` (won by: ${assistPlayer.name})` : ""}${noteText}`);
            break;
          case "Goal Conceded":
            eventLines.push(`[${time}] GOAL CONCEDED${noteText}`);
            break;
          case "Yellow Card":
            eventLines.push(`[${time}] YELLOW CARD — ${player?.name || "Unknown"}${noteText}`);
            break;
          case "Red Card":
            eventLines.push(`[${time}] RED CARD — ${player?.name || "Unknown"}${noteText}`);
            break;
          case "Penalty Missed":
            eventLines.push(`[${time}] PENALTY MISSED — ${player?.name || "Unknown"}${noteText}`);
            break;
          case "Note": {
            const isPhase = ["1st Half Kick Off", "Half Time", "2nd Half Kick Off", "Full Time"].includes(event.note);
            if (isPhase) {
              eventLines.push(`--- ${event.note} ---`);
            } else {
              eventLines.push(`[${time}] NOTE — ${event.note}`);
            }
            break;
          }
        }
      }

      // Compile player notes
      const playerNoteLines: string[] = [];
      for (const pn of (match.playerNotes || [])) {
        if (pn.note.trim()) {
          const p = playerMap.get(pn.playerId);
          if (p) playerNoteLines.push(`${p.name}: ${pn.note}`);
        }
      }

      const potmPlayer = match.playerOfMatch ? playerMap.get(match.playerOfMatch) : null;
      const venueStr = match.venue === "Home" ? "home" : match.venue === "Away" ? `${match.opponent}'s ground` : "a neutral venue";

      // Build the data block for the LLM
      const matchDataBlock = [
        `Match: Seaton Stags ${match.goalsFor} - ${match.goalsAgainst} ${match.opponent}`,
        `Date: ${date}`,
        `Venue: ${venueStr}`,
        `Result: ${match.goalsFor > match.goalsAgainst ? "Win" : match.goalsFor < match.goalsAgainst ? "Loss" : "Draw"}`,
        potmPlayer ? `Player of the Match: ${potmPlayer.name}` : "",
        "",
        "Match Events:",
        ...eventLines,
        "",
        "Player Notes (coach observations):",
        ...playerNoteLines,
      ].filter(Boolean).join("\n");

      const systemPrompt = `You are a sports journalist with a flair for vivid, story-driven football reporting. You write match reports for Seaton Stags, a grassroots under-11s football team. Your audience is parents reading on WhatsApp.

Instructions:
- Begin with a header line: ⚽ *MATCH REPORT — Seaton Stags [score] - [score] [opponent]* followed by 📅 [date] | [venue]
- Then write 3-6 paragraphs of flowing, narrative prose in the style of BBC Sport or The Athletic.
- Set the scene in the opening paragraph — teams, venue, what was at stake.
- Follow the natural chronological flow of the match, describing momentum changes, key chances, goals, and standout moments.
- CRITICALLY: Blend the player notes (coach observations) seamlessly INTO the narrative — weave them into descriptions of the action. Do NOT list them separately. A player's note should appear naturally when that player is mentioned in the story.
- Highlight emotional or dramatic moments — crucial saves, near misses, turning points.
- Use light emoji throughout (⚽, 🔥, 💪, 👏, ⭐, etc.) — suitable for grassroots parents on WhatsApp.
- End with the full-time scoreline in bold (*Full Time: Seaton Stags X - X Opponent*), Player of the Match if given, and a short encouraging sign-off.
- The tone should be warm, encouraging, and celebratory of effort — this is kids' football. Even in defeat, highlight positives.
- Use WhatsApp-style bold (*text*) for emphasis.
- Do NOT use bullet points or lists anywhere. Everything must be flowing prose.
- Do NOT copy the raw events or notes directly — interpret and retell them as part of the action.
- Keep it between 200-400 words.`;

      if (!process.env.ANTHROPIC_API_KEY) {
        return res.status(503).json({ error: "Full match reports require an Anthropic API key. Set ANTHROPIC_API_KEY in your environment variables." });
      }
      const client = new Anthropic();
      const message = await client.messages.create({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{
          role: "user",
          content: `Write a match report from the following data:\n\n${matchDataBlock}`,
        }],
      });

      const reportText = message.content
        .filter((block: any) => block.type === "text")
        .map((block: any) => block.text)
        .join("");

      res.json({ report: reportText });
    } catch (err: any) {
      console.error("Report generation error:", err);
      res.status(500).json({ error: "Failed to generate report. " + (err.message || "") });
    }
  });

  // ── Import / Export ────────────────────────────────

  app.get("/api/state", async (_req, res) => {
    const state = await storage.getFullState();
    res.json(state);
  });

  app.post("/api/state/import", async (req, res) => {
    const parsed = appStateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    await storage.importState(parsed.data);
    res.json({ success: true });
  });

  return httpServer;
}
