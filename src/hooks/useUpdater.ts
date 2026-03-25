import { useCallback, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import appVersion from "../../package.json";

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "up-to-date" | "error";

export function useUpdater() {
  const status = useAppStore((s) => s.updateStatus);
  const update = useAppStore((s) => s.updateData);
  const downloadProgress = useAppStore((s) => s.downloadProgress);
  const error = useAppStore((s) => s.updateError);
  const autoUpdate = useAppStore((s) => s.autoUpdate);

  const setStatus = useAppStore((s) => s.setUpdateStatus);
  const setUpdate = useAppStore((s) => s.setUpdateData);
  const setDownloadProgress = useAppStore((s) => s.setDownloadProgress);
  const setError = useAppStore((s) => s.setUpdateError);

  const checkForUpdates = useCallback(async (isAutoCheck = false) => {
    setStatus("checking");
    setError(null);
    try {
      // 1. Try manual check against changelogs.json for raw version notification (reliable)
      const response = await fetch(`https://raw.githubusercontent.com/mubashardev/cf-studio/main/changelogs/changelogs.json?t=${Date.now()}`, {
        cache: "no-store"
      });
      
      let isActuallyNewer = false;
      let latestChangelog = null;

      if (response.ok) {
        const data = await response.json();
        latestChangelog = data[0];
        const currentV = appVersion.version.replace(/^v/, "");
        const latestV = latestChangelog.version.replace(/^v/, "");
        
        if (latestChangelog && latestV !== currentV) {
          isActuallyNewer = true;
        }
      }

      // 2. Try native check to get the Update object for downloading (requires valid manifest)
      let manifest: Update | null = null;
      try {
        manifest = await check();
      } catch (nativeErr) {
        console.warn("Native check failed, falling back to manual detection:", nativeErr);
      }

      if (manifest) {
        setUpdate(manifest);
        setStatus("available");
        if (isAutoCheck && autoUpdate) {
          downloadUpdate(manifest);
        }
      } else if (isActuallyNewer) {
        // We found a newer version but native manifest is missing — still show it
        setStatus("available");
        setUpdate({
          version: latestChangelog.version,
          body: latestChangelog.features.join("\n"),
          date: latestChangelog.date || "",
          isManualDetection: true,
          installCommand: "curl -fsSL https://install.cfstudio.dev | bash"
        } as any); // Cast to any because `isManualDetection` is not part of the official `Update` type
      } else {
        setStatus("up-to-date");
      }
    } catch (err) {
      console.error("Failed to check for updates:", err);
      setError("Update service unavailable");
      setStatus("error");
    }
  }, [autoUpdate]);

  const downloadUpdate = useCallback(async (targetUpdate?: any) => {
    const activeUpdate = targetUpdate || update;
    if (!activeUpdate) return;

    if (activeUpdate.isManualDetection) {
       setError("Please run: " + activeUpdate.installCommand);
       return;
    }

    setStatus("downloading");
    setDownloadProgress(0);
    try {
      let downloaded = 0;
      let contentLength = 0;

      await (activeUpdate as Update).downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            contentLength = event.data.contentLength || 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (contentLength > 0) {
              setDownloadProgress(Math.round((downloaded / contentLength) * 100));
            }
            break;
          case "Finished":
            setDownloadProgress(100);
            break;
        }
      });
      
      // Before relaunching, try to clear the quarantine flag on macOS
      try {
        await invoke("fix_mac_quarantine");
      } catch (e) {
        console.error("Failed to fix quarantine:", e);
      }

      await relaunch();
    } catch (err) {
      console.error("Failed to download update:", err);
      setError(String(err));
      setStatus("error");
    }
  }, [update]);

  // Initial check on mount, or if status is idle (e.g., after an error or reset)
  useEffect(() => {
    if (status === "idle") {
      checkForUpdates(true);
    }
  }, [status, checkForUpdates]);

  return {
    status,
    update,
    downloadProgress,
    error,
    checkForUpdates,
    downloadUpdate,
  };
}
