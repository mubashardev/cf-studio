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
          
          if (latestChangelog) {
            const currentV = appVersion.version.replace(/^v/, "");
            const latestV = latestChangelog.version.replace(/^v/, "");
            
            const vToArr = (v: string) => v.split('.').map(n => parseInt(n || "0"));
            const currentArr = vToArr(currentV);
            const latestArr = vToArr(latestV);
            
            for (let i = 0; i < 3; i++) {
              if (latestArr[i] > currentArr[i]) {
                isActuallyNewer = true;
                break;
              }
              if (latestArr[i] < currentArr[i]) break;
            }

            // Even if not newer, store it as the 'latest' version we know about
            if (!isActuallyNewer) {
              setUpdate({
                version: latestChangelog.version,
                body: [
                  ...(latestChangelog.features || []),
                  ...(latestChangelog.fixes || [])
                ].join("\n"),
                date: latestChangelog.date || ""
              } as any);
            }
          }
        }

      // 2. Try native check to get the Update object for downloading (requires valid manifest)
      let manifest: Update | null = null;
      try {
        manifest = await check();
      } catch (nativeErr) {
        console.warn("Native check failed, falling back to manual detection:", nativeErr);
        // If it's a dev build or missing signature, we'll see it here
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
          body: [
            ...(latestChangelog.features || []),
            ...(latestChangelog.fixes || [])
          ].join("\n"),
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

    console.log("Starting downloadUpdate for:", activeUpdate);
    setStatus("downloading");
    setDownloadProgress(0);

    let unlistenProgress: (() => void) | null = null;

    try {
      const { listen } = await import('@tauri-apps/api/event');
      unlistenProgress = await listen<number>("update-download-progress", (event) => {
        setDownloadProgress(Math.round(event.payload));
      });
      console.log("Progress listener established");

      if (activeUpdate.isManualDetection) {
        const isMac = navigator.platform.toLowerCase().includes('mac');
        const isWin = navigator.platform.toLowerCase().includes('win');
        const isArm = navigator.userAgent.includes('arm64') || (navigator.userAgent.includes('AppleWebKit') && !navigator.userAgent.includes('Intel'));
        
        const ver = activeUpdate.version;
        console.log(`Resolving assets for v${ver} on ${isMac ? 'mac' : isWin ? 'win' : 'linux'} (${isArm ? 'arm64' : 'x64'})`);

        // Fetch release metadata to find exact asset names
        const relResponse = await fetch(`https://api.github.com/repos/mubashardev/cf-studio/releases/tags/v${ver}`);
        if (!relResponse.ok) {
           throw new Error(`Failed to fetch release metadata for v${ver}: ${relResponse.statusText}`);
        }
        
        const releaseData = await relResponse.json();
        const assets = releaseData.assets || [];
        
        let targetAsset = null;
        if (isMac) {
          // Look for .dmg with matching arch
          targetAsset = assets.find((a: any) => a.name.endsWith('.dmg') && a.name.includes(isArm ? 'aarch64' : 'x64'));
          // Fallback to any .dmg if arch-specific not found
          if (!targetAsset) targetAsset = assets.find((a: any) => a.name.endsWith('.dmg'));
        } else if (isWin) {
          // Look for .msi or -setup.exe
          targetAsset = assets.find((a: any) => a.name.endsWith('.msi') || a.name.endsWith('-setup.exe'));
        } else {
          // Look for .AppImage
          targetAsset = assets.find((a: any) => a.name.endsWith('.AppImage'));
        }

        if (!targetAsset) {
          throw new Error(`No compatible binary found in v${ver} release for your platform.`);
        }

        const binaryUrl = targetAsset.browser_download_url;
        const filename = targetAsset.name;

        console.log("Resolved asset:", filename, "URL:", binaryUrl);

        const destPath = await invoke("download_update_binary", { url: binaryUrl, filename }) as string;
        console.log("Download finished to:", destPath);
        setDownloadProgress(100);
        
        try {
          await invoke("fix_mac_quarantine");
        } catch (e) {
          console.error("Quarantine fix failed (non-critical):", e);
        }

        setError("Update ready! Installer launched automatically.");
        setStatus("available");
      } else {
        await (activeUpdate as Update).downloadAndInstall((event) => {
          if (event.event === "Finished") setDownloadProgress(100);
        });
        
        try {
          await invoke("fix_mac_quarantine");
        } catch (e) {
          console.error("Quarantine fix failed:", e);
        }

        await relaunch();
      }
    } catch (err) {
      console.error("Download failure:", err);
      const msg = String(err);
      if (msg.includes("404")) {
        setError("Update assets not found. The v" + activeUpdate.version + " release might not be published yet.");
      } else if (msg.includes("not allowed") || msg.includes("not found")) {
        setError(`Security error: ${msg}. Please check capabilities/default.json.`);
      } else {
        setError(msg);
      }
      setStatus("error");
    } finally {
      if (unlistenProgress) {
        console.log("Cleaning up listener");
        unlistenProgress();
      }
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
