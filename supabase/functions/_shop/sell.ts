// "Got Cards?" seller intake (migration 0027): shared wording and emails for sell-submit and sell-respond.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { COLTON, ENDZONE, button, esc, layout, money, sendEmail } from "./shared.ts";

/** What the site promises (keep in step with sell.html). */
export const REPLY_PROMISE = "within 24 hours";
export const COLTON_PHONE = "(570) 452-3625";
export const PHOTO_BUCKET = "sell-photos";
export const MAX_PHOTOS = 10;
/** Scott, 14 Nov 2026: CS sends a prepaid label once a seller accepts an offer of this much or more. */
export const PREPAID_LABEL_MIN = 100;
export const MEETUP_AREA = "within about 90 minutes of Harrisburg";

export const CATEGORY_LABELS: Record<string, string> = {
  football: "Football", basketball: "Basketball", baseball: "Baseball", hockey: "Hockey", soccer: "Soccer",
  pokemon: "Pokémon", disney: "Disney", marvel: "Marvel", "not sure": "Not sure",
};
export const HANDOFF_LABELS: Record<string, string> = {
  show: "Meet at a show", meetup: "Meet up (within ~90 min of Harrisburg)", ship: "Ship them in (lower 48)", "not sure": "Not sure yet",
};

export type Lead = {
  id: string; user_id: string; seller_name: string; seller_email: string; seller_phone: string | null;
  zip: string | null; categories: string[]; card_count: string | null; graded: string | null; era: string | null;
  details: string | null; asking_price: number | null; handoff: string | null; photo_paths: string[];
  status: string; offer_amount: number | null; created_at: string;
};

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";

function rows(pairs: [string, string | null | undefined][]): string {
  return `<table role="presentation" style="margin:4px 0 16px;font-size:15px">${pairs
    .filter(([, v]) => v)
    .map(([k, v]) =>
      `<tr><td style="padding:5px 14px 5px 0;color:#666;vertical-align:top;white-space:nowrap">${esc(k)}</td>` +
      `<td style="padding:5px 0;vertical-align:top">${v}</td></tr>`)
    .join("")}</table>`;
}

