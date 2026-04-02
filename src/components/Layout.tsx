import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { DatabasesView } from "@/components/DatabasesView";
import { SettingsView } from "@/components/SettingsView";
import {
  Database,
  KeyRound,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Monitor,
  CloudCog,
  Box,
  Activity,
  ScrollText,
  Github,
  Globe,
  Shield,
  Zap,
  Mail,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/components/ThemeProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SessionRefreshModal } from "@/components/SessionRefreshModal";
import { R2BucketsView } from "@/pro_modules/frontend/R2BucketsView";
import {
  useAppStore,
  type UserProfile,
} from "@/store/useAppStore";
import { invokeCloudflare, useCloudflareAccounts } from "@/hooks/useCloudflare";
import { useRemoteConfig } from "@/pro_modules/frontend/useRemoteConfig";
import { AuditZoneProvider } from "@/pro_modules/frontend/AuditZoneContext";
import { SecurityPosture } from "@/pro_modules/ui/audits/SecurityPosture";
import { PerformancePosture } from "@/pro_modules/ui/audits/PerformancePosture";
import { DnsEmailPosture } from "@/pro_modules/ui/audits/DnsEmailPosture";
import { AuditPreferences } from "@/pro_modules/ui/audits/AuditPreferences";
import { Overview } from "@/pro_modules/ui/audits/Overview";
import { useMemo } from "react";

// ── Types ──────────────────────────────────────────────────────────────────────
interface NavGroup {
  label: string;
  items: NavItem[];
}

interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
  disabled?: boolean;
  badge?: string;
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Storage & Data",
    items: [
      {
        id: "r2",
        label: "R2 Buckets",
        icon: Box,
      },
      { id: "d1", label: "Databases (D1)", icon: Database },
      {
        id: "kv",
        label: "KV Namespaces",
        icon: KeyRound,
        disabled: true,
        badge: "Soon",
      },
    ],
  },
  {
    label: "Compute",
    items: [
      {
        id: "vectorize",
        label: "Vectorize",
        icon: Activity,
        disabled: true,
        badge: "Soon",
      },
    ],
  },
  {
    label: "System",
    items: [
      {
        id: "logs",
        label: "Workers Logs",
        icon: ScrollText,
        disabled: true,
        badge: "Soon",
      },
      { id: "settings", label: "Settings", icon: Settings },
    ],
  },
];

const THEME_OPTIONS: {
  value: Theme;
  icon: React.ElementType;
  label: string;
}[] = [
  { value: "light", icon: Sun, label: "Light" },
  { value: "dark", icon: Moon, label: "Dark" },
  { value: "system", icon: Monitor, label: "System" },
];

// ── Sidebar ────────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  activeId: string;
  onNavigate: (id: string) => void;
  userProfile: UserProfile | null;
  activeAccount: { id: string; name: string } | null;
  navGroups: NavGroup[];
}

