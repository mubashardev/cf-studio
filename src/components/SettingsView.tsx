import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/components/ThemeProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Monitor, Moon, RefreshCw, Sun, ExternalLink } from "lucide-react";
import appVersion from "../../package.json";

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const userProfile = useAppStore(s => s.userProfile);
  const cloudflareAccountId = useAppStore(s => s.cloudflareAccountId);
  const activeAccount = useAppStore(s => s.activeAccount);
  const tableDensity = useAppStore(s => s.tableDensity);
  const setTableDensity = useAppStore(s => s.setTableDensity);
  const setCloudflareAccountId = useAppStore(s => s.setCloudflareAccountId);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshConnection = async () => {
    setIsRefreshing(true);
    try {
      const creds = await invoke<any>("refresh_wrangler_token");
      if (creds.account_id) {
        setCloudflareAccountId(creds.account_id);
      }
    } catch (e) {
      console.error("Failed to refresh token", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">Settings</h1>
      
      <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-6">
        <TabsList className="flex md:flex-col h-auto justify-start bg-transparent space-y-1 p-0 w-full md:w-48 overflow-x-auto shrink-0 border-b md:border-b-0 md:border-r border-border rounded-none pb-2 md:pb-0 md:pr-4">
          <TabsTrigger value="general" className="w-full justify-start data-[state=active]:bg-muted">General</TabsTrigger>
          <TabsTrigger value="appearance" className="w-full justify-start data-[state=active]:bg-muted">Appearance</TabsTrigger>
          <TabsTrigger value="about" className="w-full justify-start data-[state=active]:bg-muted">About</TabsTrigger>
        </TabsList>

        <div className="flex-1 min-w-0">
          <TabsContent value="general" className="m-0 space-y-6 animate-in fade-in-50 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>Cloudflare Connection</CardTitle>
                <CardDescription>Manage your Wrangler authentication state</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-3">
                    <div className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </div>
                    <div>
                      <p className="text-sm font-medium">Wrangler Connected</p>
                      <p className="text-xs text-muted-foreground">Authenticated via local config session</p>
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleRefreshConnection} disabled={isRefreshing}>
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
                    Refresh
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Cloudflare Account ID</Label>
                    <div className="px-3 py-2 text-sm bg-muted/50 rounded-md font-mono border border-border truncate text-muted-foreground select-all h-9 flex items-center">
                      {activeAccount?.id || cloudflareAccountId || "Not available"}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>User Email</Label>
                    <div className="px-3 py-2 text-sm bg-muted/50 rounded-md font-mono border border-border truncate text-muted-foreground h-9 flex items-center">
                      {userProfile?.email || "Fetching..."}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appearance" className="m-0 space-y-6 animate-in fade-in-50 duration-200">
            <Card>
              <CardHeader>
                <CardTitle>Appearance & Behavior</CardTitle>
                <CardDescription>Customize how CF Studio looks and feels on your machine</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Theme */}
                <div className="space-y-3">
                  <Label>Theme Preference</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { value: "light", label: "Light", icon: Sun },
                      { value: "dark", label: "Dark", icon: Moon },
                      { value: "system", label: "System", icon: Monitor },
                    ].map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value as typeof theme)}
                        className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                          theme === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <Icon size={20} />
                        <span className="text-sm font-medium">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Density */}
                <div className="space-y-3">
                  <Label>Data Table Density</Label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[
                      { value: "comfortable", label: "Comfortable", desc: "More padding, relaxed reading" },
                      { value: "compact", label: "Compact", desc: "Maximum data rows on screen" },
                    ].map(({ value, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setTableDensity(value as "compact" | "comfortable")}
                        className={`flex flex-col items-start p-4 rounded-xl border-2 transition-all text-left ${
                          tableDensity === value ? "border-primary bg-primary/5 text-foreground" : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        <span className="text-sm font-medium mb-1 text-foreground">{label}</span>
                        <span className="text-xs">{desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="about" className="m-0 space-y-6 animate-in fade-in-50 duration-200">
            <Card>
              <CardContent className="p-12 flex flex-col items-center justify-center text-center space-y-4">
                <img
                  src={theme === "dark" ? "/app-icon-dark.png" : "/app-icon.png"}
                  alt="CF Studio"
                  className="w-20 h-20 rounded-2xl shadow-lg"
                  draggable={false}
                />
                <div>
                  <h2 className="text-xl font-bold tracking-tight">CF Studio</h2>
                  <p className="text-sm text-muted-foreground mt-1 font-mono">v{appVersion.version}</p>
                </div>
                <p className="text-sm text-muted-foreground max-w-sm">
                  A native desktop client for managing Cloudflare D1 databases with a visual interface.
                </p>
                <div className="pt-2 flex gap-3">
                  <Button variant="outline" size="sm" onClick={() => open("https://github.com/mubashardev/cf-studio")}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    GitHub
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => open("https://cfstudio.dev")}>
                    <ExternalLink className="mr-2 h-3.5 w-3.5" />
                    Website
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground pt-4">
                  © {new Date().getFullYear()} CF Studio. All rights reserved.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}
