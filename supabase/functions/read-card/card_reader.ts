// EndZone card reader: the read-card function's logic
// Reads a sports card's details from its front (and optional back) photo using Claude.
//
// Called by the Add/Edit Show Card form with the signed-in user's session.
//   POST { front: { data: <base64>, media_type }, back?: { data, media_type } }
//   → 200 { is_sports_card, fields: {...} }   | 401 | 400 | 429 { error: "daily_limit" } | 502
//
// Secrets (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY. The key never leaves this function.
// Every read is logged in public.card_reads (who, when, model, tokens, result) through
// claim_card_read(), which also enforces the per-user daily cap.
// Never filled by the reader: lot, cost basis, asking price, and condition of raw (ungraded) cards.

import { createClient } from "npm:@supabase/supabase-js@2";

export const MODEL = "claude-sonnet-5-5";
const DAILY_CAP = 200;
const MAX_IMAGE_B64 = 2_800_000; // ~2 MB per photo after base64
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SPORTS = ["football", "basketball", "baseball", "hockey", "soccer", "marvel", "disney", "other"];

const ALLOWED_ORIGINS = [
  /^https:\/\/endzone-cards\.netlify\.app$/,
  /^https:\/\/[a-z0-9-]+--endzone-cards\.netlify\.app$/,
  /^http:\/\/localhost:\d+$/,
];

