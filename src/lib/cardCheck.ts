// Card check: looks over a card while it's being added or edited and lists anything that looks wrong,
// so Colton sees it before the card goes on the website. Two kinds of checks:
//  * rules on the typed data (a cert number with no grade, a serial number without "/", an auto set not marked AUTO...)
//  * the typed data against what the card reader saw on the photos (the slab says PSA 9, the form says Mint)
// Pure functions: no React, no network. CreateShowCard shows the list and runs a photo read on save if needed.
import type { CardReadFields } from "@/lib/cardReader";

export type CardCheckInput = {
  playerName: string;
  year: string;
  set: string;
  cardNumber: string;
  parallel: string;
  serialNumber: string;
  condition: string;
  certNumber: string;
  rookie: boolean;
  autograph: boolean;
  costBasis: string;
  askingPrice: string;
  inBin: boolean;
};

export type CardFix =
  | { field: "condition" | "playerName" | "year" | "cardNumber" | "parallel" | "serialNumber" | "certNumber"; value: string }
  | { field: "rookie" | "autograph"; value: boolean };

export type CardIssue = {
  id: string;
  /** "fix": very likely wrong (asked about again on save). "note": worth a look, never blocks. */
  level: "fix" | "note";
  message: string;
  fix?: { label: string } & CardFix;
};

