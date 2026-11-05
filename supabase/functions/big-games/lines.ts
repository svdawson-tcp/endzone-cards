// Turns one ESPN game summary into "big game" stat lines (pure: no network, no database).
// A big game is a clearly standout performance. Only standout parts make it into the line, so a 5 TD,
// 3 INT day reads "462 pass yds, 5 TD" (true, and the reason it's a big game).

export type League = "nfl" | "nba" | "wnba" | "mlb";
export const SPORT: Record<League, "football" | "basketball" | "baseball"> = {
  nfl: "football", nba: "basketball", wnba: "basketball", mlb: "baseball",
};

export type BigLine = {
  athlete_id: string;
  player: string;
  line: string;
  opponent: string; // "vs TEN" / "@ TEN"
  score: number;
};

type Athlete = { athlete?: { id?: string; displayName?: string }; stats?: string[]; didNotPlay?: boolean | null };
type Group = { name?: string | null; type?: string | null; keys?: string[]; athletes?: Athlete[] | null };
type TeamBox = { team?: { id?: string; abbreviation?: string }; statistics?: Group[] };
type Competitor = { homeAway?: string; team?: { id?: string; abbreviation?: string } };
export type Summary = {
  header?: { id?: string; competitions?: { date?: string; status?: { completed?: boolean }; competitors?: Competitor[] }[] };
  boxscore?: { players?: TeamBox[] };
};

