import { useState } from "react";
import { DatabasesView } from "@/components/DatabasesView";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type Theme } from "@/components/ThemeProvider";

// ── Types ──────────────────────────────────────────────────────────────────────
interface NavItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { id: "d1",       label: "Databases (D1)",  icon: Database  },
  { id: "kv",       label: "KV Namespaces",   icon: KeyRound  },
  { id: "settings", label: "Settings",        icon: Settings  },
];

const THEME_OPTIONS: { value: Theme; icon: React.ElementType; label: string }[] = [
  { value: "light",  icon: Sun,     label: "Light"  },
  { value: "dark",   icon: Moon,    label: "Dark"   },
  { value: "system", icon: Monitor, label: "System" },
];

// ── Sidebar ────────────────────────────────────────────────────────────────────
interface SidebarProps {
  collapsed: boolean;
  activeId: string;
  onNavigate: (id: string) => void;
}

function Sidebar({ collapsed, activeId, onNavigate }: SidebarProps) {
  const { theme, setTheme } = useTheme();

  return (
    <aside
      className={cn(
        "flex flex-col h-full border-r border-sidebar-border bg-sidebar",
        "transition-[width] duration-200 ease-in-out overflow-hidden",
        collapsed ? "w-[52px]" : "w-[220px]"
      )}
    >
      {/* Logo */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 h-11",
          "border-b border-sidebar-border shrink-0"
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
      <nav className="flex-1 flex flex-col gap-0.5 px-1.5 py-2 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const active = activeId === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
              className={cn(
                "group flex items-center gap-2.5 w-full rounded-md px-2 py-1.5",
                "text-sm font-medium transition-colors duration-100",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-sidebar-accent text-sidebar-primary"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              )}
            >
              <Icon
                size={16}
                strokeWidth={active ? 2 : 1.75}
                className={cn(
                  "shrink-0 transition-colors",
                  active ? "text-sidebar-primary" : "text-sidebar-foreground/50 group-hover:text-sidebar-foreground"
                )}
              />
              {!collapsed && (
                <span className="whitespace-nowrap">{label}</span>
              )}
            </button>
          );
        })}
      </nav>

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
                    : "text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
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

// ── Title Bar ─────────────────────────────────────────────────────────────────
interface TitleBarProps {
  collapsed: boolean;
  onToggle: () => void;
  title: string;
}

function TitleBar({ collapsed, onToggle, title }: TitleBarProps) {
  return (
    <header
      // Tauri: makes the entire bar draggable to move the window
      data-tauri-drag-region
      className={cn(
        "flex items-center h-11 shrink-0 border-b border-border",
        "bg-background/90 backdrop-blur-sm",
        "select-none"
      )}
    >
      {/* Collapse toggle — not draggable */}
      <button
        onClick={onToggle}
        data-tauri-drag-region="false"
        className={cn(
          "flex items-center justify-center w-11 h-11 shrink-0",
          "text-muted-foreground hover:text-foreground transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed
          ? <PanelLeftOpen  size={16} strokeWidth={1.75} />
          : <PanelLeftClose size={16} strokeWidth={1.75} />
        }
      </button>

      {/* Drag region + title */}
      <div
        data-tauri-drag-region
        className="flex-1 flex items-center h-full px-1"
      >
        <span className="text-sm font-medium text-foreground/70">
          {title}
        </span>
      </div>
    </header>
  );
}

// ── Simple page router ────────────────────────────────────────────────────────
function PageContent({ activeId }: { activeId: string }) {
  if (activeId === "d1") return <DatabasesView />;
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
  const [activeId, setActiveId] = useState("d1");

  const currentNav = NAV_ITEMS.find((n) => n.id === activeId);
  const pageTitle = currentNav?.label ?? "CF Studio";

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        activeId={activeId}
        onNavigate={setActiveId}
      />

      {/* Main column */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* Title bar */}
        <TitleBar
          collapsed={collapsed}
          onToggle={() => setCollapsed((c) => !c)}
          title={pageTitle}
        />

        {/* Content area */}
        <main className="flex-1 overflow-hidden p-6">
          <PageContent activeId={activeId} />
        </main>
      </div>
    </div>
  );
}
