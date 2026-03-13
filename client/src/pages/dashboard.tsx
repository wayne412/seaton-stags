import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Player, Match, Season } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Calendar, Trophy, TrendingUp } from "lucide-react";

function PlayerAvatar({ player, size = "md" }: { player: Player; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  const initials = player.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={`${dim} rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold`}>
      {player.squadNumber ?? initials}
    </div>
  );
}

export default function Dashboard() {
  const { data: players = [], isLoading: pLoading } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["/api/seasons"] });
  const activeSeason = seasons.find((s) => s.active);
  const { data: matches = [], isLoading: mLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches", activeSeason?.id ? `?seasonId=${activeSeason.id}` : ""],
    enabled: true,
  });

  const seasonMatches = activeSeason
    ? matches.filter((m) => m.seasonId === activeSeason.id)
    : matches;

  const completedMatches = seasonMatches.filter((m) => m.completed);
  const wins = completedMatches.filter((m) => m.goalsFor > m.goalsAgainst).length;
  const draws = completedMatches.filter((m) => m.goalsFor === m.goalsAgainst).length;
  const losses = completedMatches.filter((m) => m.goalsFor < m.goalsAgainst).length;
  const totalGoals = completedMatches.reduce((sum, m) => sum + m.goalsFor, 0);
  const totalConceded = completedMatches.reduce((sum, m) => sum + m.goalsAgainst, 0);

  // Top scorer — only count events where playerId is not null
  const goalCounts: Record<string, number> = {};
  for (const m of completedMatches) {
    for (const e of m.events) {
      if ((e.type === "Goal" || e.type === "Penalty Scored") && e.playerId) {
        goalCounts[e.playerId] = (goalCounts[e.playerId] || 0) + 1;
      }
    }
  }
  const topScorerId = Object.entries(goalCounts).sort((a, b) => b[1] - a[1])[0];
  const topScorer = topScorerId ? players.find((p) => p.id === topScorerId[0]) : null;

  // Recent matches
  const recentMatches = [...completedMatches]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  const loading = pLoading || mLoading;

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {activeSeason?.name || "No active season"}
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Calendar className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Played</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-matches-played">
              {completedMatches.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Record</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-record">
              {wins}W {draws}D {losses}L
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Trophy className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Goals</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-goals">
              {totalGoals}
            </div>
            <div className="text-xs text-muted-foreground">
              {totalConceded} conceded &middot; GD {totalGoals - totalConceded >= 0 ? "+" : ""}{totalGoals - totalConceded}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Squad</span>
            </div>
            <div className="text-2xl font-bold tabular-nums" data-testid="text-squad-size">
              {players.filter((p) => p.active).length}
            </div>
            <div className="text-xs text-muted-foreground">active players</div>
          </CardContent>
        </Card>
      </div>

      {/* Top scorer + recent results */}
      <div className="grid lg:grid-cols-2 gap-4">
        {topScorer && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Top Scorer</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href={`/players/${topScorer.id}`}>
                <span className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer">
                  <PlayerAvatar player={topScorer} />
                  <div>
                    <div className="font-semibold text-sm">{topScorer.name}</div>
                    <div className="text-xs text-muted-foreground">{topScorerId![1]} {topScorerId![1] === 1 ? 'goal' : 'goals'}</div>
                  </div>
                </span>
              </Link>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Recent Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentMatches.length === 0 && (
              <p className="text-sm text-muted-foreground">No completed matches yet</p>
            )}
            {recentMatches.map((m) => {
              const result = m.goalsFor > m.goalsAgainst ? "W" : m.goalsFor < m.goalsAgainst ? "L" : "D";
              const color = result === "W" ? "bg-green-600" : result === "L" ? "bg-red-500" : "bg-yellow-500";
              return (
                <Link key={m.id} href={`/matches/${m.id}`}>
                  <span className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity cursor-pointer" data-testid={`link-match-${m.id}`}>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className={`${color} text-white w-6 h-6 flex items-center justify-center p-0 text-xs font-bold`}>
                        {result}
                      </Badge>
                      <span className="text-sm">vs {m.opponent}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums">
                      {m.goalsFor} - {m.goalsAgainst}
                    </span>
                  </span>
                </Link>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
