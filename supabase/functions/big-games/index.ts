// WORK IN PROGRESS (4 Nov 2026): ESPN blocks requests from Supabase function servers, so this is being
// switched to Highlightly (licensed; key in the HIGHLIGHTLY_API_KEY secret). No schedule runs it yet.
// big-games — reads finished NFL / NBA / WNBA / MLB games from ESPN's public scoreboards and stores
// standout stat lines in public.web_big_games. cssportscards.com shows the ones for players Colton has
// cards listed for (get_big_games). Runs hourly from pg_cron (web_big_games_tick); safe to call any time:
// each game is read once (web_big_game_events), and at most MAX_GAMES box scores are fetched per run.
// Body: {} for the normal run (yesterday + today, Eastern), or { days: n } (1-10) to look further back.
import { createClient } from "npm:@supabase/supabase-js@2";
import { bigLines, type League, SPORT, type Summary } from "./lines.ts";

const LEAGUES: { league: League; path: string }[] = [
  { league: "nfl", path: "football/nfl" },
  { league: "nba", path: "basketball/nba" },
  { league: "wnba", path: "basketball/wnba" },
  { league: "mlb", path: "baseball/mlb" },
];
const ESPN = "https://site.api.espn.com/apis/site/v2/sports/";
const MAX_GAMES = 40;

function admin() {
  let key: string | undefined;
  try { key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"]; } catch { /* legacy */ }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(Deno.env.get("SUPABASE_URL")!, key!, { auth: { persistSession: false } });
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

/** YYYYMMDD in Eastern time, `back` days ago */
function etDate(back: number): string {
  const d = new Date(Date.now() - back * 86400000);
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return p.replace(/-/g, "");
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "CSSportsCards/1.0 (+https://www.cssportscards.com)" },
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return await r.json() as T;
}

type Scoreboard = { events?: { id?: string; status?: { type?: { completed?: boolean } } }[] };

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  const body = await req.json().catch(() => ({}));
  const days = Math.min(10, Math.max(1, Number(body?.days) || 2));
  const db = admin();

  // 1. finished games on the scoreboards
  const found: { league: League; path: string; id: string }[] = [];
  const errors: string[] = [];
  const range = `${etDate(days - 1)}-${etDate(0)}`;
  await Promise.all(LEAGUES.map(async (l) => {
    try {
      const sb = await getJson<Scoreboard>(`${ESPN}${l.path}/scoreboard?dates=${range}&limit=300`);
      for (const e of sb.events ?? []) if (e.id && e.status?.type?.completed) found.push({ ...l, id: e.id });
    } catch (e) { errors.push(`${l.league} scoreboard: ${e instanceof Error ? e.message : e}`); }
  }));
  if (!found.length) return json({ games: 0, lines: 0, errors });

  // 2. skip the ones already read
  const { data: done } = await db.from("web_big_game_events").select("league, event_id").in("event_id", found.map((f) => f.id));
  const seen = new Set((done ?? []).map((d) => `${d.league}:${d.event_id}`));
  const todo = found.filter((f) => !seen.has(`${f.league}:${f.id}`)).slice(0, MAX_GAMES);

  // 3. read each box score, store its big lines, then mark the game read
  let lines = 0;
  for (const g of todo) {
    try {
      const s = await getJson<Summary>(`${ESPN}${g.path}/summary?event=${g.id}`);
      const big = bigLines(g.league, s);
      const gameAt = s.header?.competitions?.[0]?.date ?? new Date().toISOString();
      if (big.length) {
        const { error } = await db.from("web_big_games").upsert(big.map((b) => ({
          league: g.league, sport: SPORT[g.league], event_id: g.id, athlete_id: b.athlete_id, player: b.player,
          name_key: "", line: b.line, opponent: b.opponent, game_at: gameAt, score: b.score,
        })), { onConflict: "league,event_id,athlete_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      await db.from("web_big_game_events").insert({ league: g.league, event_id: g.id, lines: big.length });
      lines += big.length;
    } catch (e) { errors.push(`${g.league} ${g.id}: ${e instanceof Error ? e.message : e}`); }
  }
  // (name_key is set by a database trigger, with the same rule used on card player names)
  // keep a month
  await db.from("web_big_games").delete().lt("game_at", new Date(Date.now() - 31 * 86400000).toISOString());

  return json({ games: todo.length, waiting: found.length - seen.size - todo.length, lines, errors });
});
