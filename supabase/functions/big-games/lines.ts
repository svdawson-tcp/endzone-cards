// Turns one Highlightly box score into "big game" stat lines (pure: no network, no database).
// A big game is a clearly standout performance. Only the standout parts go into the line, so a 5 TD,
// 3 INT day reads "462 pass yds, 5 TD" (true, and the reason it's a big game).
// Stat names are Highlightly's, checked against real NFL, NBA and MLB box scores on 4 Nov 2026.

export type League = "nfl" | "nba" | "mlb";
export const SPORT: Record<League, "football" | "basketball" | "baseball"> = {
  nfl: "football", nba: "basketball", mlb: "baseball",
};

export type BigLine = { athlete_id: string; player: string; line: string; opponent: string; score: number };

type Stat = { name?: string; group?: string; value?: number | string | null };
type PlayerBox = { player?: { id?: number | string; name?: string }; statistics?: Stat[] };
type TeamRef = { id?: number | string; name?: string; boxScores?: PlayerBox[] };
export type TeamBox = { team?: TeamRef; boxScores?: PlayerBox[] };
export type Match = {
  id: number | string;
  homeTeam?: { id?: number | string; abbreviation?: string };
  awayTeam?: { id?: number | string; abbreviation?: string };
};

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
/** "Group:Name" -> value, plus "Name" -> value when the name is unique */
function statMap(stats: Stat[] = []): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of stats) {
    if (!s?.name) continue;
    m[`${s.group ?? ""}:${s.name}`] = num(s.value);
    if (!(s.name in m)) m[s.name] = num(s.value);
  }
  return m;
}
const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function nflLine(s: Record<string, number>): { parts: string[]; score: number } {
  const passYds = s["Passing:Total Passing Yards"] ?? 0, passTd = s["Passing:Total Passing Touchdowns"] ?? 0;
  const rushYds = s["Rushing:Total Rushing Yards"] ?? 0, rushTd = s["Rushing:Total Rushing Touchdowns"] ?? 0;
  const rec = s["Receiving:Total Receptions"] ?? 0, recYds = s["Receiving:Total Receiving Yards"] ?? 0, recTd = s["Receiving:Total Receiving Touchdowns"] ?? 0;
  const sacks = s["Defense:Total Defensive Sacks"] ?? 0, defTd = s["Defense:Total Defensive Touchdowns"] ?? 0;
  const ints = s["General:Total Interceptions"] ?? 0, intTd = s["General:Total Touchdown Interceptions"] ?? 0;
  const retTd = (s["Kicking:Total Kick Return Touchdowns"] ?? 0) + (s["Punting:Total Punt Return Touchdowns"] ?? 0);

  const bigPass = passYds >= 300 || passTd >= 3;
  const bigRush = rushYds >= 100 || rushTd >= 2;
  const bigRec = recYds >= 100 || recTd >= 2;
  const bigTd = rushTd + recTd >= 2;            // e.g. 1 rushing + 1 receiving TD
  const pickSix = intTd >= 1, defScore = defTd >= 1 && !pickSix;
  const bigDef = sacks >= 2 || ints >= 2 || pickSix || defScore;
  const bigRet = retTd >= 1;
  if (!(bigPass || bigRush || bigRec || bigTd || bigDef || bigRet)) return { parts: [], score: 0 };

  const parts: string[] = [];
  if (bigPass) parts.push(`${passYds} pass yds${passTd ? `, ${passTd} TD` : ""}`);
  if (bigRush || (rushTd && (bigPass || bigRec || bigTd))) parts.push(rushYds >= 100 ? `${rushYds} rush yds${rushTd ? `, ${rushTd} TD` : ""}` : plural(rushTd, "rush TD"));
  if (bigRec || (recTd && (bigPass || bigRush || bigTd))) parts.push(recYds >= 100 ? `${rec} rec, ${recYds} yds${recTd ? `, ${recTd} TD` : ""}` : plural(recTd, "rec TD"));
  if (sacks >= 2) parts.push(`${sacks} sacks`);
  if (ints >= 2) parts.push(`${ints} INT`);
  if (pickSix) parts.push(intTd > 1 ? `${intTd} pick-sixes` : "pick-six");
  if (defScore) parts.push("defensive TD");
  if (bigRet) parts.push(plural(retTd, "return TD"));
  const score = passYds / 25 + passTd * 4 + rushYds / 10 + rushTd * 6 + recYds / 10 + recTd * 6 + rec * 0.5 +
    sacks * 4 + ints * 5 + (defTd + intTd + retTd) * 6;
  return { parts, score };
}