export const GRADE_RE = /^(PSA|BGS|BVG|SGC|CGC|TAG|HGA|CSG|ISA)\s+\S/i;
// Words a parallel usually has. Only used to ask "is the parallel in the Set field?" when Parallel is empty.
const PARALLEL_WORDS = /\b(refractor|holo|shimmer|checker(board)?|cracked ice|mojo|wave|disco|scope|velocity|hyper|tie[- ]dye)\b/i;

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9/]+/g, "");
const cardNo = (s: string | null | undefined) => norm(s).replace(/^#/, "").replace(/^no/, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D+/g, "");

/** Same thing written two ways? "Black & White Checker" vs "Black and White Checkerboard" count as the same. */
function sameish(a: string, b: string): boolean {
  const x = norm(a.replace(/&/g, "and")), y = norm(b.replace(/&/g, "and"));
  return !!x && !!y && (x === y || x.includes(y) || y.includes(x));
}

/** What the reader saw as the grade, e.g. "PSA 9", or null. */
export function readGrade(read: CardReadFields | null | undefined): string | null {
  if (!read || !read.graded?.value || !read.grade?.value) return null;
  return [read.grading_company?.value, read.grade.value].filter(Boolean).join(" ").trim() || null;
}

export function checkCard(c: CardCheckInput, read?: CardReadFields | null): CardIssue[] {
  const out: CardIssue[] = [];
  const graded = GRADE_RE.test(c.condition.trim());
  const photoGrade = readGrade(read);

  // ---- grade and cert number
  if (photoGrade && !graded) {
    out.push({
      id: "grade-photo", level: "fix",
      message: `The photo shows a ${photoGrade} slab, but Condition is ${c.condition.trim() ? `"${c.condition.trim()}"` : "empty"}. ` +
        `The word on the label (like "MINT 9") is the grade name, not the condition.`,
      fix: { label: `Use ${photoGrade}`, field: "condition", value: photoGrade },
    });
  } else if (photoGrade && graded && norm(photoGrade) !== norm(c.condition)) {
    out.push({
      id: "grade-differs", level: "fix",
      message: `The photo shows ${photoGrade}; you entered ${c.condition.trim()}.`,
      fix: { label: `Use ${photoGrade}`, field: "condition", value: photoGrade },
    });
  } else if (c.certNumber.trim() && !graded) {
    out.push({
      id: "cert-no-grade", level: "fix",
      message: "There's a cert number but no grade. Choose Graded under Condition and enter the company and grade (e.g. PSA 9), " +
        "so the website shows the grade.",
    });
  }
  const photoCert = read?.cert_number?.value || null;
  if ((graded || photoGrade) && !c.certNumber.trim()) {
    out.push(photoCert
      ? { id: "grade-no-cert", level: "note", message: `The label shows cert # ${photoCert}.`,
          fix: { label: `Use ${photoCert}`, field: "certNumber", value: photoCert } }
      : { id: "grade-no-cert", level: "note", message: "Add the cert number from the slab label so buyers can look it up." });
  }

  // ---- serial number
  const serial = c.serialNumber.trim();
  if (serial) {
    const m = serial.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) {
      out.push({ id: "serial-format", level: "fix", message: `Serial number "${serial}" should look like 07/76 (this card's number / how many were made).` });
    } else if (Number(m[1]) > Number(m[2])) {
      out.push({ id: "serial-order", level: "fix", message: `Serial number ${serial}: the first number can't be bigger than the second.` });
    }
  }

  // ---- flags the set name gives away
  const setPar = `${c.set} ${c.parallel}`;
  if (!c.autograph && /\b(auto(graph)?s?|signatures?|signed)\b/i.test(setPar)) {
    out.push({ id: "auto-flag", level: "fix", message: "The set name says autograph, but Autograph isn't checked.",
      fix: { label: "Check Autograph", field: "autograph", value: true } });
  }
  if (!c.rookie && /\b(rated rookie|rookies?|rc)\b/i.test(setPar)) {
    out.push({ id: "rookie-flag", level: "note", message: "The set name says rookie, but Rookie isn't checked.",
      fix: { label: "Check Rookie", field: "rookie", value: true } });
  }
  if (!c.parallel.trim() && PARALLEL_WORDS.test(c.set)) {
    out.push({ id: "parallel-in-set", level: "note",
      message: `"${c.set.trim()}" looks like it includes the parallel. Put the base set in Set (e.g. Prizm) and the color or pattern in Parallel.` });
  }

  // ---- money
  const price = parseFloat(c.askingPrice);
  // (A bin card over $20 is flagged right under the price field.)
  const cost = parseFloat(c.costBasis);
  if (!c.costBasis.trim()) {
    out.push({ id: "no-cost", level: "note", message: "No cost entered, so this card's profit will show as 100%." });
  } else if (price > 0 && cost > price) {
    out.push({ id: "below-cost", level: "note", message: `Asking price is below what you paid ($${cost.toFixed(2)}).` });
  }

  // ---- typed vs. photo (only where both have a value and they disagree)
  if (read) {
    const cmp = (id: string, label: string, typed: string, seen: string | null | undefined,
                 field: Extract<CardFix["field"], string>, same: (a: string, b: string) => boolean) => {
      if (!typed.trim() || !seen || same(typed, seen)) return;
      out.push({ id, level: "fix", message: `${label}: the photo shows "${seen}", you entered "${typed.trim()}".`,
        fix: { label: `Use ${seen}`, field, value: seen } as CardIssue["fix"] });
    };
    cmp("photo-player", "Player", c.playerName, read.player_name?.value, "playerName", (a, b) => norm(a) === norm(b));
    cmp("photo-year", "Year", c.year, read.year?.value, "year", (a, b) => digits(a) === digits(b));
    cmp("photo-number", "Card #", c.cardNumber, read.card_number?.value, "cardNumber", (a, b) => cardNo(a) === cardNo(b));
    cmp("photo-parallel", "Parallel", c.parallel, read.parallel?.value, "parallel", sameish);
    if (!c.parallel.trim() && read.parallel?.value) {
      out.push({ id: "photo-parallel-missing", level: "fix", message: `The photo shows the ${read.parallel.value} parallel, but Parallel is empty.`,
        fix: { label: `Use ${read.parallel.value}`, field: "parallel", value: read.parallel.value } });
    }
    cmp("photo-serial", "Serial #", c.serialNumber, read.serial_number?.value, "serialNumber", (a, b) => norm(a) === norm(b));
    if (photoGrade) cmp("photo-cert", "Cert #", c.certNumber, read.cert_number?.value, "certNumber", (a, b) => digits(a) === digits(b));
  }
  return out;
}
