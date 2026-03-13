import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { AppState } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/components/theme-provider";
import { Download, Upload, Sun, Moon, Database } from "lucide-react";
import { useRef } from "react";

export default function Settings() {
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: state } = useQuery<AppState>({ queryKey: ["/api/state"] });

  const importMutation = useMutation({
    mutationFn: (data: AppState) => apiRequest("POST", "/api/state/import", data),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: "Data imported successfully" });
    },
    onError: () => {
      toast({ title: "Import failed", description: "The file may be corrupted or invalid.", variant: "destructive" });
    },
  });

  const handleExport = () => {
    if (!state) return;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `seaton-stags-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Backup downloaded" });
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        importMutation.mutate(data);
      } catch {
        toast({ title: "Invalid file", variant: "destructive" });
      }
    };
    reader.readAsText(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold" data-testid="text-page-title">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your data and preferences</p>
      </div>

      {/* Theme */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Appearance</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={toggleTheme}
            className="w-full justify-start gap-2"
            data-testid="button-toggle-theme"
          >
            {theme === "dark" ? (
              <>
                <Sun className="w-4 h-4" />
                Switch to Light Mode
              </>
            ) : (
              <>
                <Moon className="w-4 h-4" />
                Switch to Dark Mode
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Data management */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Data Management</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Export a backup of all your data (players, matches, seasons) as a JSON file.
            Import it later to restore your data.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={!state}
              className="gap-2"
              data-testid="button-export"
            >
              <Download className="w-4 h-4" />
              Export Backup
            </Button>

            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="gap-2"
              data-testid="button-import"
            >
              <Upload className="w-4 h-4" />
              Import Backup
            </Button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />

          {state && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
              <Database className="w-3.5 h-3.5" />
              <span>
                {state.players.length} players &middot; {state.matches.length} matches &middot; {state.seasons.length} seasons
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">About</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>Seaton Stags Team Tracker</p>
          <p>Built for grassroots football management.</p>
          <p className="text-xs">
            Export your data regularly to back up your stats.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