function Sidebar({
  collapsed,
  activeId,
  onNavigate,
  userProfile,
  activeAccount,
  navGroups,
}: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const privacySettings = useAppStore(s => s.privacySettings);

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-sidebar-border bg-sidebar",
        "transition-[width] duration-200 ease-in-out overflow-hidden shrink-0",
        collapsed ? "w-[52px]" : "w-[220px]",
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 h-11",
          "border-b border-sidebar-border shrink-0",
        )}
      >
        <CloudCog
          size={20}
          className="text-primary shrink-0"
          strokeWidth={1.75}
        />
        {!collapsed && (
          <span className="font-semibold text-sm text-sidebar-foreground tracking-tight whitespace-nowrap">
            CF Studio
          </span>
        )}
      </div>

      {/* Nav Items */}
      <nav className="flex-1 flex flex-col gap-4 px-1.5 py-4 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            {!collapsed && (
              <span className="px-2 mb-1 text-[10px] uppercase font-bold tracking-widest text-sidebar-foreground/40 shrink-0">
                {group.label}
              </span>
            )}
            {group.items.map(({ id, label, icon: Icon, disabled, badge }) => {
              const active = activeId === id;
              return (
                <button
                  key={id}
                  onClick={() => !disabled && onNavigate(id)}
                  disabled={disabled}
                  title={collapsed ? label : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 w-full rounded-md px-2 py-1.5",
                    "text-sm font-medium transition-colors duration-100",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-left",
                    active
                      ? "bg-sidebar-accent text-sidebar-primary"
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                    disabled &&
                      "opacity-50 cursor-not-allowed hover:bg-transparent hover:text-sidebar-foreground/70",
                  )}
                >
                  <Icon
                    size={16}
                    strokeWidth={active ? 2 : 1.75}
                    className={cn(
                      "shrink-0 transition-colors",
                      active
                        ? "text-sidebar-primary"
                        : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground",
                    )}
                  />
                  {!collapsed && (
                    <span className="whitespace-nowrap flex-1 truncate">
                      {label}
                    </span>
                  )}
                  {!collapsed && badge && (
                    <Badge
                      variant="secondary"
                      className="px-1.5 py-0 text-[9px] h-4 bg-sidebar-border/50 text-sidebar-foreground/50 shrink-0"
                    >
                      {badge}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User Profile */}
      {!collapsed && activeAccount && (() => {
        const blurAccount = privacySettings.enabled && privacySettings.accountInfo;
        const blurClass = "blur-[4px] hover:blur-none transition-all duration-200 select-none hover:select-auto cursor-default";
        
        return (
          <div className="px-3 py-3 border-t border-sidebar-border shrink-0 flex items-center gap-2.5 bg-sidebar-accent/10">
            <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-xs shrink-0 uppercase tracking-tight">
              {(activeAccount.name.trim().charAt(0) || "?").toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0">
              <span className={cn("text-sm font-medium text-sidebar-foreground leading-tight truncate", blurAccount && blurClass)}>
                {activeAccount.name}
              </span>
              <span className={cn("text-[10px] text-sidebar-foreground/50 leading-tight truncate", blurAccount && blurClass)}>
                {userProfile?.email ?? ""}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Theme Switcher */}
      {!collapsed && (
        <div className="px-1.5 py-2 border-t border-sidebar-border shrink-0">
          <p className="px-2 text-[10px] uppercase tracking-widest text-sidebar-foreground/30 mb-1">
            Appearance
          </p>
          <div className="flex gap-1">
            {THEME_OPTIONS.map(({ value, icon: Icon, label }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                title={label}
                className={cn(
                  "flex-1 flex items-center justify-center py-1.5 rounded-md transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  theme === value
                    ? "bg-sidebar-accent text-sidebar-primary"
                    : "text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50",
                )}
              >
                <Icon size={13} strokeWidth={1.75} />
              </button>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

import { useUpdater } from "@/hooks/useUpdater";
import { Download as DownloadIcon, AlertCircle } from "lucide-react";

// ── Title Bar ─────────────────────────────────────────────────────────────────
interface TitleBarProps {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
  onNavigate: (id: string) => void;
}

function TitleBar({ collapsed, onToggle, title, onNavigate }: TitleBarProps) {
  const { status, downloadProgress, update } = useUpdater();

  return (
    <header
      // Tauri: makes the entire bar draggable to move the window
      data-tauri-drag-region
      className={cn(
        "flex items-center h-11 shrink-0 border-b border-border",
        "bg-background/90 backdrop-blur-sm shadow-sm",
        "select-none z-50",
      )}
    >
      {/* Collapse toggle — not draggable */}
      <button
        onClick={onToggle}
        data-tauri-drag-region="false"
        className={cn(
          "flex items-center justify-center w-11 h-11 shrink-0 border-r border-border/50",
          "text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <PanelLeftOpen size={16} strokeWidth={2} />
        ) : (
          <PanelLeftClose size={16} strokeWidth={2} />
        )}
      </button>

      {/* Drag region + title */}
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center h-full px-4 overflow-hidden"
      >
        <span className="text-sm font-semibold text-foreground/80 truncate">{title}</span>
      </div>

      {/* Update Indicator — not draggable */}
      <div data-tauri-drag-region="false" className="flex items-center pr-4 gap-2">
        {status === "downloading" && (
          <div className="flex items-center gap-2 px-2 py-1 bg-primary/10 rounded-full animate-in fade-in zoom-in-95">
             <div className="relative w-5 h-5 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90">
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-primary/20"
                  />
                  <circle
                    cx="10"
                    cy="10"
                    r="8"
                    fill="transparent"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={2 * Math.PI * 8}
                    strokeDashoffset={2 * Math.PI * 8 * (1 - downloadProgress / 100)}
                    className="text-primary transition-all duration-300"
                  />
                </svg>
                <DownloadIcon size={8} className="absolute text-primary animate-bounce mt-[1px]" />
             </div>
             <span className="text-[10px] font-bold text-primary font-mono">{downloadProgress}%</span>
          </div>
        )}

        {status === "available" && (
          <button 
            onClick={() => onNavigate("settings")}
            className="flex items-center gap-1.5 px-3 py-1 bg-primary text-primary-foreground rounded-full text-[10px] font-bold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all animate-bounce"
          >
            <DownloadIcon size={12} strokeWidth={3} />
            UPDATE V{update?.version}
          </button>
        )}

        {status === "error" && (
          <Badge variant="destructive" className="flex items-center gap-1 text-[10px] py-0.5 px-2">
            <AlertCircle size={10} />
            Update Error
          </Badge>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="h-8 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          onClick={() => open("https://github.com/mubashardev/cf-studio")}
        >
          <Github className="mr-2" size={14} />
          cf-studio
        </Button>
      </div>
    </header>
  );
}

// ── Simple page router ────────────────────────────────────────────────────────
function PageContent({ activeId, onNavigate }: { activeId: string; onNavigate: (id: string) => void }) {
  if (activeId === "d1") return <DatabasesView />;
  if (activeId === "r2") return <R2BucketsView />;
  if (activeId === "settings") return <SettingsView />;
  if (activeId === "audit") return <Overview onNavigate={onNavigate} />;
  if (activeId === "audit-security") return <SecurityPosture />;
  if (activeId === "audit-performance") return <PerformancePosture />;
  if (activeId === "audit-dns") return <DnsEmailPosture />;
  if (activeId === "audit-preferences") return <AuditPreferences />;
  
  if (activeId.startsWith("audit")) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center gap-2">
        <p className="text-muted-foreground text-sm">Audit view coming soon</p>
      </div>
    );
  }

  // KV and Settings views will be added in subsequent steps
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-2">
      <p className="text-muted-foreground text-sm">Coming soon</p>
    </div>
  );
}

// ── Layout ─────────────────────────────────────────────────────────────────────

export function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeId, setActiveId] = useState("r2");
  const userProfile = useAppStore((s) => s.userProfile);
  const setUserProfile = useAppStore((s) => s.setUserProfile);
  const activeAccount = useAppStore((s) => s.activeAccount);
  const { data: config } = useRemoteConfig();

  const navGroups = useMemo(() => {
    const groups = [...NAV_GROUPS];
    if (config?.enable_audits) {
      groups.splice(1, 0, {
        label: "Audit & Optimization",
        items: [
          { id: "audit", label: "Overview", icon: Globe },
          { id: "audit-security", label: "Security Posture", icon: Shield },
          { id: "audit-performance", label: "Performance", icon: Zap },
          { id: "audit-dns", label: "DNS & Email", icon: Mail },
          { id: "audit-preferences", label: "Preferences", icon: Settings },
        ],
      });
    }
    return groups;
  }, [config?.enable_audits]);

  useCloudflareAccounts();

  // Fetch User Profile on mount
  useEffect(() => {
    if (!userProfile) {
      invokeCloudflare<UserProfile>("fetch_user_profile")
        .then((profile) => setUserProfile(profile))
        .catch(console.error);
    }
  }, [userProfile, setUserProfile]);

  // Set up global Wrangler session file watchers
  useEffect(() => {
    let unlisteners: (() => void) | undefined;
    const setupListeners = async () => {
      const { listen } = await import("@tauri-apps/api/event");
      const u1 = await listen("wrangler-session-updated", () => {
        useAppStore.getState().clearCache();
        window.location.reload();
      });
      const u2 = await listen("wrangler-session-deleted", () => {
        useAppStore.getState().clearCache();
        window.location.reload();
      });
      return () => { u1(); u2(); };
    };
    setupListeners().then((unsubs) => { unlisteners = unsubs; });
    return () => { if (unlisteners) unlisteners(); };
  }, []);

  // Disable right-click context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => {
      document.removeEventListener("contextmenu", handleContextMenu);
    };
  }, []);

  const currentNav = navGroups.flatMap((g) => g.items).find(
    (n) => n.id === activeId,
  );
  const pageTitle = currentNav?.label ?? "CF Studio";

  return (
    <AuditZoneProvider>
      <SessionRefreshModal />
      <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
        {/* Sidebar */}
        <Sidebar
          collapsed={collapsed}
          activeId={activeId}
          onNavigate={setActiveId}
          userProfile={userProfile}
          activeAccount={activeAccount}
          navGroups={navGroups}
        />

        {/* Main column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          {/* Title bar */}
          <TitleBar
            collapsed={collapsed}
            onToggle={() => setCollapsed((c) => !c)}
            title={pageTitle}
            onNavigate={setActiveId}
          />

          {/* Content area */}
          <main className="flex-1 overflow-hidden p-6">
            <PageContent activeId={activeId} onNavigate={setActiveId} />
          </main>
        </div>
      </div>
    </AuditZoneProvider>
  );
}
