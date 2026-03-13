import { useQuery } from "@tanstack/react-query";
import type { Player, Match, Season } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trophy, CircleDot, ArrowUpRight, Square, Star } from "lucide-react";
import { Link, useParams } from "wouter";

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg">
      {player.squadNumber ?? initials}
    </div>
  );
}

export default function PlayerProfile() {
  const params = useParams<{ id: string }>();
  const { data: player, isLoading: pLoading } = useQuery<Player>({
    queryKey: ["/api/players", params.id],
  });
  const { data: allMatches = [], isLoading: mLoading } = useQuery<Match[]>({
    queryKey: ["/api/matches"],
  });
  const { data: seasons = [] } = useQuery<Season[]>({ queryKey: ["/api/seasons"] });

  if (pLoading || mLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (!player) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Player not found</p>
        <Link href="/squad"><Button variant="link" className="mt-2">Back to squad</Button></Link>
      </div>
    );
  }

  // Compute stats across all matches
  const completedMatches = allMatches.filter((m) => m.completed);

  const stats = {
    goals: 0,
    assists: 0,
    yellowCards: 0,
    redCards: 0,
    potmAwards: 0,
    penaltiesScored: 0,
    penaltiesMissed: 0,
    appearances: 0,
  };

  // Track per-season stats
  const seasonStats: Record<string, typeof stats> = {};

  for (const match of completedMatches) {
    // Events where this player is scorer/recipient
    const playerEvents = match.events.filter((e) => e.playerId === player.id);
    // Events where this player assisted (assistPlayerId)
    const assistEvents = match.events.filter((e) => e.assistPlayerId === player.id);

    if (playerEvents.length === 0 && assistEvents.length === 0 && match.playerOfMatch !== player.id && !match.lineup?.includes(player.id)) continue;

    const hasAppearance = playerEvents.length > 0 || assistEvents.length > 0 || match.lineup?.includes(player.id);
    if (hasAppearance || match.playerOfMatch === player.id) {
      stats.appearances++;
    }

    if (match.playerOfMatch === player.id) stats.potmAwards++;

    for (const event of playerEvents) {
      switch (event.type) {
        case "Goal": stats.goals++; break;
        case "Yellow Card": stats.yellowCards++; break;
        case "Red Card": stats.redCards++; break;
        case "Penalty Scored": stats.penaltiesScored++; stats.goals++; break;
        case "Penalty Missed": stats.penaltiesMissed++; break;
      }
    }

    // Count assists from assistPlayerId field
    stats.assists += assistEvents.length;

    // Season stats
    const sId = match.seasonId;
    if (!seasonStats[sId]) {
      seasonStats[sId] = { goals: 0, assists: 0, yellowCards: 0, redCards: 0, potmAwards: 0, penaltiesScored: 0, penaltiesMissed: 0, appearances: 0 };
    }
    const ss = seasonStats[sId];
    if (hasAppearance || match.playerOfMatch === player.id) ss.appearances++;
    if (match.playerOfMatch === player.id) ss.potmAwards++;
    for (const event of playerEvents) {
      switch (event.type) {
        case "Goal": ss.goals++; break;
        case "Yellow Card": ss.yellowCards++; break;
        case "Red Card": ss.redCards++; break;
        case "Penalty Scored": ss.penaltiesScored++; ss.goals++; break;
        case "Penalty Missed": ss.penaltiesMissed++; break;
      }
    }
    ss.assists += assistEvents.filter(e => e.matchId === match.id || true).length;
  }

  const positionColor: Record<string, string> = {
    Goalkeeper: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    Defender: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Midfielder: "bg-green-500/15 text-green-700 dark:text-green-400",
    Forward: "bg-red-500/15 text-red-700 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/squad">
          <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-back">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <PlayerAvatar player={player} />
          <div>
            <h1 className="text-xl font-bold" data-testid="text-player-name">{player.name}</h1>
            <div className="flex items-center gap-2">
              <Badge className={`text-xs ${positionColor[player.position]}`}>{player.position}</Badge>
              {player.squadNumber && (
                <span className="text-xs text-muted-foreground">#{player.squadNumber}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Career stats */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
        <Card>
          <CardContent className="pt-3 pb-2 px-3 text-center">
            <CircleDot className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold tabular-nums" data-testid="text-stat-goals">{stats.goals}</div>
            <div className="text-xs text-muted-foreground">Goals</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3 text-center">
            <ArrowUpRight className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold tabular-nums" data-testid="text-stat-assists">{stats.assists}</div>
            <div className="text-xs text-muted-foreground">Assists</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3 text-center">
            <Star className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold tabular-nums" data-testid="text-stat-potm">{stats.potmAwards}</div>
            <div className="text-xs text-muted-foreground">POTM</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3 text-center">
            <Trophy className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <div className="text-2xl font-bold tabular-nums" data-testid="text-stat-apps">{stats.appearances}</div>
            <div className="text-xs text-muted-foreground">Apps</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-3 pb-2 px-3 text-center">
            <Square className="w-4 h-4 mx-auto text-yellow-500 mb-1" />
            <div className="text-2xl font-bold tabular-nums">{stats.yellowCards}</div>
            <div className="text-xs text-muted-foreground">Yellows</div>
          </CardContent>
        </Card>
      </div>

      {/* Season-by-season breakdown */}
      {Object.keys(seasonStats).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Season Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-xs font-medium text-muted-foreground">Season</th>
                    <th className="text-center py-2 text-xs font-medium text-muted-foreground">Apps</th>
                    <th className="text-center py-2 text-xs font-medium text-muted-foreground">Goals</th>
                    <th className="text-center py-2 text-xs font-medium text-muted-foreground">Assists</th>
                    <th className="text-center py-2 text-xs font-medium text-muted-foreground">POTM</th>
                    <th className="text-center py-2 text-xs font-medium text-muted-foreground">YC</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(seasonStats).map(([sId, ss]) => {
                    const season = seasons.find((s) => s.id === sId);
                    return (
                      <tr key={sId} className="border-b last:border-0">
                        <td className="py-2 font-medium">{season?.name || "Unknown"}</td>
                        <td className="py-2 text-center tabular-nums">{ss.appearances}</td>
                        <td className="py-2 text-center tabular-nums">{ss.goals}</td>
                        <td className="py-2 text-center tabular-nums">{ss.assists}</td>
                        <td className="py-2 text-center tabular-nums">{ss.potmAwards}</td>
                        <td className="py-2 text-center tabular-nums">{ss.yellowCards}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent match involvement */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Recent Matches</CardTitle>
        </CardHeader>
        <CardContent>
          {(() => {
            const playerMatches = completedMatches
              .filter((m) =>
                m.events.some((e) => e.playerId === player.id || e.assistPlayerId === player.id) ||
                m.playerOfMatch === player.id ||
                m.lineup?.includes(player.id)
              )
              .sort((a, b) => b.date.localeCompare(a.date))
              .slice(0, 10);

            if (playerMatches.length === 0) {
              return <p className="text-sm text-muted-foreground text-center py-4">No match data yet</p>;
            }

            return (
              <div className="space-y-2">
                {playerMatches.map((m) => {
                  const goals = m.events.filter((e) => (e.type === "Goal" || e.type === "Penalty Scored") && e.playerId === player.id).length;
                  const assists = m.events.filter((e) => e.assistPlayerId === player.id).length;
                  const isPotm = m.playerOfMatch === player.id;

                  return (
                    <Link key={m.id} href={`/matches/${m.id}`}>
                      <span className="flex items-center justify-between py-1.5 hover:opacity-80 transition-opacity cursor-pointer text-sm">
                        <span className="text-muted-foreground">
                          {new Date(m.date + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                          {" "}vs {m.opponent}
                        </span>
                        <span className="flex items-center gap-2">
                          {goals > 0 && <Badge variant="secondary" className="text-xs">{goals}G</Badge>}
                          {assists > 0 && <Badge variant="secondary" className="text-xs">{assists}A</Badge>}
                          {isPotm && <Badge variant="secondary" className="text-xs bg-yellow-500/15 text-yellow-700 dark:text-yellow-400">POTM</Badge>}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
