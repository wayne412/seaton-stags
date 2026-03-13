import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Match, Player, MatchEvent, PlayerMatchNote } from "@shared/schema";
import { eventTypes, matchPhases, matchTypes } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Trash2, CheckCircle, Clock, Play, Pause,
  CircleDot, Square, AlertTriangle, ArrowUpRight,
  MessageSquare, Share2, FileText, Copy, RefreshCw
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback } from "react";
import { Link, useParams } from "wouter";

const eventIcons: Record<string, any> = {
  "Goal": CircleDot,
  "Goal Conceded": AlertTriangle,
  "Yellow Card": Square,
  "Red Card": Square,
  "Penalty Scored": CircleDot,
  "Penalty Missed": AlertTriangle,
  "Note": MessageSquare,
};

const eventColors: Record<string, string> = {
  "Goal": "text-green-600 dark:text-green-400",
  "Goal Conceded": "text-red-500",
  "Yellow Card": "text-yellow-500",
  "Red Card": "text-red-500",
  "Penalty Scored": "text-green-600 dark:text-green-400",
  "Penalty Missed": "text-red-500",
  "Note": "text-muted-foreground",
};

// Phase button configs
const phaseTransitions: Record<string, { label: string; nextPhase: string; icon: any }> = {
  "Pre-Match": { label: "1st Half Kick Off", nextPhase: "First Half", icon: Play },
  "First Half": { label: "Half Time", nextPhase: "Half Time", icon: Pause },
  "Half Time": { label: "2nd Half Kick Off", nextPhase: "Second Half", icon: Play },
  "Second Half": { label: "Full Time", nextPhase: "Full Time", icon: CheckCircle },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function PlayerLabel({ player }: { player: Player | undefined }) {
  if (!player) return <span className="text-muted-foreground">Unknown</span>;
  return (
    <span>
      {player.name}
      {player.squadNumber && <span className="text-muted-foreground"> (#{player.squadNumber})</span>}
    </span>
  );
}

// ── Report Generators ────────────────────────────────

function generateQuickReport(match: Match, players: Player[]): string {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const result = match.goalsFor > match.goalsAgainst ? "WIN" : match.goalsFor < match.goalsAgainst ? "LOSS" : "DRAW";
  const emoji = result === "WIN" ? "🏆" : result === "DRAW" ? "🤝" : "😤";
  const date = new Date(match.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const quickTypeLabel = match.matchType && match.matchType !== "League" ? ` | ${match.matchType}` : "";
  let report = `⚽ *SEATON STAGS ${match.goalsFor} - ${match.goalsAgainst} ${match.opponent}* ${emoji}\n`;
  report += `📅 ${date} | ${match.venue}${quickTypeLabel}\n\n`;

  // Goalscorers with assists
  const goals = match.events.filter(e => e.type === "Goal" || e.type === "Penalty Scored");
  if (goals.length > 0) {
    const scorerCounts: Record<string, { count: number; assists: string[] }> = {};
    for (const g of goals) {
      if (g.playerId) {
        const name = playerMap.get(g.playerId)?.name || "Unknown";
        if (!scorerCounts[name]) scorerCounts[name] = { count: 0, assists: [] };
        scorerCounts[name].count++;
        if (g.assistPlayerId) {
          const assistName = playerMap.get(g.assistPlayerId)?.name || "";
          if (assistName) scorerCounts[name].assists.push(assistName);
        }
      }
    }
    const scorerList = Object.entries(scorerCounts).map(([name, data]) => {
      let entry = data.count > 1 ? `${name} x${data.count}` : name;
      return entry;
    }).join(", ");
    report += `⚽ Goals: ${scorerList}\n`;
  }

  // Assists from goal events
  const assistNames: string[] = [];
  for (const g of goals) {
    if (g.assistPlayerId) {
      const name = playerMap.get(g.assistPlayerId)?.name;
      if (name) assistNames.push(name);
    }
  }
  if (assistNames.length > 0) {
    report += `🅰️ Assists: ${assistNames.join(", ")}\n`;
  }

  // POTM
  if (match.playerOfMatch) {
    const potm = playerMap.get(match.playerOfMatch);
    if (potm) report += `⭐ Player of the Match: ${potm.name}\n`;
  }

  if (result === "WIN") {
    report += `\n${result}! Well played lads! 👏`;
  } else if (result === "DRAW") {
    report += `\n${result}! A solid point, plenty of positives. 👊`;
  } else {
    report += `\n${result}! Heads up lads, we go again next week. 💪`;
  }
  return report;
}

function generateFullReport(match: Match, players: Player[]): string {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const date = new Date(match.date + "T12:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const resultWord = match.goalsFor > match.goalsAgainst ? "victory" : match.goalsFor < match.goalsAgainst ? "defeat" : "draw";

  const events = [...match.events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const notesWithContent = (match.playerNotes || []).filter(n => n.note.trim());
  const potmPlayer = match.playerOfMatch ? playerMap.get(match.playerOfMatch) : null;

  // Build a map of player notes keyed by player ID for weaving in
  const playerNoteMap = new Map<string, { name: string; note: string }>();
  for (const pn of notesWithContent) {
    const p = playerMap.get(pn.playerId);
    if (p) playerNoteMap.set(pn.playerId, { name: p.name, note: pn.note });
  }

  // Track which players have been mentioned in the narrative (via events)
  const mentionedPlayerIds = new Set<string>();

  // Parse events into structured half data
  type HalfMoment = { kind: "goal" | "conceded" | "penalty_scored" | "penalty_missed" | "card" | "note"; text: string; playerId?: string; assistId?: string };
  let firstHalf: HalfMoment[] = [];
  let secondHalf: HalfMoment[] = [];
  let currentHalf: HalfMoment[] = firstHalf;

  for (const event of events) {
    const player = event.playerId ? playerMap.get(event.playerId) : null;
    const assistPlayer = event.assistPlayerId ? playerMap.get(event.assistPlayerId) : null;
    const noteText = event.note || "";

    // Phase boundaries switch the half
    if (event.type === "Note" && ["Half Time", "2nd Half Kick Off"].includes(event.note)) {
      currentHalf = secondHalf;
      continue;
    }
    if (event.type === "Note" && ["1st Half Kick Off", "Full Time"].includes(event.note)) {
      continue;
    }

    switch (event.type) {
      case "Goal": {
        const assistStr = assistPlayer ? ` after a fine ball from ${assistPlayer.name}` : "";
        const noteStr = noteText ? ` — ${noteText.toLowerCase()}` : "";
        currentHalf.push({ kind: "goal", text: `${player?.name || "A Stags player"} found the net${assistStr}${noteStr}`, playerId: event.playerId || undefined, assistId: event.assistPlayerId || undefined });
        if (event.playerId) mentionedPlayerIds.add(event.playerId);
        if (event.assistPlayerId) mentionedPlayerIds.add(event.assistPlayerId);
        break;
      }
      case "Penalty Scored": {
        const noteStr = noteText ? ` (${noteText.toLowerCase()})` : "";
        currentHalf.push({ kind: "penalty_scored", text: `${player?.name || "A Stags player"} converted from the penalty spot${noteStr}`, playerId: event.playerId || undefined, assistId: event.assistPlayerId || undefined });
        if (event.playerId) mentionedPlayerIds.add(event.playerId);
        break;
      }
      case "Goal Conceded": {
        const noteStr = noteText ? ` — ${noteText.toLowerCase()}` : "";
        currentHalf.push({ kind: "conceded", text: `${match.opponent} pulled one back${noteStr}` });
        break;
      }
      case "Yellow Card": {
        const noteStr = noteText ? ` for ${noteText.toLowerCase()}` : "";
        currentHalf.push({ kind: "card", text: `${player?.name || "A player"} picked up a yellow card${noteStr}`, playerId: event.playerId || undefined });
        if (event.playerId) mentionedPlayerIds.add(event.playerId);
        break;
      }
      case "Red Card": {
        const noteStr = noteText ? ` for ${noteText.toLowerCase()}` : "";
        currentHalf.push({ kind: "card", text: `${player?.name || "A player"} was shown a red card${noteStr}`, playerId: event.playerId || undefined });
        if (event.playerId) mentionedPlayerIds.add(event.playerId);
        break;
      }
      case "Penalty Missed": {
        const noteStr = noteText ? ` (${noteText.toLowerCase()})` : "";
        currentHalf.push({ kind: "penalty_missed", text: `${player?.name || "A Stags player"} saw their penalty saved${noteStr}`, playerId: event.playerId || undefined });
        if (event.playerId) mentionedPlayerIds.add(event.playerId);
        break;
      }
      case "Note": {
        if (noteText) currentHalf.push({ kind: "note", text: noteText });
        break;
      }
    }
  }

  // Helper: weave a player note into a sentence naturally after a player is mentioned
  const usedPlayerNotes = new Set<string>();
  function weavePlayerNote(playerId: string | undefined): string {
    if (!playerId || usedPlayerNotes.has(playerId)) return "";
    const pn = playerNoteMap.get(playerId);
    if (!pn) return "";
    usedPlayerNotes.add(playerId);
    // Produce a brief sentence threading the coach note into the narrative
    const note = pn.note.trim();
    // If the note starts with a capital and reads like a sentence, use it directly
    const connector = [".", "!", "?"].includes(note.slice(-1)) ? " " : ". ";
    return `, and ${note.charAt(0).toLowerCase()}${note.slice(1)}${connector.trim() === "." ? "" : "."} `;
  }

  // Helper: ensure trailing punctuation
  function ensureEnd(s: string): string {
    return /[.!?]$/.test(s.trim()) ? s.trim() : s.trim() + ".";
  }

  // Helper: build a natural sentence from a player note
  // e.g. "Clark" + "Clinical in front of goal" -> "Clark was clinical in front of goal."
  function noteToSentence(name: string, rawNote: string): string {
    const note = rawNote.trim();
    const lcNote = note.charAt(0).toLowerCase() + note.slice(1);

    // If the note starts with a past-tense verb or action word, just prefix the name
    const verbStarters = /^(was|were|had|has|did|made|showed|played|kept|ran|looked|put|got|gave|took|won|lost|found|battled|worked|controlled|dominated|created|delivered|provided|marshalled|commanded|read|covered|intercepted|tracked|pressed|held|carried|drove|pushed|pulled|set|linked|combined|connected|distributed|orchestrated|dictated|anchored|shielded|screened|supported|produced|finished|scored|struck|fired|slotted|headed|converted|saved|caught|punched|tipped|denied|blocked|cleared|tackled|challenged|fouled|committed|picked|earned|received|collected)/i;
    if (verbStarters.test(lcNote)) {
      return `${name} ${lcNote}`;
    }

    // If it starts with an adjective followed by a preposition/adverb pattern
    // (e.g. "solid at the back", "clinical in front of goal", "brilliant today")
    // then add "was"
    const adjWithPrep = /^(brilliant|superb|solid|excellent|outstanding|impressive|clinical|tireless|tenacious|aggressive|composed|confident|sharp|lively|energetic|calm|good|great|fantastic|wonderful|strong|quick|fast|dominant|comfortable|assured|tidy|neat|useful|effective|reliable|consistent|dangerous|creative|inventive|busy|industrious|hard-working|unlucky|unfortunate|quiet|poor|sloppy|careless|lazy|slow|weak)\s+(at|in|on|today|all|throughout|from|with|during|for|going|when|under)/i;
    if (adjWithPrep.test(lcNote)) {
      return `${name} was ${lcNote}`;
    }

    // If it starts with an adjective followed by a noun (e.g. "tireless running", "good communication")
    // then add "showed"
    const adjNoun = /^(brilliant|superb|solid|excellent|outstanding|impressive|clinical|tireless|tenacious|aggressive|composed|confident|sharp|lively|energetic|calm|fantastic|wonderful|strong|quick|fast|dominant|comfortable|assured|tidy|neat|useful|effective|reliable|consistent|dangerous|creative|inventive|busy|industrious|hard-working|unlucky|unfortunate|quiet|poor|sloppy|careless|lazy|slow|weak|good|great)\s+[a-z]/i;
    if (adjNoun.test(lcNote)) {
      return `${name} showed ${lcNote}`;
    }

    // Default: just prefix the name naturally
    return `${name} ${lcNote}`;
  }

  // Helper: render a half's moments into flowing prose, weaving in player notes
  function renderHalf(moments: HalfMoment[]): string {
    const sentences: string[] = [];
    for (let i = 0; i < moments.length; i++) {
      const m = moments[i];
      let sentence = m.text;

      // After a goal/event sentence, weave in the scorer's coach note if available
      if (m.playerId && playerNoteMap.has(m.playerId) && !usedPlayerNotes.has(m.playerId)) {
        const pn = playerNoteMap.get(m.playerId)!;
        usedPlayerNotes.add(m.playerId);
        sentence = ensureEnd(sentence) + " " + noteToSentence(pn.name, pn.note);
      }
      // Also weave in the assister's note as a follow-on sentence
      if (m.assistId && playerNoteMap.has(m.assistId) && !usedPlayerNotes.has(m.assistId)) {
        const pn = playerNoteMap.get(m.assistId)!;
        usedPlayerNotes.add(m.assistId);
        sentence = ensureEnd(sentence) + " " + noteToSentence(pn.name, pn.note);
      }

      sentences.push(ensureEnd(sentence));
    }
    return sentences.join(" ");
  }

  // ── Build the report ──
  const resultEmoji = resultWord === "victory" ? "🏆" : resultWord === "draw" ? "🤝" : "💪";
  const venueStr = match.venue === "Home" ? "home" : match.venue === "Away" ? `${match.opponent}'s ground` : "a neutral venue";

  let report = `⚽ *MATCH REPORT — Seaton Stags ${match.goalsFor} - ${match.goalsAgainst} ${match.opponent}*\n`;
  report += `📅 ${date} | ${match.venue}\n\n`;

  // Opening paragraph — set the scene
  if (resultWord === "victory") {
    report += `Seaton Stags secured a ${match.goalsFor}-${match.goalsAgainst} ${resultWord} against ${match.opponent} at ${venueStr} on ${date}.`;
  } else if (resultWord === "draw") {
    report += `Seaton Stags were held to a ${match.goalsFor}-${match.goalsAgainst} ${resultWord} by ${match.opponent} at ${venueStr} on ${date}.`;
  } else {
    report += `Seaton Stags fell to a ${match.goalsFor}-${match.goalsAgainst} ${resultWord} against ${match.opponent} at ${venueStr} on ${date}.`;
  }

  // First half narrative with player notes woven in
  const firstHalfProse = renderHalf(firstHalf);
  if (firstHalfProse) {
    report += "\n\n" + firstHalfProse;
  }

  // Second half narrative
  const secondHalfProse = renderHalf(secondHalf);
  if (secondHalfProse) {
    report += "\n\n";
    // Bridge into the second half — keep proper nouns capitalised
    report += "After the break, " + secondHalfProse;
  }

  // Gather any remaining player notes not yet woven in (players who had no events)
  const remainingNotes: string[] = [];
  for (const [pid, pn] of playerNoteMap) {
    if (!usedPlayerNotes.has(pid)) {
      usedPlayerNotes.add(pid);
      remainingNotes.push(ensureEnd(noteToSentence(pn.name, pn.note)));
    }
  }

  // Thread remaining notes into a "squad contributions" paragraph
  if (remainingNotes.length > 0) {
    report += "\n\n";
    if (remainingNotes.length === 1) {
      report += `Elsewhere, ${remainingNotes[0]}`;
    } else {
      report += "Across the park, " + remainingNotes.join(" ");
    }
  }

  // Closing
  report += "\n\n";
  report += `*Full Time: Seaton Stags ${match.goalsFor} - ${match.goalsAgainst} ${match.opponent}* ${resultEmoji}\n\n`;

  if (potmPlayer) {
    // If POTM has an unused note, thread it in here
    const potmNote = playerNoteMap.get(match.playerOfMatch!);
    if (potmNote && !usedPlayerNotes.has(match.playerOfMatch!)) {
      const noteSnippet = potmNote.note.trim();
      const lcSnippet = noteSnippet.charAt(0).toLowerCase() + noteSnippet.slice(1);
      const endsP = /[.!?]$/.test(lcSnippet);
      report += `⭐ *Player of the Match: ${potmPlayer.name}* — ${lcSnippet}${endsP ? "" : "."}\n\n`;
    } else {
      report += `⭐ *Player of the Match: ${potmPlayer.name}*\n\n`;
    }
  }

  if (resultWord === "victory") {
    report += "A well-deserved win for the Stags. Great effort all round! 👏";
  } else if (resultWord === "draw") {
    report += "Honours even at the final whistle. Plenty of positives to take from this one! 👏";
  } else {
    report += "A tough result but the lads showed great character throughout. Heads up for the next one! 💪";
  }

  return report;
}

// ── Full Report Dialog (uses useEffect for reliable API call) ──

function FullReportDialog({ open, onOpenChange, matchId, onCopy }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  matchId: string;
  onCopy: (text: string) => void;
}) {
  const [reportText, setReportText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requestId, setRequestId] = useState(0);

  // Trigger API call when dialog opens or regenerate is requested
  useEffect(() => {
    if (!open) {
      // Reset state when dialog closes
      setReportText(null);
      setError(null);
      setLoading(false);
      return;
    }

    // Dialog just opened — fetch report
    let cancelled = false;
    setLoading(true);
    setError(null);
    setReportText(null);

    const apiBase = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";
    fetch(`${apiBase}/api/matches/${matchId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    })
      .then(res => {
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!cancelled) {
          setReportText(data.report);
          setLoading(false);
        }
      })
      .catch(err => {
        if (!cancelled) {
          console.error("Report generation failed:", err);
          setError("Could not generate report. Try again.");
          setLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [open, matchId, requestId]);

  const handleRegenerate = () => {
    setRequestId(prev => prev + 1);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Full Match Report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {loading && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="w-6 h-6 border-2 border-foreground border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Writing your match report...</p>
            </div>
          )}
          {error && !loading && (
            <div className="text-center py-6">
              <p className="text-sm text-destructive mb-3">{error}</p>
              <Button variant="outline" size="sm" onClick={handleRegenerate}>Try Again</Button>
            </div>
          )}
          {reportText && !loading && (
            <>
              <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg font-sans max-h-96 overflow-y-auto" data-testid="text-full-report">
                {reportText}
              </pre>
              <div className="flex gap-2">
                <Button
                  onClick={() => onCopy(reportText)}
                  className="flex-1 gap-2"
                >
                  <Copy className="w-4 h-4" /> Download for WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleRegenerate}
                  title="Regenerate report"
                >
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Component ───────────────────────────────────

export default function MatchTracker() {
  const params = useParams<{ id: string }>();
  const { data: match, isLoading } = useQuery<Match>({
    queryKey: ["/api/matches", params.id],
  });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { toast } = useToast();

  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [selectedPlayer, setSelectedPlayer] = useState<string>("");
  const [selectedAssist, setSelectedAssist] = useState<string>("");
  const [eventNote, setEventNote] = useState("");
  const [potm, setPotm] = useState<string>("");
  const [editingOpponent, setEditingOpponent] = useState(false);
  const [opponentName, setOpponentName] = useState("");

  // Player notes for post-match
  const [showPlayerNotes, setShowPlayerNotes] = useState(false);
  const [playerNotes, setPlayerNotes] = useState<Record<string, string>>({});

  // Report dialogs
  const [showQuickReport, setShowQuickReport] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);

  const addEventMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/matches/${params.id}/events`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      setSelectedEvent("");
      setSelectedPlayer("");
      setSelectedAssist("");
      setEventNote("");
    },
  });

  const removeEventMutation = useMutation({
    mutationFn: (eventId: string) =>
      apiRequest("DELETE", `/api/matches/${params.id}/events/${eventId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
  });

  const updateMatchMutation = useMutation({
    mutationFn: (data: Partial<Match>) =>
      apiRequest("PATCH", `/api/matches/${params.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches", params.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
  });

  const activePlayers = useMemo(() =>
    players.filter((p) => p.active).sort((a, b) => a.name.localeCompare(b.name)),
    [players]
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Match not found</p>
        <Link href="/matches"><Button variant="link" className="mt-2">Back to matches</Button></Link>
      </div>
    );
  }

  const events = [...(match.events || [])].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const phase = match.phase || "Pre-Match";
  const transition = phaseTransitions[phase];
  const isLive = phase === "First Half" || phase === "Second Half";
  const isFinished = phase === "Full Time";

  // Events that need a player vs ones that don't
  const noPlayerEvents = ["Goal Conceded", "Note"];
  const needsPlayer = selectedEvent && !noPlayerEvents.includes(selectedEvent);
  // Goal/Penalty Scored can have an assist
  const canHaveAssist = selectedEvent === "Goal" || selectedEvent === "Penalty Scored";

  const handleAddEvent = () => {
    if (!selectedEvent) return;
    if (needsPlayer && !selectedPlayer) return;

    addEventMutation.mutate({
      type: selectedEvent,
      playerId: needsPlayer ? selectedPlayer : null,
      assistPlayerId: canHaveAssist && selectedAssist ? selectedAssist : null,
      note: eventNote,
      timestamp: new Date().toISOString(),
    });
  };

  const handlePhaseChange = () => {
    if (!transition) return;
    // Log a phase event
    addEventMutation.mutate({
      type: "Note" as any,
      playerId: null,
      assistPlayerId: null,
      note: transition.label,
      timestamp: new Date().toISOString(),
    });
    updateMatchMutation.mutate({ phase: transition.nextPhase as any });

    if (transition.nextPhase === "Full Time") {
      // Open player notes dialog
      const notes: Record<string, string> = {};
      activePlayers.forEach(p => { notes[p.id] = ""; });
      // Pre-fill from existing
      (match.playerNotes || []).forEach(pn => { notes[pn.playerId] = pn.note; });
      setPlayerNotes(notes);
      setShowPlayerNotes(true);
    }
  };

  const handleSavePlayerNotes = () => {
    const notes: PlayerMatchNote[] = Object.entries(playerNotes)
      .map(([playerId, note]) => ({ playerId, note }));

    updateMatchMutation.mutate({
      completed: true,
      playerOfMatch: potm || null,
      playerNotes: notes,
    });
    setShowPlayerNotes(false);

  };

  const handleReopen = () => {
    updateMatchMutation.mutate({ completed: false, phase: "Second Half" as any });

  };

  const copyToClipboard = (text: string) => {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `stags-report-${match.date}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Report downloaded — paste into WhatsApp" });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/matches">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex-1">
          {editingOpponent ? (
            <form onSubmit={(e) => {
              e.preventDefault();
              if (opponentName.trim()) {
                updateMatchMutation.mutate({ opponent: opponentName.trim() });
              }
              setEditingOpponent(false);
            }}>
              <Input
                value={opponentName}
                onChange={(e) => setOpponentName(e.target.value)}
                autoFocus
                className="text-xl font-bold h-8"
                onBlur={() => {
                  if (opponentName.trim() && opponentName.trim() !== match.opponent) {
                    updateMatchMutation.mutate({ opponent: opponentName.trim() });
                  }
                  setEditingOpponent(false);
                }}
                data-testid="input-edit-opponent"
              />
            </form>
          ) : (
            <h1
              className="text-xl font-bold cursor-pointer hover:text-muted-foreground transition-colors"
              onClick={() => { setOpponentName(match.opponent); setEditingOpponent(true); }}
              title="Tap to edit opponent"
              data-testid="text-match-title"
            >
              {match.venue === "Home" ? "vs" : "@"} {match.opponent}
            </h1>
          )}
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {new Date(match.date + "T12:00:00").toLocaleDateString("en-GB", {
                weekday: "short", day: "numeric", month: "short", year: "numeric",
              })} &middot; {match.venue}
            </p>
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.5 rounded cursor-pointer select-none ${
                (match.matchType || "League") === "Cup" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                : (match.matchType || "League") === "Friendly" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-muted text-muted-foreground"
              }`}
              title="Tap to change match type"
              onClick={() => {
                const types = [...matchTypes];
                const currentIdx = types.indexOf(match.matchType || "League");
                const nextType = types[(currentIdx + 1) % types.length];
                updateMatchMutation.mutate({ matchType: nextType });
              }}
              data-testid="badge-match-type"
            >{match.matchType || "League"}</span>
          </div>
        </div>
      </div>

      {/* Score + Phase */}
      <Card>
        <CardContent className="py-5 text-center">
          <Badge variant={isLive ? "default" : "secondary"} className={`text-xs mb-2 ${isLive ? "animate-pulse" : ""}`}>
            {phase}
          </Badge>
          <div className="flex items-center justify-center gap-6">
            <div>
              <div className="text-xs text-muted-foreground mb-1">Stags</div>
              <div className="text-4xl font-bold tabular-nums" data-testid="text-goals-for">
                {match.goalsFor}
              </div>
            </div>
            <span className="text-2xl text-muted-foreground font-light">-</span>
            <div>
              <div className="text-xs text-muted-foreground mb-1">{match.opponent}</div>
              <div className="text-4xl font-bold tabular-nums" data-testid="text-goals-against">
                {match.goalsAgainst}
              </div>
            </div>
          </div>
          {match.playerOfMatch && playerMap.get(match.playerOfMatch) && (
            <div className="mt-3">
              <Badge variant="secondary" className="text-xs">
                POTM: {playerMap.get(match.playerOfMatch)!.name}
              </Badge>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase control */}
      {!match.completed && transition && (
        <Button
          onClick={handlePhaseChange}
          variant={isLive ? "default" : "outline"}
          className="w-full gap-2"
          data-testid="button-phase"
        >
          <transition.icon className="w-4 h-4" />
          {transition.label}
        </Button>
      )}

      {/* Quick event entry — visible during live phases */}
      {!match.completed && (isLive || phase === "Half Time") && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" /> Log Event
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Event type */}
            <Select value={selectedEvent} onValueChange={(v) => {
              setSelectedEvent(v);
              if (noPlayerEvents.includes(v)) {
                setSelectedPlayer("");
                setSelectedAssist("");
              }
              if (v !== "Goal" && v !== "Penalty Scored") {
                setSelectedAssist("");
              }
            }}>
              <SelectTrigger data-testid="select-event-type">
                <SelectValue placeholder="Event type" />
              </SelectTrigger>
              <SelectContent>
                {eventTypes.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Player (scorer / card recipient) */}
            {needsPlayer && (
              <Select value={selectedPlayer} onValueChange={setSelectedPlayer}>
                <SelectTrigger data-testid="select-event-player">
                  <SelectValue placeholder={canHaveAssist ? "Scorer" : "Player"} />
                </SelectTrigger>
                <SelectContent>
                  {activePlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.squadNumber ? ` #${p.squadNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Assist dropdown — only for Goal / Penalty Scored */}
            {canHaveAssist && (
              <Select value={selectedAssist} onValueChange={setSelectedAssist}>
                <SelectTrigger data-testid="select-event-assist">
                  <SelectValue placeholder="Assist (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No assist</SelectItem>
                  {activePlayers
                    .filter(p => p.id !== selectedPlayer)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}{p.squadNumber ? ` #${p.squadNumber}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}

            {/* Note */}
            <Input
              value={eventNote}
              onChange={(e) => setEventNote(e.target.value)}
              placeholder="Add a note (optional)..."
              data-testid="input-event-note"
            />
            <Button
              onClick={handleAddEvent}
              disabled={!selectedEvent || (needsPlayer && !selectedPlayer) || addEventMutation.isPending}
              className="w-full"
              data-testid="button-log-event"
            >
              Log Event
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Event Timeline */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Match Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No events logged yet</p>
          )}
          <div className="space-y-1">
            {events.map((event) => {
              const player = event.playerId ? playerMap.get(event.playerId) : null;
              const assistPlayer = event.assistPlayerId ? playerMap.get(event.assistPlayerId) : null;
              const Icon = eventIcons[event.type] || Clock;
              const color = eventColors[event.type] || "text-foreground";
              const isPhaseNote = event.type === "Note" && ["1st Half Kick Off", "Half Time", "2nd Half Kick Off", "Full Time"].includes(event.note);

              if (isPhaseNote) {
                return (
                  <div key={event.id} className="flex items-center gap-2 py-2">
                    <div className="flex-1 h-px bg-border" />
                    <Badge variant="outline" className="text-xs shrink-0">{event.note}</Badge>
                    <span className="text-xs text-muted-foreground shrink-0">{formatTime(event.timestamp)}</span>
                    <div className="flex-1 h-px bg-border" />
                  </div>
                );
              }

              return (
                <div
                  key={event.id}
                  className="flex items-start gap-3 py-2 border-b last:border-0"
                  data-testid={`event-${event.id}`}
                >
                  <span className="text-xs text-muted-foreground tabular-nums font-medium shrink-0 mt-0.5 w-16">
                    {formatTime(event.timestamp)}
                  </span>
                  <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${color}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{event.type}</span>
                      {player && (
                        <span className="text-muted-foreground ml-1">
                          — <PlayerLabel player={player} />
                        </span>
                      )}
                      {assistPlayer && (
                        <span className="text-muted-foreground ml-1">
                          <ArrowUpRight className="w-3 h-3 inline text-blue-500 mx-0.5" />
                          <PlayerLabel player={assistPlayer} />
                        </span>
                      )}
                    </div>
                    {event.note && !isPhaseNote && (
                      <p className="text-xs text-muted-foreground mt-0.5 italic">"{event.note}"</p>
                    )}
                  </div>
                  {!match.completed && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeEventMutation.mutate(event.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Match reports — show after completion */}
      {match.completed && (
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowQuickReport(true)}
            data-testid="button-quick-report"
          >
            <Share2 className="w-4 h-4" /> Quick Report
          </Button>
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowFullReport(true)}
            data-testid="button-full-report"
          >
            <FileText className="w-4 h-4" /> Full Report
          </Button>
        </div>
      )}

      {/* Reopen */}
      {match.completed && (
        <Button variant="ghost" size="sm" onClick={handleReopen} className="text-muted-foreground">
          Reopen Match
        </Button>
      )}

      {/* ── Player Notes Dialog ────────────────────── */}
      <Dialog open={showPlayerNotes} onOpenChange={setShowPlayerNotes}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Player Notes — Post Match</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Player of the Match</label>
              <Select value={potm} onValueChange={setPotm}>
                <SelectTrigger data-testid="select-potm">
                  <SelectValue placeholder="Select POTM..." />
                </SelectTrigger>
                <SelectContent>
                  {activePlayers.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}{p.squadNumber ? ` #${p.squadNumber}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="border-t pt-3 space-y-3">
              {activePlayers.map((p) => (
                <div key={p.id}>
                  <label className="text-xs font-medium mb-1 block">
                    {p.name}
                    {p.squadNumber && <span className="text-muted-foreground"> #{p.squadNumber}</span>}
                  </label>
                  <Textarea
                    value={playerNotes[p.id] || ""}
                    onChange={(e) => setPlayerNotes(prev => ({ ...prev, [p.id]: e.target.value }))}
                    placeholder="How did they play?"
                    rows={2}
                    className="text-sm"
                    data-testid={`textarea-player-note-${p.id}`}
                  />
                </div>
              ))}
            </div>

            <Button onClick={handleSavePlayerNotes} className="w-full" data-testid="button-save-notes">
              <CheckCircle className="w-4 h-4 mr-1" /> Complete Match
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Quick Report Dialog ────────────────────── */}
      <Dialog open={showQuickReport} onOpenChange={setShowQuickReport}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quick Match Report</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <pre className="text-sm whitespace-pre-wrap bg-muted p-3 rounded-lg font-sans max-h-64 overflow-y-auto" data-testid="text-quick-report">
              {match && generateQuickReport(match, players)}
            </pre>
            <Button
              onClick={() => match && copyToClipboard(generateQuickReport(match, players))}
              className="w-full gap-2"
            >
              <Copy className="w-4 h-4" /> Download for WhatsApp
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Full Report Dialog ─────────────────────── */}
      <FullReportDialog
        open={showFullReport}
        onOpenChange={setShowFullReport}
        matchId={params.id}
        onCopy={copyToClipboard}
      />
    </div>
  );
}
