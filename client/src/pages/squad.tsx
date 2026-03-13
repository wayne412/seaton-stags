import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { Player, InsertPlayer } from "@shared/schema";
import { positions } from "@shared/schema";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, UserMinus, UserPlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";

function PlayerForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial?: Partial<InsertPlayer>;
  onSubmit: (data: InsertPlayer) => void;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [squadNumber, setSquadNumber] = useState(initial?.squadNumber?.toString() || "");
  const [position, setPosition] = useState<string>(initial?.position || "");
  const [active, setActive] = useState(initial?.active !== false);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!name || !position) return;
        onSubmit({
          name,
          squadNumber: squadNumber ? parseInt(squadNumber) : null,
          position: position as any,
          active,
        });
      }}
    >
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Player name"
          required
          data-testid="input-player-name"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Number (optional)</label>
          <Input
            type="number"
            min={1}
            max={99}
            value={squadNumber}
            onChange={(e) => setSquadNumber(e.target.value)}
            placeholder="—"
            data-testid="input-squad-number"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Position</label>
          <Select value={position} onValueChange={setPosition}>
            <SelectTrigger data-testid="select-position">
              <SelectValue placeholder="Position" />
            </SelectTrigger>
            <SelectContent>
              {positions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" data-testid="button-submit-player">
        {submitLabel}
      </Button>
    </form>
  );
}

function PlayerAvatar({ player }: { player: Player }) {
  const initials = player.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <div className="w-9 h-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs shrink-0">
      {player.squadNumber ?? initials}
    </div>
  );
}

export default function Squad() {
  const { data: players = [], isLoading } = useQuery<Player[]>({ queryKey: ["/api/players"] });
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: InsertPlayer) => apiRequest("POST", "/api/players", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setAddOpen(false);
      toast({ title: "Player added" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<InsertPlayer> }) =>
      apiRequest("PATCH", `/api/players/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      setEditId(null);
      toast({ title: "Player updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/players/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
      toast({ title: "Player removed" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/players/${id}`, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/players"] });
    },
  });

  const activePlayers = players.filter((p) => p.active);
  const inactivePlayers = players.filter((p) => !p.active);

  const positionOrder: Record<string, number> = { Goalkeeper: 0, Defender: 1, Midfielder: 2, Forward: 3 };
  const sorted = [...activePlayers].sort((a, b) => {
    const posDiff = positionOrder[a.position] - positionOrder[b.position];
    if (posDiff !== 0) return posDiff;
    return a.name.localeCompare(b.name);
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}
      </div>
    );
  }

  const editPlayer = editId ? players.find((p) => p.id === editId) : null;

  const positionColor: Record<string, string> = {
    Goalkeeper: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400",
    Defender: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
    Midfielder: "bg-green-500/15 text-green-700 dark:text-green-400",
    Forward: "bg-red-500/15 text-red-700 dark:text-red-400",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold" data-testid="text-page-title">Squad</h1>
          <p className="text-sm text-muted-foreground">{activePlayers.length} players</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-add-player">
              <Plus className="w-4 h-4 mr-1" /> Add Player
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Player</DialogTitle>
            </DialogHeader>
            <PlayerForm
              onSubmit={(data) => createMutation.mutate(data)}
              submitLabel="Add Player"
            />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {sorted.map((player) => (
          <Card key={player.id} className="hover:shadow-sm transition-shadow">
            <CardContent className="p-3 flex items-center gap-3">
              <PlayerAvatar player={player} />
              <div className="flex-1 min-w-0">
                <Link href={`/players/${player.id}`}>
                  <span className="font-medium text-sm hover:underline cursor-pointer" data-testid={`link-player-${player.id}`}>
                    {player.name}
                  </span>
                </Link>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge variant="secondary" className={`text-xs ${positionColor[player.position]}`}>
                    {player.position}
                  </Badge>
                  {player.squadNumber && (
                    <span className="text-xs text-muted-foreground">#{player.squadNumber}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => setEditId(player.id)}
                  data-testid={`button-edit-player-${player.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground"
                  onClick={() => toggleActiveMutation.mutate({ id: player.id, active: false })}
                >
                  <UserMinus className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {inactivePlayers.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-muted-foreground">Inactive</h2>
          {inactivePlayers.map((player) => (
            <Card key={player.id} className="opacity-60">
              <CardContent className="p-3 flex items-center gap-3">
                <PlayerAvatar player={player} />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-sm">{player.name}</span>
                  <div className="mt-0.5">
                    <Badge variant="secondary" className="text-xs">{player.position}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8"
                    onClick={() => toggleActiveMutation.mutate({ id: player.id, active: true })}>
                    <UserPlus className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                    onClick={() => deleteMutation.mutate(player.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editId} onOpenChange={(open) => !open && setEditId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Player</DialogTitle>
          </DialogHeader>
          {editPlayer && (
            <PlayerForm
              initial={editPlayer}
              onSubmit={(data) => updateMutation.mutate({ id: editPlayer.id, data })}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