function leadRows(l: Lead): string {
  return rows([
    ["Name", esc(l.seller_name)],
    ["Email", `<a href="mailto:${esc(l.seller_email)}">${esc(l.seller_email)}</a>`],
    ["Phone", l.seller_phone ? esc(l.seller_phone) : null],
    ["Zip", l.zip ? esc(l.zip) : null],
    ["Cards", l.categories.length ? esc(l.categories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ")) : null],
    ["How many", l.card_count ? esc(l.card_count) : null],
    ["Graded", l.graded ? esc(l.graded.charAt(0).toUpperCase() + l.graded.slice(1)) : null],
    ["Mostly from", l.era ? esc(l.era) : null],
    ["Asking", l.asking_price != null ? money(l.asking_price) : "No price given"],
    ["Handoff", l.handoff ? esc(HANDOFF_LABELS[l.handoff] ?? l.handoff) : null],
    ["Details", l.details ? esc(l.details).replace(/\n/g, "<br>") : null],
  ]);
}

/** Signed links to the private photos (Colton's email; good for 30 days, EndZone always has fresh ones). */
export async function signedPhotoUrls(admin: SupabaseClient, paths: string[]): Promise<string[]> {
  if (!paths.length) return [];
  const { data, error } = await admin.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 60 * 60 * 24 * 30);
  if (error || !data) {
    console.error("signed photo urls failed", error);
    return [];
  }
  return data.map((d) => d.signedUrl).filter(Boolean) as string[];
}

export async function emailColtonNewLead(l: Lead, photoUrls: string[]) {
  const photos = photoUrls.length
    ? `<p style="margin:0 0 8px;font-weight:bold">Photos (${photoUrls.length})</p><p style="margin:0 0 16px">${
      photoUrls.map((u, i) =>
        `<a href="${esc(u)}"><img src="${esc(u)}" alt="Photo ${i + 1}" width="120" style="width:120px;height:120px;object-fit:cover;border-radius:6px;border:1px solid #ddd;margin:0 6px 6px 0"></a>`
      ).join("")}</p>`
    : "<p>No photos.</p>";
  await sendEmail({
    to: COLTON,
    from: "site",
    replyTo: l.seller_email,
    subject: `Got Cards? ${l.seller_name}${l.card_count ? " · " + l.card_count : ""}`,
    html: layout(
      "Someone wants to sell you cards",
      `${leadRows(l)}${photos}
<p>${button(`${ENDZONE}/sellers?lead=${l.id}`, "OPEN IN ENDZONE")}</p>
<p style="color:#666;font-size:14px">Send an offer, ask for more photos or pass from EndZone, or just reply to this email / call or text them and log it there. The site told them you'd answer ${REPLY_PROMISE}.</p>`,
    ),
  });
}

export async function emailSellerReceived(l: Lead) {
  await sendEmail({
    to: l.seller_email,
    replyTo: COLTON,
    subject: "We got your photos — CS Sports Cards",
    html: layout(
      `Thanks, ${esc(firstName(l.seller_name))}!`,
      `<p>Your photos and details are in. Colton will look them over himself and get back to you ${REPLY_PROMISE}.</p>
<p>No obligation: an offer is just an offer, and you keep your cards until you decide.</p>
<p>Here's what you sent:</p>${leadRows(l)}
<p style="color:#666;font-size:14px">Questions? Just reply to this email.</p>`,
    ),
  });
}

export async function emailSellerReply(l: Lead, action: "offer" | "ask_more" | "pass", amount: number | null, message: string) {
  const note = message ? `<p style="white-space:pre-wrap;border-left:4px solid #1FA39A;padding:8px 12px;background:#f6f6f6">${esc(message)}</p>` : "";
  const sign = `<p>Thanks,<br>Colton<br><span style="color:#666">CS Sports Cards &amp; Collectibles · ${COLTON_PHONE} (call or text)</span></p>`;
  let subject: string, heading: string, body: string;
  if (action === "offer") {
    subject = `Our offer for your cards: ${money(amount)}`;
    heading = `Our offer: ${money(amount)}`;
    body = `<p>Hi ${esc(firstName(l.seller_name))}, thanks for sending your cards over. Based on your photos, we can offer <b>${money(amount)}</b>.</p>${note}
<p>To take it, ask a question or set up the handoff, just reply to this email or call or text ${COLTON_PHONE}. No pressure if it's not for you.</p>
<p><b>Handing them over:</b> we can meet up ${MEETUP_AREA}, see you at a show, or you can ship them from anywhere in the lower 48. ${
      (amount ?? 0) >= PREPAID_LABEL_MIN
        ? "Shipping? Once you say yes, we'll email you a prepaid shipping label."
        : "Shipping? Once you say yes, we'll send our address. Please ship with tracking."
    } We check the cards in person (or when they arrive) and pay you right away.</p>${sign}`;
  } else if (action === "ask_more") {
    subject = "A quick question about your cards";
    heading = "A quick question";
    body = `<p>Hi ${esc(firstName(l.seller_name))}, thanks for sending your cards over. Before we make an offer:</p>${note}
<p>Just reply to this email with photos or answers, or call or text ${COLTON_PHONE}.</p>${sign}`;
  } else {
    subject = "About the cards you sent us";
    heading = "Thanks for thinking of us";
    body = `<p>Hi ${esc(firstName(l.seller_name))}, thanks for sending your cards over. We're going to pass on these for now. It's usually about what we can resell, not the cards themselves.</p>${note}
<p>If you have others, send them anytime at <a href="https://www.cssportscards.com/sell">cssportscards.com/sell</a>.</p>${sign}`;
  }
  return await sendEmail({ to: l.seller_email, replyTo: COLTON, subject, html: layout(heading, body) });
}