export function cors(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const ok = ALLOWED_ORIGINS.some((re) => re.test(origin));
  return {
    ...(ok ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  let key: string | undefined;
  try {
    key = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")["default"];
  } catch { /* fall back to the legacy key */ }
  key ??= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!key) throw new Error("No Supabase secret key in the function environment");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------------------------------------------------------------------------
// What Claude is asked to return
// ---------------------------------------------------------------------------
// Structured output (output_config.format). No nullable types: an empty string means "not on the card".
const textField = (description: string) => ({
  type: "object",
  description,
  properties: {
    value: { type: "string", description: "What the card shows, or an empty string if it is not on the card." },
    sure: { type: "boolean", description: "true only if you can clearly read it on the card." },
    note: { type: "string", description: "Only when not sure: a few words on why, e.g. 'Could be Silver or Hyper; check the shine.' Otherwise an empty string." },
  },
  required: ["value", "sure", "note"],
  additionalProperties: false,
});
const flagField = (description: string) => ({
  type: "object",
  description,
  properties: {
    value: { type: "boolean" },
    sure: { type: "boolean" },
    note: { type: "string" },
  },
  required: ["value", "sure", "note"],
  additionalProperties: false,
});

const SCHEMA = {
    type: "object",
    properties: {
      is_sports_card: { type: "boolean", description: "false if the photo is not a trading card (or a slab holding one). Sports, Marvel and Disney trading cards all count as cards." },
      player_name: textField("Player's full name as printed, e.g. 'Jayden Daniels'. For multi-player cards, names joined with ' / '."),
      year: textField("Card year as collectors list it: the year in the product name (e.g. 2024 for '2024 Panini Prizm'). For two-season products like 2023-24, the first year (2023). If only a copyright year is visible and no product year, use it but set sure=false."),
      brand: textField("Manufacturer only: Panini, Topps, Upper Deck, Fleer, Leaf, Donruss (pre-Panini), Bowman (pre-Topps), etc. Modern Donruss/Prizm/Select/Optic are Panini; modern Bowman/Chrome/Finest are Topps."),
      set_name: textField("Product/set name without the brand and year, e.g. 'Prizm', 'Donruss Optic', 'Select', 'Chrome', 'Bowman Chrome'. Include an insert name if this is an insert, e.g. 'Prizm No Huddle'. Do not include the parallel colour here."),
      card_number: textField("Card number as printed, without '#', e.g. '347' or 'RC-12'. Usually on the back; on a slab, on the label."),
      parallel: textField("Parallel / colour variant if any, e.g. 'Silver', 'Gold', 'Pink Ice', 'Refractor'. empty for a base card. Shiny or patterned finishes are often hard to judge from a photo: set sure=false unless it is printed (e.g. on a slab label)."),
      serial_number: textField("Serial numbering if stamped, exactly as shown, e.g. '23/99'. empty if not numbered."),
      rookie: flagField("true if the card is marked as a rookie card (RC logo, 'Rookie', 'Rated Rookie', etc.)."),
      autograph: flagField("true if the card is autographed (on-card or sticker auto)."),
      graded: flagField("true if the card is in a grading company slab (PSA, BGS/Beckett, SGC, CGC, etc.)."),
      grading_company: textField("Grading company if graded: PSA, BGS, SGC, CGC, ... empty if raw."),
      grade: textField("Numeric grade from the slab label if graded, e.g. '10' or '9.5'. Empty if raw. Never estimate a grade for a raw card."),
      cert_number: textField("Certification number from the slab label if graded. Empty if raw."),
      sport: {
        type: "object",
        properties: {
          value: { type: "string", enum: [...SPORTS, ""] },
          sure: { type: "boolean" },
          note: { type: "string" },
        },
        required: ["value", "sure", "note"],
        additionalProperties: false,
      },
      team: textField("Team on the card as 'City Nickname', e.g. 'Washington Commanders', 'Indiana Fever'. For college cards, the school. For Marvel or Disney cards, the film or franchise if printed, e.g. 'X-Men', 'Frozen'; otherwise empty."),
    },
    required: [
      "is_sports_card", "player_name", "year", "brand", "set_name", "card_number", "parallel", "serial_number",
      "rookie", "autograph", "graded", "grading_company", "grade", "cert_number", "sport", "team",
    ],
    additionalProperties: false,
};

const SYSTEM = `You read trading cards (mostly sports; some Marvel and Disney) from photos for a card dealer's inventory app.
For Marvel or Disney cards, put the character's name in player_name and use sport 'marvel' or 'disney'.
Read only what is visible on the card, its back, or a grading slab label. Do not guess from general knowledge
when the card does not show it, except brand/set, which you may infer from the card design when you clearly
recognise it (then set sure=true only if you are confident).
Mark sure=false whenever text is blurry, cut off, glared, or you are choosing between possibilities, and say why
in a short note. A wrong value marked sure=true is the worst outcome; an unsure or empty value is fine.
Never estimate condition or a grade for a raw card. Use an empty string for anything not on the card.`;

export type ImageIn = { data: string; media_type: string };

async function askClaude(front: ImageIn, back: ImageIn | null) {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  const content: unknown[] = [
    { type: "text", text: "Front of the card:" },
    { type: "image", source: { type: "base64", media_type: front.media_type, data: front.data } },
  ];
  if (back) {
    content.push({ type: "text", text: "Back of the card:" });
    content.push({ type: "image", source: { type: "base64", media_type: back.media_type, data: back.data } });
  }
  content.push({ type: "text", text: "Read this card and record its details." });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1500,
        system: SYSTEM,
        output_config: { format: { type: "json_schema", schema: SCHEMA } },
        messages: [{ role: "user", content }],
      }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${body?.error?.message ?? "error"}`);
    if (body.stop_reason !== "end_turn") throw new Error(`Unexpected stop_reason: ${body.stop_reason}`);
    const text = (body.content ?? []).find((c: { type: string }) => c.type === "text")?.text;
    if (!text) throw new Error("No text in the response");
    return {
      raw: JSON.parse(text) as Record<string, unknown>,
      input_tokens: body.usage?.input_tokens ?? null,
      output_tokens: body.usage?.output_tokens ?? null,
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Clean what came back so the form only ever receives safe, bounded values
// ---------------------------------------------------------------------------
type Field<T> = { value: T; sure: boolean; note: string | null };

function cleanText(f: unknown, max: number): Field<string | null> {
  const o = (f ?? {}) as Record<string, unknown>;
  let v = typeof o.value === "string" ? o.value.replace(/\s+/g, " ").trim() : null;
  if (v === "" || v?.toLowerCase() === "null" || v?.toLowerCase() === "n/a") v = null;
  if (v && v.length > max) v = v.slice(0, max);
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 140) : null;
  return { value: v, sure: v !== null && o.sure === true, note };
}
function cleanFlag(f: unknown): Field<boolean> {
  const o = (f ?? {}) as Record<string, unknown>;
  const note = typeof o.note === "string" && o.note.trim() ? o.note.trim().slice(0, 140) : null;
  return { value: o.value === true, sure: o.sure === true, note };
}

export function cleanResult(raw: Record<string, unknown>) {
  const thisYear = new Date().getFullYear();
  const year = cleanText(raw.year, 9);
  if (year.value) {
    const m = year.value.match(/(19|20)\d{2}/);
    const y = m ? parseInt(m[0]) : NaN;
    year.value = y >= 1900 && y <= thisYear + 1 ? String(y) : null;
    if (!year.value) year.sure = false;
  }
  const sport = cleanText(raw.sport, 20);
  if (sport.value) sport.value = sport.value.toLowerCase();
  if (sport.value && !SPORTS.includes(sport.value)) { sport.value = null; sport.sure = false; }

  const card_number = cleanText(raw.card_number, 20);
  if (card_number.value) card_number.value = card_number.value.replace(/^#\s*/, "");

  const graded = cleanFlag(raw.graded);
  const fields = {
    player_name: cleanText(raw.player_name, 100),
    year,
    brand: cleanText(raw.brand, 40),
    set_name: cleanText(raw.set_name, 60),
    card_number,
    parallel: cleanText(raw.parallel, 40),
    serial_number: cleanText(raw.serial_number, 20),
    rookie: cleanFlag(raw.rookie),
    autograph: cleanFlag(raw.autograph),
    graded,
    grading_company: cleanText(raw.grading_company, 10),
    grade: cleanText(raw.grade, 10),
    cert_number: cleanText(raw.cert_number, 20),
    sport,
    team: cleanText(raw.team, 60),
  };
  if (!graded.value) {
    // Raw card: never return a grade or cert, whatever came back.
    fields.grading_company = { value: null, sure: false, note: null };
    fields.grade = { value: null, sure: false, note: null };
    fields.cert_number = { value: null, sure: false, note: null };
  }
  return { is_sports_card: raw.is_sports_card !== false, fields };
}

export function checkImage(x: unknown): ImageIn | null {
  const o = x as ImageIn | undefined;
  if (!o || typeof o.data !== "string" || typeof o.media_type !== "string") return null;
  if (!IMAGE_TYPES.has(o.media_type)) return null;
  if (o.data.length < 100 || o.data.length > MAX_IMAGE_B64) return null;
  if (!/^[A-Za-z0-9+/=]+$/.test(o.data.slice(0, 200))) return null;
  return o;
}

// One logged read: claim (cap check) → ask → record
export async function loggedRead(
  admin: ReturnType<typeof adminClient>,
  userId: string,
  source: "app" | "eval",
  front: ImageIn,
  back: ImageIn | null,
  extra: Record<string, unknown> = {},
) {
  const { data: readId, error: claimErr } = await admin.rpc("claim_card_read", {
    p_user: userId, p_daily_cap: DAILY_CAP, p_source: source,
  });
  if (claimErr) throw new Error(`claim_card_read: ${claimErr.message}`);
  if (!readId) return { limited: true as const };

  try {
    const r = await askClaude(front, back);
    const cleaned = cleanResult(r.raw);
    await admin.from("card_reads").update({
      ok: true, model: MODEL, input_tokens: r.input_tokens, output_tokens: r.output_tokens,
      result: { ...cleaned, ...extra },
    }).eq("id", readId);
    return { limited: false as const, ...cleaned };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin.from("card_reads").update({ ok: false, model: MODEL, error: msg.slice(0, 500), result: extra })
      .eq("id", readId);
    throw e;
  }
}

