import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Pencil, Plus, Star, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useWebsiteSettings } from "@/hooks/useWebsiteSettings";
import { HeadlinerEditor } from "@/components/website/HeadlinerEditor";
import { TickerEditor } from "@/components/website/TickerEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const SITE = "https://www.cssportscards.com";
const WANTED_SPORTS = [
  "Football",
  "Men's Basketball",
  "Women's Basketball",
  "Baseball",
  "Hockey",
  "Soccer",
  "Other",
] as const;

type Wanted = {
  id: string;
  sport: string;
  position: string;
  player_name: string;
  sort_order: number;
  top_rank: number | null;
  stamp: string | null;
};
const MAX_TOP = 6;
const STAMP_IDEAS = ["ROOKIES · AUTOS", "GRADED · AUTOS", "ANY NUMBERED", "ROOKIES · /99 OR LESS", "VINTAGE · GRADED"];
type SiteShow = {
  id: string;
  name: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  kind: string;
};

/** "NOV 14", "DEC 11 – 13", "OCT 30 – NOV 1" — the same way the website prints dates. */
function showDateLabel(start: string, end: string | null): string {
  const d = (s: string) => new Date(`${s}T12:00:00`);
  const mon = (s: string) => d(s).toLocaleString("en-US", { month: "short" }).toUpperCase();
  const day = (s: string) => d(s).getDate();
  if (!end || end === start) return `${mon(start)} ${day(start)}`;
  return mon(start) === mon(end)
    ? `${mon(start)} ${day(start)} – ${day(end)}`
    : `${mon(start)} ${day(start)} – ${mon(end)} ${day(end)}`;
}

