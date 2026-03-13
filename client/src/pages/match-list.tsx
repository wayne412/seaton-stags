import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Match, Season, InsertMatch, Player } from "@shared/schema";
import { matchTypes } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, ChevronRight, Clock, CircleDot, X } from "lucide-react";
import { useState, useCallback } from "react";
import { Link } from "wouter";

// ── Past Result Entry ─────────────────────────────────

interface GoalEntry {
  key: number;
  scorerId: string;
  assistId: string;
}

function PastResultDialog({ open, onOpenChange, activeSeason, players }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeSeason: Season | undefined;
  players: Player[];
}) {
  const { toast } = useToast();
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [venue, setVenue] = useState<"Home" | "Away" | "Neutral">("Home");
  const [goals, setGoals] = useState<GoalEntry[]>([]);
  const [goalsAgainst, setGoalsAgainst] = useState(0);
  const [potm, setPotm] = useState("");
  const [matchType, setMatchType] = useState<"League" | "Cup" | "Friendly">("League");
  const [goalKeyCounter, setGoalKeyCounter] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const activePlayers = players.filter(p => p.active).sort((a, b) => a.name.localeCompare(b.name));

  const addGoal = () => {
    setGoals(prev => [...prev, { key: goalKeyCounter, scorerId: "", assistId: "" }]);
    setGoalKeyCounter(prev => prev + 1);
  };

  const removeGoal = (key: number) => {
    setGoals(prev => prev.filter(g => g.key !== key));
  };

  const updateGoal = (key: number, field: "scorerId" | "assistId", value: string) => {
    setGoals(prev => prev.map(g => g.key === key ? { ...g, [field]: value } : g));
  };

  const resetForm = () => {
    setOpponent("");
    setDate(new Date().toISOString().slice(0, 10));
    setVenue("Home");
    setGoals([]);
    setGoalsAgainst(0);
    setPotm("");
    setMatchType("League");
    setGoalKeyCounter(0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!opponent || !activeSeason) return;
    setSubmitting(true);

    try {
      // 1. Create the match as completed
      const matchRes = await apiRequest("POST", "/api/matches", {
        seasonId: activeSeason.id,
        date,
        opponent,
        venue,
        matchType,
        playerOfMatch: potm || null,
        lineup: [],
        completed: true,
        phase: "Full Time",
      });
      const match = await matchRes.json();

      // 2. Add goal events for Stags
      const ts = new Date(date + "T12:00:00Z");
      for (let i = 0; i < goals.length; i++) {
        const g = goals[i];
        if (!g.scorerId) continue;
        const eventTime = new Date(ts.getTime() + (i + 1) * 60000).toISOString();
        await apiRequest("POST", `/api/matches/${match.id}/events`, {
          type: "Goal",
          playerId: g.scorerId,
          assistPlayerId: g.assistId && g.assistId !== "none" ? g.assistId : null,
          note: "",
          timestamp: eventTime,
        });
      }

      // 3. Add goal conceded events
      for (let i = 0; i < goalsAgainst; i++) {
        const eventTime = new Date(ts.getTime() + (goals.length + i + 1) * 60000).toISOString();
        await apiRequest("POST", `/api/matches/${match.id}/events`, {
          type: "Goal Conceded",
          playerId: null,
          assistPlayerId: null,
          note: "",
          timestamp: eventTime,
        });
      }

      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      resetForm();
      onOpenChange(false);
    } catch (err) {
      toast({ title: "Failed to save result", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Past Result</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={handleSubmit}>
          {/* Opponent */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Opponent</label>
            <Input
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
              placeholder="e.g. Hartlepool Rovers"
              required
              data-testid="input-past-opponent"
            />
          </div>

          {/* Date + Venue + Type */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-past-date" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Venue</label>
              <Select value={venue} onValueChange={(v) => setVenue(v as any)}>
                <SelectTrigger data-testid="select-past-venue">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Home">Home</SelectItem>
                  <SelectItem value="Away">Away</SelectItem>
                  <SelectItem value="Neutral">Neutral</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <Select value={matchType} onValueChange={(v) => setMatchType(v as any)}>
                <SelectTrigger data-testid="select-past-match-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {matchTypes.map(t => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Goals Scored */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">Stags Goals ({goals.length})</label>
              <Button type="button" variant="outline" size="sm" onClick={addGoal} className="h-7 text-xs gap-1">
                <Plus className="w-3 h-3" /> Add Goal
              </Button>
            </div>
            {goals.length === 0 && (
              <p className="text-xs text-muted-foreground italic">No goals — tap Add Goal for each goal scored</p>
            )}
            <div className="space-y-2">
              {goals.map((g, idx) => (
                <div key={g.key} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <CircleDot className="w-4 h-4 text-green-600 shrink-0" />
                  <div className="flex-1 grid grid-cols-2 gap-2">
                    <Select value={g.scorerId} onValueChange={(v) => updateGoal(g.key, "scorerId", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-past-scorer-${idx}`}>
                        <SelectValue placeholder="Scorer" />
                      </SelectTrigger>
                      <SelectContent>
                        {activePlayers.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={g.assistId} onValueChange={(v) => updateGoal(g.key, "assistId", v)}>
                      <SelectTrigger className="h-8 text-xs" data-testid={`select-past-assist-${idx}`}>
                        <SelectValue placeholder="Assist" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No assist</SelectItem>
                        {activePlayers.filter(p => p.id !== g.scorerId).map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => removeGoal(g.key)}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          {/* Goals Conceded */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Goals Conceded</label>
            <div className="flex items-center gap-3">
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setGoalsAgainst(Math.max(0, goalsAgainst - 1))} disabled={goalsAgainst === 0}>-</Button>
              <span className="text-lg font-bold tabular-nums w-8 text-center" data-testid="text-past-goals-against">{goalsAgainst}</span>
              <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => setGoalsAgainst(goalsAgainst + 1)}>+</Button>
            </div>
          </div>

          {/* POTM */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Player of the Match</label>
            <Select value={potm} onValueChange={setPotm}>
              <SelectTrigger data-testid="select-past-potm">
                <SelectValue placeholder="Select POTM (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {activePlayers.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!activeSeason && (
            <p className="text-sm text-destructive">Create an active season first</p>
          )}

          <Button type="submit" className="w-full" disabled={!activeSeason || !opponent || submitting} data-testid="button-submit-past-result">
            {submitting ? "Saving..." : "Save Result"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function MatchList() {
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["/api/seasons"] });
  const { data: allMatches = [], isLoading } = useQuery<Match[]>({ queryKey: ["/api/matches"] });
  const { data: players = [] } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  const activeSeason = seasons.find((s) => s.active);
  const [filterSeason, setFilterSeason] = useState<string>("active");

  const matches = (filterSeason === "all"
    ? allMatches
    : allMatches.filter((m) => m.seasonId === (filterSeason === "active" ? activeSeason?.id : filterSeason))
  ).sort((a, b) => b.date.localeCompare(a.date));

  // New match form state
  const [opponent, setOpponent] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [venue, setVenue] = useState<"Home" | "Away" | "Neutral">("Home");
  const [newMatchType, setNewMatchType] = useState<"League" | "Cup" | "Friendly">("League");

  const createMutation = useMutation({
    mutationFn: (data: InsertMatch) => apiRequest("POST", "/api/matches", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
      setAddOpen(false);
      setOpponent("");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/matches/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/matches"] });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Matches</h1>
          <p className="text-sm text-muted-foreground">{matches.length} matches</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterSeason} onValueChange={setFilterSeason}>
            <SelectTrigger className="w-40 h-9" data-testid="select-filter-season">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Current Season</SelectItem>
              <SelectItem value="all">All Seasons</SelectItem>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => setPastOpen(true)} data-testid="button-add-past-result">
            <Clock className="w-4 h-4 mr-1" /> Past Result
          </Button>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-match">
                <Plus className="w-4 h-4 mr-1" /> New Match
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Match</DialogTitle>
              </DialogHeader>
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!opponent || !activeSeason) return;
                  createMutation.mutate({
                    seasonId: activeSeason.id,
                    date,
                    opponent,
                    venue,
                    matchType: newMatchType,
                    playerOfMatch: null,
                    lineup: [],
                    completed: false,
                    phase: "Pre-Match",
                  });
                }}
              >
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Opponent</label>
                  <Input
                    value={opponent}
                    onChange={(e) => setOpponent(e.target.value)}
                    placeholder="e.g. Hartlepool Rovers"
                    required
                    data-testid="input-opponent"
                  />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="input-date" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Venue</label>
                    <Select value={venue} onValueChange={(v) => setVenue(v as any)}>
                      <SelectTrigger data-testid="select-venue">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Home">Home</SelectItem>
                        <SelectItem value="Away">Away</SelectItem>
                        <SelectItem value="Neutral">Neutral</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
                    <Select value={newMatchType} onValueChange={(v) => setNewMatchType(v as any)}>
                      <SelectTrigger data-testid="select-match-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {matchTypes.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {!activeSeason && (
                  <p className="text-sm text-destructive">Create an active season first</p>
                )}
                <Button type="submit" className="w-full" disabled={!activeSeason} data-testid="button-submit-match">
                  Create Match
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Past Result Dialog */}
      <PastResultDialog
        open={pastOpen}
        onOpenChange={setPastOpen}
        activeSeason={activeSeason}
        players={players}
      />

      {matches.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground text-sm">
            No matches yet. Create one to start tracking.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {matches.map((match) => {
          const result = match.completed
            ? match.goalsFor > match.goalsAgainst ? "W" : match.goalsFor < match.goalsAgainst ? "L" : "D"
            : null;
          const resultColor = result === "W" ? "bg-green-600" : result === "L" ? "bg-red-500" : result === "D" ? "bg-yellow-500" : "bg-muted";
          const potm = match.playerOfMatch ? players.find((p) => p.id === match.playerOfMatch) : null;

          // Phase label for in-progress matches
          const phaseLabel = !match.completed && match.phase && match.phase !== "Pre-Match"
            ? match.phase
            : null;

          return (
            <Link key={match.id} href={`/matches/${match.id}`}>
              <Card className="hover:shadow-sm transition-shadow cursor-pointer" data-testid={`card-match-${match.id}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="flex flex-col items-center gap-0.5 shrink-0 w-12">
                    <span className="text-xs text-muted-foreground">
                      {new Date(match.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    {result && (
                      <Badge className={`${resultColor} text-white text-xs px-1.5`}>
                        {result}
                      </Badge>
                    )}
                    {!match.completed && (
                      <Badge variant="outline" className="text-xs">
                        {phaseLabel || "Live"}
                      </Badge>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm flex items-center gap-1.5">
                      {match.venue === "Home" ? "vs" : "@"} {match.opponent}
                      {match.matchType && match.matchType !== "League" && (
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          match.matchType === "Cup" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}>{match.matchType}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <span>{match.venue}</span>
                      {match.completed && <span className="tabular-nums">{match.goalsFor} - {match.goalsAgainst}</span>}
                      {potm && <span>&middot; POTM: {potm.name}</span>}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
