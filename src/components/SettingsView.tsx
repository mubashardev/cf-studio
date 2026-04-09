import { useState, useMemo, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { invoke } from "@tauri-apps/api/core";
import { useAppStore } from "@/store/useAppStore";
import { useTheme } from "@/components/ThemeProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Monitor, 
  Moon, 
  RefreshCw, 
  Sun, 
  ExternalLink, 
  Shield, 
  Palette, 
  Settings2, 
  Info, 
  Download,
  CheckCircle2,
  Zap,
  Globe,
  Mail,
  User,
  ArrowRight,
  AlertTriangle,
  Database
} from "lucide-react";
import appVersion from "../../package.json";
import changelogsData from "../../changelogs/changelogs.json";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { useUpdater } from "@/hooks/useUpdater";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SettingsView() {
  const { theme, setTheme } = useTheme();
  const userProfile = useAppStore(s => s.userProfile);
  const cloudflareAccountId = useAppStore(s => s.cloudflareAccountId);
  const activeAccount = useAppStore(s => s.activeAccount);
  const tableDensity = useAppStore(s => s.tableDensity);
  const setTableDensity = useAppStore(s => s.setTableDensity);
  const privacySettings = useAppStore(s => s.privacySettings);
  const setPrivacySettings = useAppStore(s => s.setPrivacySettings);
  const showTableColumnCounts = useAppStore(s => s.showTableColumnCounts);
  const setShowTableColumnCounts = useAppStore(s => s.setShowTableColumnCounts);
  const autoUpdate = useAppStore(s => s.autoUpdate);
  const setAutoUpdate = useAppStore(s => s.setAutoUpdate);
  const saveQueryResultsEnabled = useAppStore(s => s.saveQueryResultsEnabled);
  const setSaveQueryResultsEnabled = useAppStore(s => s.setSaveQueryResultsEnabled);
  const saveQueryResultsRowLimit = useAppStore(s => s.saveQueryResultsRowLimit);
  const setSaveQueryResultsRowLimit = useAppStore(s => s.setSaveQueryResultsRowLimit);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const { toast } = useToast();
  const { status, update, downloadProgress, error, checkForUpdates, downloadUpdate } = useUpdater();

  // Show toast on update error
  useEffect(() => {
    if (error && status === "error") {
      toast({
        title: "Update Failed",
        description: error,
        variant: "destructive",
      });
    }
  }, [error, status, toast]);

  const handleRefreshConnection = async () => {
    setIsRefreshing(true);
    try {
      await invoke<any>("refresh_wrangler_token");
      // App store will be updated via watcher
    } catch (e) {
      console.error("Failed to refresh token", e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const currentChangelog = useMemo(() => {
    return changelogsData.find(c => c.version === appVersion.version);
  }, []);

  const nextChangelog = useMemo(() => {
    if (!update) return null;
    return changelogsData.find(c => c.version === update.version);
  }, [update]);

  return (
    <ScrollArea className="h-full">
      <div className="max-w-5xl mx-auto py-8 px-6 space-y-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-muted-foreground">Manage your application preferences and Cloudflare connection.</p>
        </div>
        
        <Tabs defaultValue="general" className="flex flex-col md:flex-row gap-10">
          <TabsList className="flex md:flex-col h-auto justify-start bg-transparent space-y-1 p-0 w-full md:w-56 shrink-0">
            <TabsTrigger value="general" className="w-full justify-start gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
              <Settings2 size={16} />
              General
            </TabsTrigger>
            <TabsTrigger value="appearance" className="w-full justify-start gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
              <Palette size={16} />
              Appearance
            </TabsTrigger>
            <TabsTrigger value="d1" className="w-full justify-start gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
              <Database size={16} />
              D1 Database
            </TabsTrigger>
            <TabsTrigger value="privacy" className="w-full justify-start gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
              <Shield size={16} />
              Privacy
            </TabsTrigger>
            <TabsTrigger value="updates" className="w-full justify-start gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all relative">
              <Download size={16} />
              Updates
              {status === "available" && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 w-2 h-2 bg-primary rounded-full animate-pulse" />
              )}
            </TabsTrigger>
            <TabsTrigger value="about" className="w-full justify-start gap-2 h-10 px-4 data-[state=active]:bg-primary/10 data-[state=active]:text-primary transition-all">
              <Info size={16} />
              About
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 min-w-0">
            {/* General Tab */}
            <TabsContent value="general" className="m-0 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card className="overflow-hidden border-none shadow-md bg-muted/20">
                <CardHeader className="pb-4">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe size={18} className="text-primary" />
                    <CardTitle className="text-lg">Cloudflare Account</CardTitle>
                  </div>
                  <CardDescription>Configure how CF Studio connects to your Cloudflare infrastructure.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between p-5 border border-border/50 rounded-xl bg-background/50 backdrop-blur-sm">
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500">
                        <Zap size={20} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">Wrangler Session</p>
                        <p className="text-xs text-muted-foreground">Connected via local CLI configuration</p>
                      </div>
                    </div>
                    <Button variant="secondary" size="sm" onClick={handleRefreshConnection} disabled={isRefreshing} className="h-8">
                      <RefreshCw className={cn("mr-2 h-3.5 w-3.5", isRefreshing && "animate-spin")} />
                      Refresh Token
                    </Button>
                  </div>

                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <User size={14} />
                        <Label className="text-xs font-semibold uppercase tracking-wider">Account ID</Label>
                      </div>
                      <div className="group relative px-3 py-2 text-sm bg-background border border-border/50 rounded-lg font-mono truncate select-all h-10 flex items-center transition-colors hover:border-primary/30">
                        {activeAccount?.id || cloudflareAccountId || "Not available"}
                      </div>
                    </div>
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail size={14} />
                        <Label className="text-xs font-semibold uppercase tracking-wider">User Email</Label>
                      </div>
                      <div className="px-3 py-2 text-sm bg-background border border-border/50 rounded-lg font-mono truncate h-10 flex items-center">
                        {userProfile?.email || "Fetching..."}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-md bg-muted/20">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">App Behavior</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between py-2">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Automatic Updates</Label>
                      <p className="text-xs text-muted-foreground">Download and install updates automatically on startup.</p>
                    </div>
                    <Switch checked={autoUpdate} onCheckedChange={setAutoUpdate} />
                  </div>
                </CardContent>
              </Card>

            </TabsContent>

            {/* Appearance Tab */}
            <TabsContent value="appearance" className="m-0 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card className="border-none shadow-md bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-lg">Theme</CardTitle>
                  <CardDescription>Choose your preferred interface style.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { value: "light", label: "Light", icon: Sun, color: "bg-orange-500/10 text-orange-500" },
                      { value: "dark", label: "Dark", icon: Moon, color: "bg-blue-500/10 text-blue-500" },
                      { value: "system", label: "System", icon: Monitor, color: "bg-zinc-500/10 text-zinc-500" },
                    ].map(({ value, label, icon: Icon, color }) => (
                      <button
                        key={value}
                        onClick={() => setTheme(value as typeof theme)}
                        className={cn(
                          "group relative flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border-2 transition-all duration-200",
                          theme === value 
                            ? "border-primary bg-primary/5 ring-4 ring-primary/10" 
                            : "border-border/50 bg-background/50 hover:border-primary/30 hover:bg-background"
                        )}
                      >
                        <div className={cn("p-2 rounded-full transition-transform group-hover:scale-110", color)}>
                          <Icon size={24} />
                        </div>
                        <span className={cn("text-sm font-semibold", theme === value ? "text-primary" : "text-muted-foreground")}>{label}</span>
                        {theme === value && <CheckCircle2 size={14} className="absolute top-2 right-2 text-primary" />}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-none shadow-md bg-muted/20">
                <CardHeader>
                  <CardTitle className="text-lg">Listings & Tables</CardTitle>
                  <CardDescription>Optimize how data is displayed.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-3">
                    <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Row Density</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { value: "comfortable", label: "Comfortable", desc: "More whitespace" },
                        { value: "compact", label: "Compact", desc: "More rows" },
                      ].map(({ value, label, desc }) => (
                        <button
                          key={value}
                          onClick={() => setTableDensity(value as any)}
                          className={cn(
                            "flex flex-col items-start p-4 rounded-xl border-2 transition-all p-4",
                            tableDensity === value 
                              ? "border-primary bg-primary/5" 
                              : "border-border/50 bg-background/50 hover:border-primary/30"
                          )}
                        >
                          <span className={cn("text-sm font-semibold", tableDensity === value ? "text-primary" : "text-foreground")}>{label}</span>
                          <span className="text-xs text-muted-foreground">{desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-border/50">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Show Column Counts</Label>
                      <p className="text-xs text-muted-foreground font-mono italic">Show table column metrics in sidebar</p>
                    </div>
                    <Switch checked={showTableColumnCounts} onCheckedChange={setShowTableColumnCounts} />
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* D1 Database Tab */}
            <TabsContent value="d1" className="m-0 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card className="border-none shadow-md bg-muted/20">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Query History</CardTitle>
                  <CardDescription>Control whether D1 query results are stored in history.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Save Query Results</Label>
                      <p className="text-xs text-muted-foreground">
                        Store result rows alongside each history entry for later review.
                      </p>
                    </div>
                    <Switch
                      checked={saveQueryResultsEnabled}
                      onCheckedChange={(enabled) => setSaveQueryResultsEnabled(!!enabled)}
                    />
                  </div>

                  <div className={cn("grid gap-4 transition-all duration-300", !saveQueryResultsEnabled && "opacity-40 grayscale pointer-events-none")}>
                    <div className="flex items-center justify-between gap-4">
                      <div className="space-y-1">
                        <Label className="text-sm font-medium">Rows Saved Per Query</Label>
                        <p className="text-xs text-muted-foreground">
                          Limit how many rows are stored for each query result.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            min={1}
                            step={1}
                            value={saveQueryResultsRowLimit ?? 50}
                            onChange={(e) => {
                              const next = Number.parseInt(e.target.value, 10);
                              if (!Number.isFinite(next)) return;
                              setSaveQueryResultsRowLimit(Math.max(1, next));
                            }}
                            className="h-9 w-24 text-right"
                            disabled={saveQueryResultsRowLimit == null}
                          />
                          <span className="text-xs text-muted-foreground">rows</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs text-muted-foreground">No limit</Label>
                          <Switch
                            checked={saveQueryResultsRowLimit == null}
                            onCheckedChange={(checked) =>
                              setSaveQueryResultsRowLimit(checked ? null : 50)
                            }
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-600">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <p className="text-xs">
                        Saving query results increases local app size over time. Large result sets can grow storage quickly.
                      </p>
                    </div>

                    {saveQueryResultsRowLimit == null && (
                      <div className="flex items-start gap-2 rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-red-500">
                        <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                        <p className="text-xs">
                          No limit can consume a lot of disk space. Use with caution.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Privacy Tab */}
            <TabsContent value="privacy" className="m-0 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card className="border-none shadow-md bg-muted/20">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg">Privacy Shield</CardTitle>
                      <CardDescription>Obfuscate sensitive project data from prying eyes.</CardDescription>
                    </div>
                    <Switch checked={privacySettings.enabled} onCheckedChange={(c) => setPrivacySettings({ enabled: c })} />
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                   <div className={cn("grid gap-4 transition-all duration-300", !privacySettings.enabled && "opacity-40 grayscale pointer-events-none")}>
                      {[
                        { id: "accountInfo", label: "Account Name & Email", desc: "Blurs identifying account details" },
                        { id: "databaseNames", label: "Database Names", desc: "Obfuscates D1 database identifiers" },
                        { id: "databaseIds", label: "Database IDs", desc: "Hides unique resource UUIDs" },
                        { id: "tableNames", label: "Table Names", desc: "Blurs names in the explorer" },
                        { id: "r2BucketNames", label: "R2 Bucket Names", desc: "Hides storage bucket identifiers" },
                        { id: "r2FileNames", label: "R2 File/Object Names", desc: "Obfuscates object keys in listings" },
                      ].map((item) => (
                        <div key={item.id} className="flex items-center space-x-3 p-3 rounded-lg hover:bg-background/40 transition-colors">
                          <Checkbox 
                            id={`privacy-${item.id}`} 
                            checked={(privacySettings as any)[item.id]} 
                            onCheckedChange={(c) => setPrivacySettings({ [item.id]: !!c })} 
                          />
                          <div className="grid gap-0.5 leading-none">
                            <label htmlFor={`privacy-${item.id}`} className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer">{item.label}</label>
                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                          </div>
                        </div>
                      ))}

                      <div className="pt-6 border-t border-border/50 mt-2 space-y-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                              <Label className="text-sm font-medium">Blur Intensity</Label>
                              <p className="text-xs text-muted-foreground">Adjust how much the sensitive data is blurred.</p>
                            </div>
                            <Badge variant="secondary" className="font-mono">{privacySettings.blurAmount}px</Badge>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Low</span>
                            <input 
                              type="range" 
                              min="0" 
                              max="20" 
                              step="1"
                              value={privacySettings.blurAmount}
                              onChange={(e) => setPrivacySettings({ blurAmount: parseInt(e.target.value, 10) })}
                              className="flex-1 h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary border-none focus:ring-1 focus:ring-primary/20"
                            />
                            <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">High</span>
                          </div>
                        </div>

                        <div className="p-6 rounded-2xl bg-muted/30 border border-dashed border-border flex flex-col items-center justify-center gap-4">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-1">Privacy Shield Preview</p>
                          <div className="flex flex-col items-center gap-3">
                             <div className="text-2xl font-black tracking-tight relative">
                                <span style={{ filter: `blur(${privacySettings.blurAmount}px)` }} className="transition-all duration-300">
                                  example-domain.com
                                </span>
                                {privacySettings.blurAmount === 0 && (
                                   <span className="absolute -top-6 -right-6 text-[10px] bg-red-500/10 text-red-500 px-2 py-0.5 rounded-full font-bold animate-bounce border border-red-500/20">Visible</span>
                                )}
                             </div>
                             <p className="text-xs text-muted-foreground italic max-w-[200px] text-center">
                               {privacySettings.blurAmount > 0 
                                 ? "Sensitive domain names will look like this across the app." 
                                 : "Blur is disabled. Data will be fully visible."}
                             </p>
                          </div>
                        </div>
                      </div>
                   </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Updates Tab */}
            <TabsContent value="updates" className="m-0 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card className="border-none shadow-md bg-muted/20 overflow-hidden">
                <CardHeader className="pb-0">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <CardTitle className="text-lg">Software Updates</CardTitle>
                      <CardDescription>Keep your studio up to date with the latest features.</CardDescription>
                    </div>
                    <Badge variant={status === "available" ? "default" : "secondary"} className="rounded-full px-3">
                      {status === "available" ? "Update Available" : status === "checking" ? "Checking..." : "Up to date"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-8">
                  <div className="flex flex-col items-center justify-center py-6 space-y-6 border-b border-border/50 pb-8">
                    <div className="flex items-center gap-8 md:gap-12 text-center">
                      <div className="space-y-1">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Current Version</p>
                        <p className="text-2xl font-mono font-bold">{appVersion.version.replace(/^v/, "")}</p>
                      </div>

                      {status === "available" && (
                        <>
                          <ArrowRight className="text-muted-foreground/30" />
                          <div className="space-y-1">
                            <p className="text-[10px] uppercase font-bold text-primary tracking-widest">Newest Version</p>
                            <p className="text-2xl font-mono font-bold">{update?.version?.replace(/^v/, "")}</p>
                          </div>
                        </>
                      )}
                    </div>
                    
                    <div className="w-full max-w-sm">
                      {status === "downloading" ? (
                        <div className="space-y-3">
                           <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${downloadProgress}%` }} />
                           </div>
                           <p className="text-xs text-center font-medium text-primary">Installing update... {downloadProgress}%</p>
                        </div>
                      ) : (
                        <Button 
                          className="w-full rounded-xl h-12 text-base font-bold shadow-lg shadow-primary/10 transition-all active:scale-[0.98]" 
                          variant={status === "available" ? "default" : "secondary"}
                          disabled={status === "checking"}
                          onClick={() => {
                            console.log("Download button clicked, status:", status);
                            if (status === "available") {
                              downloadUpdate();
                            } else {
                              checkForUpdates();
                            }
                          }}
                        >
                          {status === "checking" ? (
                            <>
                              <RefreshCw size={18} className="mr-2 animate-spin" />
                              Checking...
                            </>
                          ) : status === "available" ? (
                            <>
                              <Download size={18} className="mr-2" />
                              {update?.isManualDetection ? "Download Update" : "Install Update"}
                            </>
                          ) : (
                            <>
                              <RefreshCw size={18} className="mr-2" />
                              Check for Updates
                            </>
                          )}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="pt-6 space-y-4">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                       <CheckCircle2 size={16} className="text-primary" />
                       Changelog for {update?.version || appVersion.version}
                    </h3>
                    <div className="space-y-4 p-4 rounded-xl bg-background/50 border border-border/50">
                        {update?.isManualDetection ? (
                          <div className="space-y-4">
                            {update.body.split("\n").map((f: string, i: number) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-primary font-bold opacity-50 select-none">•</span>
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        ) : nextChangelog ? (
                          <div className="space-y-4">
                            {[...(nextChangelog.features || []), ...(nextChangelog.fixes || [])].map((f, i) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-primary font-bold opacity-50 select-none">•</span>
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-4">
                            {[...(currentChangelog?.features || []), ...(currentChangelog?.fixes || [])].map((f, i) => (
                              <div key={i} className="flex gap-3 text-sm">
                                <span className="text-primary font-bold opacity-50 select-none">•</span>
                                <span>{f}</span>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* About Tab */}
            <TabsContent value="about" className="m-0 space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
              <Card className="border-none shadow-xl bg-gradient-to-br from-primary/5 to-primary/10 overflow-hidden">
                <CardContent className="p-16 flex flex-col items-center justify-center text-center space-y-8 relative">
                  <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_top_right,var(--primary-muted),transparent)] opacity-20" />
                  
                  <div className="relative">
                    <div className="absolute -inset-4 bg-primary/20 blur-2xl rounded-full animate-pulse" />
                    <img
                      src={theme === "dark" ? "/app-icon-dark.png" : "/app-icon.png"}
                      alt="CF Studio"
                      className="w-24 h-24 rounded-3xl shadow-2xl relative border-2 border-white/10"
                      draggable={false}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <h2 className="text-3xl font-black tracking-tight bg-gradient-to-b from-foreground to-foreground/70 bg-clip-text text-transparent">CF Studio</h2>
                    <p className="text-sm text-muted-foreground font-mono bg-background/50 py-1 px-3 rounded-full border border-border/50 inline-block">version {appVersion.version}</p>
                  </div>
                  
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    A high-performance native desktop client for modern Cloudflare workflows. 
                    Manage D1 databases and R2 storage with speed and elegance.
                  </p>
                  
                  <div className="flex gap-4">
                    <Button variant="outline" className="rounded-xl px-6 h-11 border-border/50 bg-background/50" onClick={() => open("https://github.com/mubashardev/cf-studio")}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      GitHub
                    </Button>
                    <Button variant="outline" className="rounded-xl px-6 h-11 border-border/50 bg-background/50" onClick={() => open("https://cfstudio.dev")}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Website
                    </Button>
                  </div>
                  
                  <div className="pt-8 text-xs text-muted-foreground opacity-50">
                    © {new Date().getFullYear()} CF Studio. All rights reserved.
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </ScrollArea>
  );
}