const num = (s: string | undefined) => {
  const n = parseFloat(String(s ?? "").replace(/[^\d.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

/** Every athlete's stats for this game, keyed by athlete id: { group name -> { stat key -> raw value } } */
function collect(team: TeamBox) {
  const out = new Map<string, { name: string; groups: Record<string, Record<string, string>> }>();
  for (const g of team.statistics ?? []) {
    const group = g.name || g.type || "all";
    const keys = g.keys ?? [];
    for (const a of g.athletes ?? []) {
      const id = a.athlete?.id, name = a.athlete?.displayName;
      if (!id || !name || a.didNotPlay || !a.stats?.length) continue;
      const rec = out.get(id) ?? { name, groups: {} };
      const vals: Record<string, string> = {};
      keys.forEach((k, i) => { vals[k] = a.stats![i]; });
      rec.groups[group] = vals;
      out.set(id, rec);
    }
  }
  return out;
}

const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;

function nflLine(g: Record<string, Record<string, string>>): { parts: string[]; score: number } {
  const p = g.passing, r = g.rushing, c = g.receiving, d = g.defensive, i = g.interceptions, kr = g.kickReturns, pr = g.puntReturns;
  const passYds = num(p?.passingYards), passTd = num(p?.passingTouchdowns);
  const rushYds = num(r?.rushingYards), rushTd = num(r?.rushingTouchdowns);
  const rec = num(c?.receptions), recYds = num(c?.receivingYards), recTd = num(c?.receivingTouchdowns);
  const sacks = num(d?.sacks), defTd = num(d?.defensiveTouchdowns);
  const ints = num(i?.interceptions), intTd = num(i?.interceptionTouchdowns);
  const retTd = num(kr?.kickReturnTouchdowns) + num(pr?.puntReturnTouchdowns);

  const bigPass = passYds >= 300 || passTd >= 3;
  const bigRush = rushYds >= 100 || rushTd >= 2;
  const bigRec = recYds >= 100 || recTd >= 2;
  const bigDef = sacks >= 2 || ints >= 2 || defTd + intTd >= 1;
  const bigRet = retTd >= 1;
  const totalTd = rushTd + recTd;
  const bigTd = totalTd >= 2;  // e.g. 1 rushing + 1 receiving TD
  if (!(bigPass || bigRush || bigRec || bigDef || bigRet || bigTd)) return { parts: [], score: 0 };

  const parts: string[] = [];
  if (bigPass) parts.push(`${passYds} pass yds${passTd ? `, ${passTd} TD` : ""}`);
  if (bigRush || (rushTd && (bigPass || bigRec || bigTd))) parts.push(rushYds >= 100 ? `${rushYds} rush yds${rushTd ? `, ${rushTd} TD` : ""}` : `${plural(rushTd, "rush TD")}`);
  if (bigRec || (recTd && (bigPass || bigRush || bigTd))) parts.push(recYds >= 100 ? `${rec} rec, ${recYds} yds${recTd ? `, ${recTd} TD` : ""}` : `${plural(recTd, "rec TD")}`);
  if (sacks >= 2) parts.push(`${sacks} sacks`);
  if (ints >= 2) parts.push(`${ints} INT`);
  if (defTd + intTd >= 1) parts.push(intTd ? "pick-six" : "defensive TD");
  if (bigRet) parts.push(plural(retTd, "return TD"));
  const score = passYds / 25 + passTd * 4 + rushYds / 10 + rushTd * 6 + recYds / 10 + recTd * 6 + rec * 0.5 +
    sacks * 4 + ints * 5 + (defTd + intTd + retTd) * 6;
  return { parts, score };
}

function hoopsLine(g: Record<string, Record<string, string>>, league: League): { parts: string[]; score: number } {
  const s = g.all ?? Object.values(g)[0];
  if (!s) return { parts: [], score: 0 };
  const pts = num(s.points), reb = num(s.rebounds), ast = num(s.assists), stl = num(s.steals), blk = num(s.blocks);
  const doubles = [pts, reb, ast, stl, blk].filter((v) => v >= 10).length;
  const triple = doubles >= 3;
  const big = pts >= (league === "wnba" ? 25 : 30) || triple || reb >= (league === "wnba" ? 15 : 18) || ast >= (league === "wnba" ? 12 : 14) || blk >= 6 || stl >= 6;
  if (!big) return { parts: [], score: 0 };
  const parts = [`${pts} pts`, `${reb} reb`, `${ast} ast`];
  if (stl >= 4) parts.push(`${stl} stl`);
  if (blk >= 4) parts.push(`${blk} blk`);
  if (triple) parts.push("triple-double");
  return { parts, score: pts + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3 + (triple ? 10 : 0) };
}

function mlbLine(g: Record<string, Record<string, string>>): { parts: string[]; score: number } {
  const b = g.batting, p = g.pitching;
  const parts: string[] = [];
  let score = 0;
  if (b) {
    const hits = num(b.hits), ab = num(b.atBats), hr = num(b.homeRuns), rbi = num(b.RBIs);
    if (hr >= 2 || hits >= 4 || rbi >= 5) {
      parts.push(`${hits}-for-${ab}`);
      if (hr) parts.push(hr === 1 ? "HR" : `${hr} HR`);
      if (rbi) parts.push(`${rbi} RBI`);
      score += hits * 2 + hr * 5 + rbi * 2;
    }
  }
  if (p) {
    const ipRaw = String(p["fullInnings.partInnings"] ?? "0"), ip = num(ipRaw), er = num(p.earnedRuns), k = num(p.strikeouts), h = num(p.hits);
    if (k >= 10 || (ip >= 7 && er === 0)) {
      parts.push(`${ipRaw} IP`, `${er} ER`, `${k} K`);
      if (ip >= 9 && h === 0) parts.push("no-hitter");
      score += ip * 2 + k * 1.5 - er * 2 + (ip >= 9 && h === 0 ? 30 : 0);
    }
  }
  return { parts, score };
}

/** The big lines in one finished game (empty if the game isn't final). */
export function bigLines(league: League, s: Summary): BigLine[] {
  const comp = s.header?.competitions?.[0];
  if (!comp?.status?.completed) return [];
  const teams = comp.competitors ?? [];
  const out: BigLine[] = [];
  for (const team of s.boxscore?.players ?? []) {
    const me = teams.find((c) => c.team?.id === team.team?.id);
    const opp = teams.find((c) => c.team?.id !== team.team?.id);
    const opponent = `${me?.homeAway === "away" ? "@" : "vs"} ${opp?.team?.abbreviation ?? "?"}`;
    for (const [id, a] of collect(team)) {
      const r = league === "nfl" ? nflLine(a.groups) : league === "mlb" ? mlbLine(a.groups) : hoopsLine(a.groups, league);
      if (r.parts.length) out.push({ athlete_id: id, player: a.name, line: r.parts.join(", "), opponent, score: Math.round(r.score * 10) / 10 });
    }
  }
  return out;
}
