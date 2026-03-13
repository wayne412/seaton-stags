import { Switch, Route, Router, Link, useLocation } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Squad from "@/pages/squad";
import MatchList from "@/pages/match-list";
import MatchTracker from "@/pages/match-tracker";
import PlayerProfile from "@/pages/player-profile";
import Leaderboards from "@/pages/leaderboards";
import Seasons from "@/pages/seasons";
import Settings from "@/pages/settings";
import { PerplexityAttribution } from "@/components/PerplexityAttribution";
import {
  Users, Calendar, Trophy, BarChart3, Settings as SettingsIcon,
  LayoutDashboard, Menu, X
} from "lucide-react";
import { useState, useEffect } from "react";
import { ThemeProvider } from "@/components/theme-provider";

function StagsLogo() {
  return (
    <svg viewBox="0 0 32 32" className="w-8 h-8" fill="none" aria-label="Seaton Stags logo">
      <rect width="32" height="32" rx="6" fill="currentColor" />
      <path
        d="M16 5 L20 11 L26 11 L21 16 L23 23 L16 19 L9 23 L11 16 L6 11 L12 11 Z"
        fill="hsl(var(--primary-foreground))"
        stroke="hsl(var(--primary-foreground))"
        strokeWidth="0.5"
      />
    </svg>
  );
}

function NavLink({ href, children, icon: Icon, onClick }: {
  href: string;
  children: React.ReactNode;
  icon: any;
  onClick?: () => void;
}) {
  const [location] = useLocation();
  const isActive = location === href || (href !== "/" && location.startsWith(href));

  return (
    <Link href={href} onClick={onClick}>
      <span
        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
          ${isActive
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        data-testid={`nav-${href.replace(/\//g, "") || "dashboard"}`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        {children}
      </span>
    </Link>
  );
}

function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  const nav = (
    <nav className="flex flex-col gap-1">
      <NavLink href="/" icon={LayoutDashboard} onClick={closeMobile}>Dashboard</NavLink>
      <NavLink href="/squad" icon={Users} onClick={closeMobile}>Squad</NavLink>
      <NavLink href="/matches" icon={Calendar} onClick={closeMobile}>Matches</NavLink>
      <NavLink href="/leaderboards" icon={Trophy} onClick={closeMobile}>Leaderboards</NavLink>
      <NavLink href="/seasons" icon={BarChart3} onClick={closeMobile}>Seasons</NavLink>
      <NavLink href="/settings" icon={SettingsIcon} onClick={closeMobile}>Settings</NavLink>
    </nav>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header */}
      <header className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <StagsLogo />
          <span className="font-semibold text-sm">Seaton Stags</span>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg hover:bg-muted"
          data-testid="button-mobile-menu"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/50" onClick={closeMobile} />
      )}

      {/* Mobile sidebar drawer */}
      <aside className={`
        lg:hidden fixed top-14 left-0 bottom-0 z-50 w-64 bg-background border-r p-4
        transition-transform duration-200
        ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {nav}
        <div className="mt-auto pt-4">
          <PerplexityAttribution />
        </div>
      </aside>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-56 border-r bg-card flex-col p-4">
        <div className="flex items-center gap-2.5 mb-6">
          <StagsLogo />
          <div>
            <div className="font-semibold text-sm leading-tight">Seaton Stags</div>
            <div className="text-xs text-muted-foreground">U11s</div>
          </div>
        </div>
        {nav}
        <div className="mt-auto pt-4">
          <PerplexityAttribution />
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-56 pt-14 lg:pt-0 min-h-screen">
        <div className="p-4 lg:p-6 max-w-5xl">
          {children}
        </div>
      </main>
    </div>
  );
}

function AppRouter() {
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/squad" component={Squad} />
        <Route path="/matches" component={MatchList} />
        <Route path="/matches/:id" component={MatchTracker} />
        <Route path="/players/:id" component={PlayerProfile} />
        <Route path="/leaderboards" component={Leaderboards} />
        <Route path="/seasons" component={Seasons} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router hook={useHashLocation}>
            <AppRouter />
          </Router>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
