import { useQuery } from "@tanstack/react-query";
import type { Player, Match, Season } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="w-8 h-8 rounded-full bg-card border flex items-center justify-center text-xs font-bold shrink-0">
      {player.squadNumber ?? initials}
    </span>
  );
}

function LeaderboardTable({
  entries,
  label,
}: {
  entries: { player: Player; value: number }[];
  label: string;
}) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">No data yet</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry, i) => (
        <Link key={entry.player.id} href={`/players/${entry.player.id}`}>
          <span
            className="flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-muted transition-colors cursor-pointer"
            data-testid={`leaderboard-${label}-${i}`}
          >
            <span className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold shrink-0
              ${i === 0 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              {i + 1}
            </span>
            <PlayerAvatar player={entry.player} />
            <span className="flex-1 min-w-0 text-sm font-medium truncate">
              {entry.player.name}
            </span>
            <span className="text-lg font-bold tabular-nums shrink-0">{entry.value}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}

export default function Leaderboards() {
  const { data: players = [], isLoading: pLoading } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { data: allMatches = [], isLoading: mLoading } = useQuery<Match[]>({ queryKey: ["/api/matches"] });
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["/api/seasons"] });

  if (pLoading || mLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  const activeSeason = seasons.find((s) => s.active);
  const completedMatches = allMatches.filter((m) => m.completed && (activeSeason ? m.seasonId === activeSeason.id : true));
  const playerMap = new Map(players.map((p) => [p.id, p]));

  // Compute stats
  const goalCounts: Record<string, number> = {};
  const assistCounts: Record<string, number> = {};
  const potmCounts: Record<string, number> = {};

  for (const match of completedMatches) {
    if (match.playerOfMatch) {
      potmCounts[match.playerOfMatch] = (potmCounts[match.playerOfMatch] || 0) + 1;
    }
    for (const event of match.events) {
      // Goals
      if ((event.type === "Goal" || event.type === "Penalty Scored") && event.playerId) {
        goalCounts[event.playerId] = (goalCounts[event.playerId] || 0) + 1;
      }
      // Assists from assistPlayerId field
      if (event.assistPlayerId) {
        assistCounts[event.assistPlayerId] = (assistCounts[event.assistPlayerId] || 0) + 1;
      }
    }
  }

  const toEntries = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([id, value]) => ({ player: playerMap.get(id)!, value }))
      .filter((e) => e.player)
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);

  const goalLeaders = toEntries(goalCounts);
  const assistLeaders = toEntries(assistCounts);
  const potmLeaders = toEntries(potmCounts);

  // Goal involvements (goals + assists)
  const involvementCounts: Record<string, number> = {};
  for (const [id, v] of Object.entries(goalCounts)) involvementCounts[id] = (involvementCounts[id] || 0) + v;
  for (const [id, v] of Object.entries(assistCounts)) involvementCounts[id] = (involvementCounts[id] || 0) + v;
  const involvementLeaders = toEntries(involvementCounts);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">Leaderboards</h1>
        <p className="text-sm text-muted-foreground">
          {activeSeason?.name || "All Seasons"} &middot; {completedMatches.length} matches
        </p>
      </div>

      <Tabs defaultValue="goals">
        <TabsList className="w-full grid grid-cols-4">
          <TabsTrigger value="goals" className="text-xs" data-testid="tab-goals">Goals</TabsTrigger>
          <TabsTrigger value="assists" className="text-xs" data-testid="tab-assists">Assists</TabsTrigger>
          <TabsTrigger value="involvements" className="text-xs" data-testid="tab-involvements">G+A</TabsTrigger>
          <TabsTrigger value="potm" className="text-xs" data-testid="tab-potm">POTM</TabsTrigger>
        </TabsList>

        <TabsContent value="goals">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Top Scorers</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaderboardTable entries={goalLeaders} label="goals" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assists">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Most Assists</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaderboardTable entries={assistLeaders} label="assists" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="involvements">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Goal Involvements (G+A)</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaderboardTable entries={involvementLeaders} label="involvements" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="potm">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Player of the Match Awards</CardTitle>
            </CardHeader>
            <CardContent>
              <LeaderboardTable entries={potmLeaders} label="potm" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
