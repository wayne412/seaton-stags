import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Season, Match, InsertSeason } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Archive, Play, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

export default function Seasons() {
  const { data: seasons = [], isLoading: sLoading } = useQuery<Season[]>({ queryKey: ["/api/seasons"] });
  const { data: matches = [] } = useQuery<Match[]>({ queryKey: ["/api/matches"] });
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: InsertSeason) => apiRequest("POST", "/api/seasons", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seasons"] });
      setAddOpen(false);
      setName("");
      setAgeGroup("");
      toast({ title: "Season created" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertSeason> }) =>
      apiRequest("PATCH", `/api/seasons/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seasons"] });
      setEditId(null);
      toast({ title: "Season updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/seasons/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/seasons"] });
      toast({ title: "Season deleted" });
    },
  });

  if (sLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        {[1, 2].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
    );
  }

  const activeSeasons = seasons.filter((s) => s.active);
  const archivedSeasons = seasons.filter((s) => !s.active);

  const editSeason = editId ? seasons.find((s) => s.id === editId) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Seasons</h1>
          <p className="text-sm text-muted-foreground">{seasons.length} total</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-season">
              <Plus className="w-4 h-4 mr-1" /> New Season
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Season</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name) return;
                createMutation.mutate({ name, ageGroup, active: true });
              }}
            >
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Season Name</label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 2026/27 - U12s"
                  required
                  data-testid="input-season-name"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Age Group</label>
                <Input
                  value={ageGroup}
                  onChange={(e) => setAgeGroup(e.target.value)}
                  placeholder="e.g. U12"
                  data-testid="input-age-group"
                />
              </div>
              <Button type="submit" className="w-full" data-testid="button-submit-season">
                Create Season
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active seasons */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">Active</h2>
        {activeSeasons.length === 0 && (
          <Card>
            <CardContent className="py-6 text-center text-sm text-muted-foreground">
              No active season. Create one to start tracking matches.
            </CardContent>
          </Card>
        )}
        {activeSeasons.map((season) => {
          const seasonMatches = matches.filter((m) => m.seasonId === season.id);
          const completed = seasonMatches.filter((m) => m.completed);
          const wins = completed.filter((m) => m.goalsFor > m.goalsAgainst).length;
          const draws = completed.filter((m) => m.goalsFor === m.goalsAgainst).length;
          const losses = completed.filter((m) => m.goalsFor < m.goalsAgainst).length;

          return (
            <Card key={season.id}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm" data-testid={`text-season-${season.id}`}>{season.name}</span>
                      <Badge variant="secondary" className="text-xs bg-green-500/15 text-green-700 dark:text-green-400">
                        Active
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {completed.length} matches &middot; {wins}W {draws}D {losses}L
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => {
                        setEditId(season.id);
                        setName(season.name);
                        setAgeGroup(season.ageGroup);
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-8 w-8"
                      onClick={() => updateMutation.mutate({ id: season.id, data: { active: false } })}
                      data-testid={`button-archive-season-${season.id}`}
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Archived seasons */}
      {archivedSeasons.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Archived</h2>
          {archivedSeasons.map((season) => {
            const seasonMatches = matches.filter((m) => m.seasonId === season.id);
            const completed = seasonMatches.filter((m) => m.completed);

            return (
              <Card key={season.id} className="opacity-70">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-sm">{season.name}</span>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {completed.length} matches played
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8"
                        onClick={() => updateMutation.mutate({ id: season.id, data: { active: true } })}
                      >
                        <Play className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                        onClick={() => deleteMutation.mutate(season.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Season</DialogTitle>
          </DialogHeader>
          {editSeason && (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                updateMutation.mutate({ id: editSeason.id, data: { name, ageGroup } });
              }}
            >
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Season Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Age Group</label>
                <Input value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)} />
              </div>
              <Button type="submit" className="w-full">Save Changes</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
