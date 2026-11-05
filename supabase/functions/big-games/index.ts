// big-games — reads finished NFL / NBA / MLB games from Highlightly (key: HIGHLIGHTLY_API_KEY secret) and
// stores standout stat lines in public.web_big_games. cssportscards.com shows the ones for players Colton
// has cards listed for (get_big_games). Runs three times a day from pg_cron (web_big_games_tick).
// Safe to call any time: each game is read once (web_big_game_events), and it stops early when the
// Highlightly daily quota (100 requests on the free plan) gets low, leaving the rest for the next run.
// Body: {} for the normal run (yesterday + today, UTC dates), or { days: n } (1-8) to look further back.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bigLines, type League, type Match, SPORT, type TeamBox } from "./lines.ts";

const API = "https://sports.highlightly.net";
const LEAGUES: { league: League; list: string; box: string; name: string }[] = [
  { league: "nfl", list: "/american-football/matches", box: "/american-football/box-score/", name: "NFL" },
  { league: "nba", list: "/nba/matches", box: "/nba/box-score/", name: "NBA" },
  { league: "mlb", list: "/baseball/matches", box: "/baseball/box-scores/", name: "MLB" },
];
const MAX_GAMES = 30;     // box scores per run
const KEEP_SPARE = 8;     // never use the last few requests of the day

function admin() {
  let key: string | undefined;
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"]; } catch { /* legacy */ }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, key!, { auth: { persistSession: false } });
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const utcDate = (back: number) => new Date(Date.now() - back * 86400000).toISOString().slice(0, 10);

type ListMatch = Match & { league?: string; date?: string; state?: { description?: string } };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const key = Deno.env.get("HIGHLIGHTLY_API_KEY");
  if (!key) return json({ error: "HIGHLIGHTLY_API_KEY is not set" }, 500);
  const body = await req.json().catch(() => ({}));
  const days = Math.min(8, Math.max(1, Number(body?.days) || 2));
  const db = admin();

  let remaining = 100, calls = 0;
  async function get<T>(path: string): Promise<T> {
    const r = await fetch(API + path, { headers: { "x-rapidapi-key": key! }, signal: AbortSignal.timeout(20000) });
    calls++;
    const left = Number(r.headers.get("x-ratelimit-requests-remaining"));
    if (Number.isFinite(left)) remaining = left;
    if (!r.ok) throw new Error(`${r.status} ${path}`);
    return await r.json() as T;
  }

  // 1. finished games, newest days first
  const found: { lg: typeof LEAGUES[number]; m: ListMatch }[] = [];
  const errors: string[] = [];
  for (let back = 0; back < days; back++) {
    for (const lg of LEAGUES) {
      if (remaining <= KEEP_SPARE) break;
      try {
        const res = await get<{ data?: ListMatch[] }>(`${lg.list}?date=${utcDate(back)}&league=${lg.name}&limit=100`);
        for (const m of res.data ?? []) {
          if (m.league === lg.name && m.state?.description === "Finished" && m.id != null) found.push({ lg, m });
        }
      } catch (e) { errors.push(`${lg.league} list: ${e instanceof Error ? e.message : e}`); }
    }
  }
  if (!found.length) return json({ games: 0, lines: 0, calls, remaining, errors });

  // 2. skip games already read
  const ids = found.map((f) => String(f.m.id));
  const { data: done } = await db.from("web_big_game_events").select("league, event_id").in("event_id", ids);
  const seen = new Set((done ?? []).map((d) => `${d.league}:${d.event_id}`));
  const todo = found.filter((f) => !seen.has(`${f.lg.league}:${f.m.id}`));

  // 3. read box scores (football first: one game a week matters more than one of 82)
  todo.sort((a, b) => (a.lg.league === "nfl" ? 0 : 1) - (b.lg.league === "nfl" ? 0 : 1));
  let lines = 0, read = 0;
  for (const { lg, m } of todo) {
    if (read >= MAX_GAMES || remaining <= KEEP_SPARE) break;
    try {
      const box = await get<TeamBox[]>(lg.box + m.id);
      read++;
      const big = bigLines(lg.league, m, box);
      if (big.length) {
        const { error } = await db.from("web_big_games").upsert(big.map((b) => ({
          league: lg.league, sport: SPORT[lg.league], event_id: String(m.id), athlete_id: b.athlete_id, player: b.player,
          name_key: "", line: b.line, opponent: b.opponent, game_at: m.date ?? new Date().toISOString(), score: b.score,
        })), { onConflict: "league,event_id,athlete_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      await db.from("web_big_game_events").insert({ league: lg.league, event_id: String(m.id), lines: big.length });
      lines += big.length;
    } catch (e) { errors.push(`${lg.league} ${m.id}: ${e instanceof Error ? e.message : e}`); }
  }
  // (name_key is set by a database trigger, with the same rule used on card player names)
  // keep a month
  await db.from("web_big_games").delete().lt("game_at", new Date(Date.now() - 31 * 86400000).toISOString());

  return json({ games: read, waiting: todo.length - read, lines, calls, remaining, errors });
});
