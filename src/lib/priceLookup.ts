// Price lookup (20 Nov 2026): opens eBay sold listings and TCGplayer already searched for a card.
// Neither site lets a small seller pull prices by API (TCGplayer stopped issuing API keys; eBay's
// sold-price API is limited to approved partners), so EndZone builds the search and Colton reads the
// real prices there. What he finds can be saved on the card as a "market check".

export type LookupCard = {
  player_name?: string | null;
  year?: string | null;
  sport?: string | null;
  brand?: string | null;
  set?: string | null;
  card_number?: string | null;
  parallel?: string | null;
  serial_number?: string | null;
  condition?: string | null;
  autograph?: boolean | null;
};

const GRADED = /^(PSA|BGS|BVG|SGC|CGC|TAG|HGA|CSG|ISA)\s*\d+(\.\d+)?/i;
const clean = (s?: string | null) => (s ?? "").replace(/\s+/g, " ").trim();

/** The words to search for: year, set, name, parallel, number, serial run, grade. */
export function lookupQuery(c: LookupCard): string {
  const isPokemon = c.sport === "pokemon";
  const grade = clean(c.condition).match(GRADED)?.[0] ?? "";
  // "23/99" → "/99": buyers search the print run, not this copy's number
  const serial = clean(c.serial_number).replace(/^#?\s*\d+\s*\/\s*(\d+)$/, "/$1");
  const num = clean(c.card_number).replace(/^#/, "");
  const parts = isPokemon
    ? [clean(c.player_name), clean(c.set), num, clean(c.parallel), grade]
    : [clean(c.year), clean(c.brand), clean(c.set), clean(c.player_name), clean(c.parallel),
       num ? `#${num}` : "", serial, c.autograph ? "auto" : "", grade];
  // drop a brand already inside the set name ("Panini" + "Panini Prizm")
  const out: string[] = [];
  for (const p of parts) {
    if (!p) continue;
    if (out.some((o) => o.toLowerCase().includes(p.toLowerCase()))) continue;
    out.push(p);
  }
  if (isPokemon && !out.join(" ").toLowerCase().includes("pokemon")) out.push("pokemon");
  return out.join(" ").slice(0, 200);
}

/** eBay search showing sold listings only, newest first. */
export function ebaySoldUrl(c: LookupCard): string {
  const q = encodeURIComponent(lookupQuery(c));
  return `https://www.ebay.com/sch/i.html?_nkw=${q}&LH_Sold=1&LH_Complete=1&_sop=13`;
}

/** TCGplayer product search (Pokémon cards search the Pokémon category). */
export function tcgplayerUrl(c: LookupCard): string {
  const q = encodeURIComponent(lookupQuery(c).replace(/\s*pokemon$/i, ""));
  const cat = c.sport === "pokemon" ? "pokemon" : "all";
  return `https://www.tcgplayer.com/search/${cat}/product?q=${q}&view=grid`;
}

export const PRICE_SOURCES: Record<string, string> = { ebay_sold: "eBay sold", tcgplayer: "TCGplayer", other: "Other" };
