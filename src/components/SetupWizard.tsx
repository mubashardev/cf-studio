import { useEffect, useState, useCallback, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  CheckCircle2,
  XCircle,
  Download,
  Loader2,
  CloudCog,
  Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DependencyStatus {
  npm_installed: boolean;
  wrangler_installed: boolean;
}

interface SetupProgress {
  message: string;
  progress_percentage: number;
}

type Phase = "checking" | "missing" | "installing" | "done" | "error";

// ── Component ──────────────────────────────────────────────────────────────────

interface SetupWizardProps {
  children: ReactNode;
}

export function SetupWizard({ children }: SetupWizardProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [status, setStatus] = useState<DependencyStatus | null>(null);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("Checking dependencies…");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Initial dependency check ─────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    invoke<DependencyStatus>("check_dependencies")
      .then((res) => {
        if (cancelled) return;
        setStatus(res);
        if (res.npm_installed && res.wrangler_installed) {
          setPhase("done");
        } else {
          setPhase("missing");
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setErrorMsg(String(err));
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Install handler ──────────────────────────────────────────────────
  const handleInstall = useCallback(async () => {
    setPhase("installing");
    setProgress(0);
    setMessage("Starting installation…");
    setErrorMsg(null);

    let unlisten: UnlistenFn | undefined;

    try {
      unlisten = await listen<SetupProgress>("setup-progress", (event) => {
        setProgress(event.payload.progress_percentage);
        setMessage(event.payload.message);
      });

      await invoke("install_dependencies");

      // Re-check to confirm
      const final_status = await invoke<DependencyStatus>("check_dependencies");
      setStatus(final_status);

      if (final_status.npm_installed && final_status.wrangler_installed) {
        setPhase("done");
      } else {
        setErrorMsg(
          "Installation completed but some tools are still unavailable. Please restart the app."
        );
        setPhase("error");
      }
    } catch (err) {
      setErrorMsg(String(err));
      setPhase("error");
    } finally {
      unlisten?.();
    }
  }, []);

  // ── Render: pass-through when done ───────────────────────────────────
  if (phase === "done") return <>{children}</>;

  // ── Render: full-screen wizard ───────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      {/* Subtle decorative gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-[60%] h-[60%] rounded-full bg-primary/[0.04] blur-[100px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[50%] h-[50%] rounded-full bg-primary/[0.03] blur-[100px]" />
      </div>

      <div className="relative w-full max-w-lg mx-4 rounded-xl border border-border bg-card p-8 shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <CloudCog size={22} className="text-primary" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground tracking-tight">
              CF Studio Setup
            </h1>
            <p className="text-xs text-muted-foreground">
              Required tools for full functionality
            </p>
          </div>
        </div>

        {/* ── Phase: Checking ─────────────────────────────────────── */}
        {phase === "checking" && (
          <div className="flex flex-col items-center gap-4 py-8">
            <Loader2
              size={28}
              className="animate-spin text-primary"
              strokeWidth={2}
            />
            <p className="text-sm text-muted-foreground">
              Checking installed dependencies…
            </p>
          </div>
        )}

        {/* ── Phase: Missing ──────────────────────────────────────── */}
        {phase === "missing" && status && (
          <>
            {/* Dependency list */}
            <div className="space-y-3 mb-6">
              <DepRow
                label="Node.js / npm"
                icon={Terminal}
                installed={status.npm_installed}
              />
              <DepRow
                label="Cloudflare Wrangler"
                icon={CloudCog}
                installed={status.wrangler_installed}
              />
            </div>

            <Button
              className="w-full gap-2 font-medium"
              size="lg"
              onClick={handleInstall}
            >
              <Download size={16} />
              Install Required Tools
            </Button>

            <p className="mt-3 text-center text-[11px] text-muted-foreground/60">
              On macOS this requires{" "}
              <a
                href="https://brew.sh"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-muted-foreground transition-colors"
              >
                Homebrew
              </a>
              . On Windows it uses winget.
            </p>
          </>
        )}

        {/* ── Phase: Installing ───────────────────────────────────── */}
        {phase === "installing" && (
          <div className="space-y-4">
            {/* Progress bar */}
            <div className="relative w-full h-2.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full bg-primary",
                  "transition-[width] duration-500 ease-out"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Percentage + message */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-foreground font-medium">
                {progress}%
              </p>
              <p className="text-xs text-muted-foreground truncate max-w-[70%] text-right">
                {message}
              </p>
            </div>

            {/* Spinner row */}
            <div className="flex items-center gap-2 text-muted-foreground pt-2">
              <Loader2
                size={14}
                className="animate-spin"
                strokeWidth={2}
              />
              <span className="text-xs">
                This may take a few minutes — please don't close the app.
              </span>
            </div>
          </div>
        )}

        {/* ── Phase: Error ────────────────────────────────────────── */}
        {phase === "error" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
              <p className="text-sm text-destructive font-medium mb-1">
                Installation failed
              </p>
              <p className="text-xs text-destructive/80 break-words">
                {errorMsg}
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={handleInstall}
            >
              <Download size={16} />
              Retry Installation
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function DepRow({
  label,
  icon: Icon,
  installed,
}: {
  label: string;
  icon: React.ElementType;
  installed: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors",
        installed
          ? "border-emerald-500/20 bg-emerald-500/5"
          : "border-destructive/20 bg-destructive/5"
      )}
    >
      <Icon
        size={16}
        className={cn(
          "shrink-0",
          installed ? "text-emerald-500" : "text-destructive"
        )}
        strokeWidth={1.75}
      />
      <span className="flex-1 text-sm font-medium text-foreground">
        {label}
      </span>
      {installed ? (
        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
      ) : (
        <XCircle size={16} className="text-destructive shrink-0" />
      )}
    </div>
  );
}
