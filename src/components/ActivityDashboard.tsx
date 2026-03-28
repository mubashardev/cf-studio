import { useEffect, useState, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { 
  Terminal, 
  MousePointer2, 
  Search, 
  ChevronLeft, 
  ChevronRight,
  Zap,
  Activity,
  Clock,
  Filter,
  Layers
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";

interface QueryHistoryEntry {
  id: number;
  account_id: string;
  query_text: string;
  database_id: string;
  session_id: string;
  execution_source: string;
  table_name: string | null;
  rows_read: number;
  result_data: string | null;
  timestamp: string;
}

interface GlobalStats {
  total_queries: number;
  total_reads: number;
}

const PAGE_SIZE = 50;

export function ActivityDashboard() {
  const activeAccount = useAppStore(state => state.activeAccount);
  const databases = useAppStore(state => state.databases);
  
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalStats>({ total_queries: 0, total_reads: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedDb, setSelectedDb] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(0);

  const fetchHistory = useCallback(async () => {
    if (!activeAccount?.id) return;
    try {
      setLoading(true);
      const [data, stats] = await Promise.all([
        invoke<QueryHistoryEntry[]>("get_paginated_history", { 
          accountId: activeAccount.id,
          databaseId: selectedDb === "all" ? null : selectedDb,
          limit: PAGE_SIZE,
          offset: currentPage * PAGE_SIZE 
        }),
        invoke<GlobalStats>("get_global_stats", {
          accountId: activeAccount.id
        })
      ]);
      setHistory(data);
      setGlobalStats(stats);
    } catch (error) {
      console.error("Failed to fetch history:", error);
    } finally {
      setLoading(false);
    }
  }, [activeAccount?.id, selectedDb, currentPage]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const filteredHistory = useMemo(() => {
    return history.filter(item => 
      item.query_text.toLowerCase().includes(search.toLowerCase()) ||
      item.database_id.toLowerCase().includes(search.toLowerCase()) ||
      (item.table_name && item.table_name.toLowerCase().includes(search.toLowerCase()))
    );
  }, [history, search]);

  const groupedBySession = useMemo(() => {
    const groups: Record<string, QueryHistoryEntry[]> = {};
    for (const item of filteredHistory) {
      const sid = item.session_id || "default";
      if (!groups[sid]) groups[sid] = [];
      groups[sid].push(item);
    }
    return Object.entries(groups).sort((a, b) => {
      const tA = new Date(a[1][0]?.timestamp).getTime();
      const tB = new Date(b[1][0]?.timestamp).getTime();
      return tB - tA;
    });
  }, [filteredHistory]);

  const formatNumber = (num: number) => new Intl.NumberFormat().format(num);

  return (
    <div className="flex flex-col h-screen bg-[#09090b] text-zinc-100 select-none overflow-hidden font-sans">
      {/* ── Metric Banner ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 bg-gradient-to-b from-zinc-900/50 to-transparent border-b border-zinc-800/50">
        <Card className="bg-zinc-900/40 border-zinc-800/50 backdrop-blur-sm group hover:border-primary/30 transition-all">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1">Lifetime Rows Read</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight font-mono text-white">
                  {formatNumber(globalStats.total_reads)}
                </span>
                <span className="text-xs text-zinc-500 font-medium">ROWS</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500 group-hover:scale-110 transition-transform">
              <Zap size={24} fill="currentColor" className="opacity-80" />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-zinc-900/40 border-zinc-800/50 backdrop-blur-sm group hover:border-primary/30 transition-all">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 mb-1">Total Queries Executed</p>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight font-mono text-white">
                  {formatNumber(globalStats.total_queries)}
                </span>
                <span className="text-xs text-zinc-500 font-medium">OPS</span>
              </div>
            </div>
            <div className="p-3 rounded-2xl bg-blue-500/10 text-blue-500 group-hover:scale-110 transition-transform">
              <Activity size={24} className="opacity-80" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Filtering & Tabs ── */}
      <div className="px-6 py-4 flex flex-col gap-4 border-b border-zinc-800/50 bg-zinc-950/50">
        <div className="flex items-center justify-between gap-4">
          <Tabs value={selectedDb} onValueChange={(v) => { setSelectedDb(v); setCurrentPage(0); }} className="w-full">
            <ScrollArea className="w-full whitespace-nowrap">
              <TabsList className="bg-zinc-900/50 border border-zinc-800/50 p-1 mb-1 inline-flex w-max min-w-full">
                <TabsTrigger value="all" className="text-xs px-4 py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-white transition-all">
                  All Databases
                </TabsTrigger>
                {databases.map(db => (
                  <TabsTrigger key={db.uuid} value={db.uuid} className="text-xs px-4 py-1.5 data-[state=active]:bg-zinc-800 data-[state=active]:text-white transition-all">
                    {db.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </ScrollArea>
          </Tabs>

          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
            <Input 
              placeholder="Search history..." 
              className="h-9 pl-9 bg-zinc-900/50 border-zinc-800/50 focus:border-zinc-700 focus:ring-0 text-xs placeholder:text-zinc-600"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── History List ── */}
      <div className="flex-1 min-h-0 bg-[#09090b]">
        <ScrollArea className="h-full">
          <div className="max-w-5xl mx-auto p-6">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-24 gap-4">
                <div className="w-8 h-8 border-2 border-zinc-800 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-zinc-500 font-medium animate-pulse">Loading activity logs...</p>
              </div>
            ) : groupedBySession.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 border-2 border-dashed border-zinc-800/50 rounded-3xl bg-zinc-900/10">
                <div className="p-4 rounded-full bg-zinc-900/50 text-zinc-700 mb-4">
                  <Filter size={32} strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-zinc-400">No activity found</h3>
                <p className="text-xs text-zinc-600 mt-1">Try adjusting your filters or database selection.</p>
              </div>
            ) : (
              <div className="space-y-12 pb-12">
                {groupedBySession.map(([sessionId, items]) => (
                  <div key={sessionId} className="space-y-4">
                    <div className="flex items-center gap-4 group">
                      <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900/80 border border-zinc-800/50 shadow-sm transition-colors group-hover:border-zinc-700">
                        <Clock size={12} className="text-zinc-500" />
                        <span className="text-[10px] font-bold text-zinc-400 font-mono tracking-tight uppercase underline decoration-zinc-800 underline-offset-4">
                          Session: {sessionId.slice(0, 8)}...
                        </span>
                        <span className="text-[10px] text-zinc-600 font-medium ml-1">
                          {new Date(items[0].timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px flex-1 bg-gradient-to-r from-zinc-800/50 to-transparent" />
                    </div>

                    <div className="grid gap-3">
                      {items.map((item) => (
                        <div 
                          key={item.id} 
                          className="group relative flex flex-col gap-3 p-4 rounded-2xl border border-zinc-800/40 bg-zinc-900/20 hover:bg-zinc-900/40 transition-all hover:border-zinc-700/60 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-3">
                              {item.execution_source === "UI_ACTION" ? (
                                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
                                  <MousePointer2 size={14} strokeWidth={2.5} />
                                </div>
                              ) : (
                                <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                  <Terminal size={14} strokeWidth={2.5} />
                                </div>
                              )}
                              
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <Badge variant="outline" className={cn(
                                    "h-5 px-1.5 text-[9px] font-bold tracking-wider",
                                    item.execution_source === "UI_ACTION" 
                                      ? "bg-purple-500/5 text-purple-400 border-purple-500/20" 
                                      : "bg-blue-500/5 text-blue-400 border-blue-500/20"
                                  )}>
                                    {item.execution_source}
                                  </Badge>
                                  {item.table_name && (
                                    <Badge variant="outline" className="h-5 px-1.5 text-[9px] bg-zinc-800/50 text-zinc-400 border-zinc-700/50 gap-1 capitalize">
                                      <Layers size={10} /> {item.table_name}
                                    </Badge>
                                  )}
                                  <span className={cn(
                                    "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded",
                                    item.rows_read > 1000 
                                      ? "bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse" 
                                      : "bg-zinc-800/50 text-zinc-500"
                                  )}>
                                    {item.rows_read} rows read
                                  </span>
                                </div>
                                <p className="text-[10px] text-zinc-500">
                                  {new Date(item.timestamp).toLocaleTimeString()} • {databases.find(d => d.uuid === item.database_id)?.name || "Unknown DB"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="relative overflow-hidden rounded-xl border border-zinc-800/50 bg-[#0c0c0e]">
                            <pre className="p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-32 scrollbar-thin scrollbar-thumb-zinc-800">
                              {item.query_text}
                            </pre>
                            <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-6 w-6 text-zinc-500 hover:text-white hover:bg-zinc-800/50" title="Copy SQL">
                                <Filter size={10} />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ── Pagination Footer ── */}
      <div className="px-6 py-4 border-t border-zinc-800/50 bg-zinc-950/80 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-medium font-mono uppercase tracking-widest">
          Page {currentPage + 1}
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" size="sm" 
            className="h-8 gap-1 border-zinc-800 bg-transparent hover:bg-zinc-900 transition-all text-xs"
            onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
            disabled={currentPage === 0 || loading}
          >
            <ChevronLeft size={14} />
            Prev
          </Button>
          <Button 
            variant="outline" size="sm" 
            className="h-8 gap-1 border-zinc-800 bg-transparent hover:bg-zinc-900 transition-all text-xs"
            onClick={() => setCurrentPage(p => p + 1)}
            disabled={history.length < PAGE_SIZE || loading}
          >
            Next
            <ChevronRight size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}