function nbaLine(s: Record<string, number>): { parts: string[]; score: number } {
  const pts = s["Total Points Scored"] ?? 0, reb = s["Total Rebounds"] ?? 0, ast = s["Total Assists"] ?? 0;
  const stl = s["Total Steals"] ?? 0, blk = s["Total Blocks"] ?? 0;
  const triple = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length >= 3;
  if (!(pts >= 30 || triple || reb >= 18 || ast >= 14 || blk >= 6 || stl >= 6)) return { parts: [], score: 0 };
  const parts = [`${pts} pts`, `${reb} reb`, `${ast} ast`];
  if (stl >= 4) parts.push(`${stl} stl`);
  if (blk >= 4) parts.push(`${blk} blk`);
  if (triple) parts.push("triple-double");
  return { parts, score: pts + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 + (triple ? 10 : 0) };
}

function mlbLine(s: Record<string, number>, raw: Stat[]): { parts: string[]; score: number } {
  const parts: string[] = [];
  let score = 0;
  const hits = s["Batting:Total Hits"] ?? 0, ab = s["Batting:Total At-Bats"] ?? 0, hr = s["Batting:Total Home Runs"] ?? 0;
  const rbi = s["Batting:Total Runs Batted In (RBI)"] ?? 0;
  if (hr >= 2 || hits >= 4 || rbi >= 5) {
    parts.push(`${hits}-for-${ab}`);
    if (hr) parts.push(hr === 1 ? "HR" : `${hr} HR`);
    if (rbi) parts.push(`${rbi} RBI`);
    score += hits * 2 + hr * 5 + rbi * 2;
  }
  const ipRaw = raw.find((x) => x.group === "Pitching" && x.name === "Innings Pitched")?.value;
  if (ipRaw != null) {
    const ip = num(ipRaw), er = s["Pitching:Total Earned Runs"] ?? 0, k = s["Pitching:Total Strikeouts"] ?? 0, h = s["Pitching:Hits Allowed"] ?? 0;
    if (k >= 10 || (ip >= 7 && er === 0)) {
      parts.push(`${Number.isInteger(num(ipRaw)) ? num(ipRaw).toFixed(1) : String(ipRaw)} IP`, `${er} ER`, `${k} K`);
      if (ip >= 9 && h === 0) parts.push("no-hitter");
      score += ip * 2 + k * 1.5 - er * 2 + (ip >= 9 && h === 0 ? 30 : 0);
    }
  }
  return { parts, score };
}

/** The big lines in one finished game's box score. */
export function bigLines(league: League, match: Match, box: TeamBox[]): BigLine[] {
  const out: BigLine[] = [];
  const home = match.homeTeam, away = match.awayTeam;
  for (const t of Array.isArray(box) ? box : []) {
    const teamId = String(t.team?.id ?? "");
    const isHome = teamId === String(home?.id ?? "-"), isAway = teamId === String(away?.id ?? "-");
    if (!isHome && !isAway) continue;                       // can't tell the opponent: skip rather than guess
    const opponent = isHome ? `vs ${away?.abbreviation ?? "?"}` : `@ ${home?.abbreviation ?? "?"}`;
    for (const p of t.boxScores ?? t.team?.boxScores ?? []) {
      const id = p.player?.id, name = p.player?.name;
      if (id == null || !name || !p.statistics?.length) continue;
      const s = statMap(p.statistics);
      const r = league === "nfl" ? nflLine(s) : league === "nba" ? nbaLine(s) : mlbLine(s, p.statistics);
      if (r.parts.length) out.push({ athlete_id: String(id), player: name.trim(), line: r.parts.join(", "), opponent, score: Math.round(r.score * 10) / 10 });
    }
  }
  return out;
}