function todayET(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

function errorText(error: unknown): string {
  const msg = error instanceof Error ? error.message : String((error as { message?: string })?.message ?? "");
  if (msg.includes("website_wanted_unique")) return "That player is already on the list there.";
  if (msg.includes("TOP_TARGETS_FULL")) return `You already have ${MAX_TOP} top targets. Unstar one first.`;
  if (msg.includes("website_wanted_stamp_len")) return "Keep the stamp to 28 characters or fewer.";
  return msg || "Please try again.";
}

export default function WebsiteLists() {
  const { data: settings, isLoading } = useWebsiteSettings();
  const { isViewingAsMentor } = useMentorAccess();

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-32 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground md:text-3xl">Website</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Edit what cssportscards.com shows. Changes are live on the site within a minute.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : !settings ? (
        <div className="night-game-card p-4 text-muted-foreground md:p-6">
          This account doesn't run the website.
        </div>
      ) : (
        <Tabs defaultValue="headliner" className="space-y-4">
          <TabsList className="grid h-auto w-full grid-cols-2 sm:grid-cols-4">
            <TabsTrigger value="headliner" className="min-h-[44px]">Headliner</TabsTrigger>
            <TabsTrigger value="wanted" className="min-h-[44px]">Most Wanted</TabsTrigger>
            <TabsTrigger value="shows" className="min-h-[44px]">Shows</TabsTrigger>
            <TabsTrigger value="ticker" className="min-h-[44px]">Ticker</TabsTrigger>
          </TabsList>
          <TabsContent value="headliner">
            <HeadlinerEditor ownerId={settings.owner_user_id} readOnly={isViewingAsMentor} />
          </TabsContent>
          <TabsContent value="wanted">
            <WantedEditor ownerId={settings.owner_user_id} readOnly={isViewingAsMentor} />
          </TabsContent>
          <TabsContent value="shows">
            <ShowsEditor ownerId={settings.owner_user_id} readOnly={isViewingAsMentor} />
          </TabsContent>
          <TabsContent value="ticker">
            <TickerEditor readOnly={isViewingAsMentor} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Most Wanted
function WantedEditor({ ownerId, readOnly }: { ownerId: string; readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [player, setPlayer] = useState("");
  const [sport, setSport] = useState<string>("Football");
  const [position, setPosition] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["websiteWanted", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_wanted")
        .select("id, sport, position, player_name, sort_order, top_rank, stamp")
        .eq("user_id", ownerId);
      if (error) throw error;
      return (data || []) as Wanted[];
    },
  });

  // sport -> ordered positions -> players A–Z (same order as the website)
  const grouped = useMemo(() => {
    const out: { sport: string; positions: { name: string; players: Wanted[] }[] }[] = [];
    for (const s of WANTED_SPORTS) {
      const inSport = (rows || []).filter((r) => r.sport === s);
      if (!inSport.length) continue;
      const byPos = new Map<string, { name: string; order: number; players: Wanted[] }>();
      for (const r of inSport) {
        const key = r.position.toLowerCase();
        const g = byPos.get(key) ?? { name: r.position, order: r.sort_order, players: [] };
        g.order = Math.min(g.order, r.sort_order);
        g.players.push(r);
        byPos.set(key, g);
      }
      const positions = [...byPos.values()]
        .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
        .map((g) => ({ name: g.name, players: g.players.sort((a, b) => a.player_name.localeCompare(b.player_name)) }));
      out.push({ sport: s, positions });
    }
    return out;
  }, [rows]);

  const positionsForSport = useMemo(
    () => grouped.find((g) => g.sport === sport)?.positions.map((p) => p.name) ?? [],
    [grouped, sport],
  );

  const add = async () => {
    const name = player.trim().replace(/\s+/g, " ");
    const pos = position.trim().replace(/\s+/g, " ");
    if (!name || !pos) {
      toast({ title: "Enter the player and a position", variant: "destructive" });
      return;
    }
    // Reuse an existing position's spelling and order; a new position goes at the end of that sport.
    const existing = (rows || []).filter((r) => r.sport === sport);
    const samePos = existing.find((r) => r.position.toLowerCase() === pos.toLowerCase());
    const order = samePos ? samePos.sort_order : Math.max(0, ...existing.map((r) => r.sort_order)) + 10;
    setSaving(true);
    try {
      const { error } = await supabase.from("website_wanted").insert({
        user_id: ownerId,
        sport,
        position: samePos ? samePos.position : pos,
        player_name: name,
        sort_order: order,
      });
      if (error) throw error;
      setPlayer("");
      queryClient.invalidateQueries({ queryKey: ["websiteWanted"] });
      toast({ title: `${name} added to Most Wanted` });
    } catch (e) {
      toast({ title: "Couldn't add player", description: errorText(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Wanted) => {
    setRemoving(row.id);
    try {
      const { error } = await supabase.from("website_wanted").delete().eq("id", row.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["websiteWanted"] });
      toast({ title: `${row.player_name} removed` });
    } catch (e) {
      toast({ title: "Couldn't remove player", description: errorText(e), variant: "destructive" });
    } finally {
      setRemoving(null);
    }
  };

  const total = rows?.length ?? 0;
  const tops = useMemo(
    () => (rows || []).filter((r) => r.top_rank != null).sort((a, b) => (a.top_rank ?? 0) - (b.top_rank ?? 0)),
    [rows],
  );
  const [starring, setStarring] = useState<string | null>(null);
  const [stamps, setStamps] = useState<Record<string, string>>({});

  const toggleTop = async (row: Wanted) => {
    const on = row.top_rank == null;
    if (on && tops.length >= MAX_TOP) {
      toast({ title: `${MAX_TOP} top targets already`, description: "Unstar one first.", variant: "destructive" });
      return;
    }
    setStarring(row.id);
    try {
      const rank = on ? Math.max(0, ...tops.map((t) => t.top_rank ?? 0)) + 1 : null;
      const { error } = await supabase.from("website_wanted").update({ top_rank: rank }).eq("id", row.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["websiteWanted"] });
      toast({ title: on ? `${row.player_name} is a top target` : `${row.player_name} unstarred` });
    } catch (e) {
      toast({ title: "Couldn't change top targets", description: errorText(e), variant: "destructive" });
    } finally {
      setStarring(null);
    }
  };

  const saveStamp = async (row: Wanted, value: string) => {
    const next = value.trim().replace(/\s+/g, " ").toUpperCase();
    if (next === (row.stamp ?? "")) return;
    try {
      const { error } = await supabase.from("website_wanted").update({ stamp: next || null }).eq("id", row.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["websiteWanted"] });
      setStamps((m) => {
        const rest = { ...m };
        delete rest[row.id];
        return rest;
      });
      toast({ title: next ? `Stamp saved for ${row.player_name}` : `Stamp cleared for ${row.player_name}` });
    } catch (e) {
      toast({ title: "Couldn't save the stamp", description: errorText(e), variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="night-game-card space-y-3 p-4 md:p-6">
          <h2 className="text-lg font-bold text-foreground">Add a player</h2>
          <Input
            placeholder="Player name"
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            className="min-h-[44px]"
            maxLength={60}
            aria-label="Player name"
          />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select value={sport} onValueChange={(v) => { setSport(v); setPosition(""); }}>
              <SelectTrigger className="min-h-[44px]" aria-label="Sport">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WANTED_SPORTS.map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Position (pick or type a new one)"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              list="wanted-positions"
              className="min-h-[44px]"
              maxLength={40}
              aria-label="Position"
            />
            <datalist id="wanted-positions">
              {positionsForSport.map((p) => <option key={p} value={p} />)}
            </datalist>
          </div>
          {positionsForSport.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {positionsForSport.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPosition(p)}
                  className={`min-h-[36px] rounded-full border px-3 text-xs font-semibold ${
                    position.toLowerCase() === p.toLowerCase()
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
          <Button onClick={add} disabled={saving} className="min-h-[44px] w-full sm:w-auto">
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Add to Most Wanted
          </Button>
        </div>
      )}

      {total > 0 && (
        <div className="night-game-card space-y-3 p-4 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">Top targets ({tops.length}/{MAX_TOP})</h2>
            <p className="text-sm text-muted-foreground">
              These show as big Wanted posters at the top of the page. Tap the star next to a player below to add one.
            </p>
          </div>
          {tops.length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet. The page shows just the list until you star someone.</p>
          ) : (
            <ul className="space-y-3">
              {tops.map((r) => (
                <li key={r.id} className="rounded-lg border border-border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-semibold text-foreground">{r.player_name}</div>
                      <div className="text-xs uppercase text-muted-foreground">{r.sport}</div>
                    </div>
                    {!readOnly && (
                      <Button
                        variant="ghost"
                        onClick={() => toggleTop(r)}
                        disabled={starring === r.id}
                        className="min-h-[44px] text-muted-foreground"
                      >
                        {starring === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unstar"}
                      </Button>
                    )}
                  </div>
                  {readOnly ? (
                    r.stamp && <div className="mt-2 text-sm text-foreground">Stamp: {r.stamp}</div>
                  ) : (
                    <Input
                      className="mt-2 min-h-[44px] uppercase"
                      placeholder="Stamp, e.g. ROOKIES · AUTOS (optional)"
                      aria-label={`Stamp for ${r.player_name}`}
                      list="wanted-stamps"
                      maxLength={28}
                      value={stamps[r.id] ?? r.stamp ?? ""}
                      onChange={(e) => setStamps((m) => ({ ...m, [r.id]: e.target.value }))}
                      onBlur={(e) => saveStamp(r, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
          <datalist id="wanted-stamps">
            {STAMP_IDEAS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
      )}

      <div className="night-game-card p-4 md:p-6">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">On the site now ({total})</h2>
          <a
            href={`${SITE}/most-wanted`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm text-accent"
          >
            View page <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : total === 0 ? (
          <p className="text-muted-foreground">No players yet. The website shows its built-in list until you add some.</p>
        ) : (
          <div className="space-y-6">
            {grouped.map((g) => (
              <section key={g.sport}>
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wider text-accent">{g.sport}</h3>
                <div className="space-y-3">
                  {g.positions.map((p) => (
                    <div key={p.name}>
                      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{p.name}</div>
                      <div className="flex flex-wrap gap-2">
                        {p.players.map((r) => (
                          <span
                            key={r.id}
                            className={`inline-flex min-h-[36px] items-center gap-1 rounded-full border bg-muted/30 pr-1 text-sm text-foreground ${
                              r.top_rank != null ? "border-accent" : "border-border"
                            } ${readOnly ? "pl-3" : "pl-1"}`}
                          >
                            {!readOnly ? (
                              <button
                                type="button"
                                onClick={() => toggleTop(r)}
                                disabled={starring === r.id}
                                aria-pressed={r.top_rank != null}
                                aria-label={r.top_rank != null ? `Unstar ${r.player_name}` : `Make ${r.player_name} a top target`}
                                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                                  r.top_rank != null ? "text-accent" : "text-muted-foreground hover:text-accent"
                                }`}
                              >
                                {starring === r.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Star className="h-4 w-4" fill={r.top_rank != null ? "currentColor" : "none"} />
                                )}
                              </button>
                            ) : (
                              r.top_rank != null && <Star className="h-3.5 w-3.5 text-accent" fill="currentColor" aria-label="Top target" />
                            )}
                            {r.player_name}
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => remove(r)}
                                disabled={removing === r.id}
                                aria-label={`Remove ${r.player_name}`}
                                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                              >
                                {removing === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Shows
type ShowForm = { id?: string; name: string; location: string; start: string; end: string; kind: "buying" | "table" };
const EMPTY_SHOW: ShowForm = { name: "", location: "", start: "", end: "", kind: "buying" };

function ShowsEditor({ ownerId, readOnly }: { ownerId: string; readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<ShowForm>(EMPTY_SHOW);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<SiteShow | null>(null);
  const today = todayET();

  const { data: shows, isLoading } = useQuery({
    queryKey: ["websiteShows", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_shows")
        .select("id, name, location, start_date, end_date, kind")
        .eq("user_id", ownerId)
        .order("start_date");
      if (error) throw error;
      return (data || []) as SiteShow[];
    },
  });
  const upcoming = (shows || []).filter((s) => (s.end_date ?? s.start_date) >= today);
  const past = (shows || []).filter((s) => (s.end_date ?? s.start_date) < today).reverse();

  const save = async () => {
    const name = form.name.trim();
    if (!name || !form.start) {
      toast({ title: "Enter the show name and date", variant: "destructive" });
      return;
    }
    if (form.end && form.end < form.start) {
      toast({ title: "The last day can't be before the first day", variant: "destructive" });
      return;
    }
    const row = {
      name,
      location: form.location.trim() || null,
      start_date: form.start,
      end_date: form.end && form.end !== form.start ? form.end : null,
      kind: form.kind,
    };
    setSaving(true);
    try {
      const { error } = form.id
        ? await supabase.from("website_shows").update(row).eq("id", form.id)
        : await supabase.from("website_shows").insert({ ...row, user_id: ownerId });
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ["websiteShows"] });
      toast({ title: form.id ? "Show updated" : "Show added" });
      setForm(EMPTY_SHOW);
    } catch (e) {
      toast({ title: "Couldn't save show", description: errorText(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const s = deleting;
    setDeleting(null);
    const { error } = await supabase.from("website_shows").delete().eq("id", s.id);
    if (error) {
      toast({ title: "Couldn't delete show", description: errorText(error), variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["websiteShows"] });
    if (form.id === s.id) setForm(EMPTY_SHOW);
    toast({ title: `${s.name} removed` });
  };

  const edit = (s: SiteShow) =>
    setForm({
      id: s.id,
      name: s.name,
      location: s.location ?? "",
      start: s.start_date,
      end: s.end_date ?? "",
      kind: s.kind === "table" ? "table" : "buying",
    });

  const showRow = (s: SiteShow, muted = false) => (
    <li key={s.id} className={`flex items-center gap-3 border-b border-border py-3 last:border-0 ${muted ? "opacity-60" : ""}`}>
      <div className="w-28 shrink-0 text-sm font-bold text-accent">{showDateLabel(s.start_date, s.end_date)}</div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-foreground">{s.name}</div>
        {s.location && <div className="truncate text-xs text-muted-foreground">{s.location}</div>}
      </div>
      <Badge variant={s.kind === "table" ? "default" : "outline"} className="shrink-0 text-xs">
        {s.kind === "table" ? "TABLE" : "BUYING"}
      </Badge>
      {!readOnly && (
        <div className="flex shrink-0">
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => edit(s)} aria-label={`Edit ${s.name}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => setDeleting(s)} aria-label={`Delete ${s.name}`}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-4">
      {!readOnly && (
        <div className="night-game-card space-y-3 p-4 md:p-6">
          <h2 className="text-lg font-bold text-foreground">{form.id ? "Edit show" : "Add a show"}</h2>
          <Input
            placeholder="Show name (e.g. Philly Card Show)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="min-h-[44px]"
            maxLength={80}
            aria-label="Show name"
          />
          <Input
            placeholder="Where (optional, e.g. Oaks, PA)"
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            className="min-h-[44px]"
            maxLength={80}
            aria-label="Location"
          />
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">
              First day
              <Input
                type="date"
                value={form.start}
                onChange={(e) => setForm({ ...form, start: e.target.value })}
                className="min-h-[44px]"
              />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">
              Last day (if more than one)
              <Input
                type="date"
                value={form.end}
                min={form.start || undefined}
                onChange={(e) => setForm({ ...form, end: e.target.value })}
                className="min-h-[44px]"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="What you're doing there">
            {(["buying", "table"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                onClick={() => setForm({ ...form, kind: k })}
                className={`min-h-[56px] rounded-lg border p-2 text-left text-sm ${
                  form.kind === k ? "border-accent bg-accent/10 text-foreground" : "border-border text-muted-foreground"
                }`}
              >
                <span className="block font-bold">{k === "table" ? "TABLE" : "BUYING"}</span>
                <span className="text-xs">{k === "table" ? "You have a table with cards for sale" : "Walking the floor, buying"}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving} className="min-h-[44px] flex-1 sm:flex-none">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {form.id ? "Save changes" : "Add show"}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={() => setForm(EMPTY_SHOW)} className="min-h-[44px]">
                Cancel
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="night-game-card p-4 md:p-6">
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-foreground">Upcoming on the site ({upcoming.length})</h2>
          <a
            href={`${SITE}/shows`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1 text-sm text-accent"
          >
            View page <ExternalLink className="h-4 w-4" />
          </a>
        </div>
        <p className="mb-2 text-xs text-muted-foreground">Shows drop off the website the day after they end.</p>
        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : upcoming.length === 0 ? (
          <p className="text-muted-foreground">No upcoming shows on the site.</p>
        ) : (
          <ul>{upcoming.map((s) => showRow(s))}</ul>
        )}
        {past.length > 0 && (
          <details className="mt-4">
            <summary className="min-h-[44px] cursor-pointer py-2 text-sm text-muted-foreground">
              Past shows ({past.length})
            </summary>
            <ul>{past.map((s) => showRow(s, true))}</ul>
          </details>
        )}
      </div>

      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-foreground">Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>It comes off the website right away.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">Back</AlertDialogCancel>
            <AlertDialogAction className="min-h-[44px]" onClick={confirmDelete}>Delete show</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
