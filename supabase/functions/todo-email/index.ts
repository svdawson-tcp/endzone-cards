// todo-email — EndZone To Do emails to Colton (0031). Runs hourly from pg_cron (todo_email_tick, at :31).
//  * Sunday digest from 6 pm ET: everything in Now and This week, leading with the monthly checkup when it's due.
//    Skipped (and logged) when there's nothing due or Colton has switched the weekly email off.
//  * Urgent, as soon as it applies: an estimated tax payment due within 3 days, a task marked urgent, or (0032)
//    a Got Cards? submission waiting 20 hours for a reply.
// The database decides what is due (todo_email_pending); this function only writes and sends the emails.
// Each email is logged only after Resend accepts it, so a failed send is retried on the next run;
// the log's unique key means nothing is sent twice. Safe to call any time.
import { adminClient, button, COLTON, ENDZONE, esc, layout, pause, sendEmail } from "../_shop/shared.ts";

type Item = {
  key: string; period: string; kind: string; tier: "now" | "week" | "later";
  title: string; body: string; due: string | null; overdue?: boolean; urgent?: boolean; added_by_mentor?: boolean; link?: string;
};
type Pending = { kind: "digest" | "urgent"; period_key: string; send: boolean; checkup?: boolean; items: Item[] };

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const fmtDate = (d: string) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

function itemRow(i: Item): string {
  const when = i.due && i.kind !== "tax_transfer"
    ? `<span style="color:${i.overdue ? "#C0392B" : "#666"}">${i.overdue ? "Overdue · " : ""}${esc(fmtDate(i.due))}</span>`
    : "";
  return `<tr><td style="padding:10px 0;border-bottom:1px solid #eee">
<div style="font-weight:bold;font-size:16px">${esc(i.title)}</div>
${i.body ? `<div style="color:#444;margin-top:2px">${esc(i.body)}</div>` : ""}
${when ? `<div style="font-size:13px;margin-top:4px">${when}</div>` : ""}</td></tr>`;
}

function section(label: string, items: Item[]): string {
  if (items.length === 0) return "";
  return `<h2 style="margin:20px 0 4px;font-size:15px;text-transform:uppercase;letter-spacing:1px;color:#1FA39A">${label}</h2>
<table role="presentation" width="100%">${items.map(itemRow).join("")}</table>`;
}

function digest(p: Pending): { subject: string; html: string } {
  const checkup = p.items.find((i) => i.kind === "checkup");
  const rest = p.items.filter((i) => i !== checkup);
  const now = rest.filter((i) => i.tier === "now");
  const week = rest.filter((i) => i.tier === "week");
  const n = p.items.length;
  const subject = checkup
    ? `Your ${checkup.title} is ready` + (rest.length ? ` + ${rest.length} more to do` : "")
    : `EndZone: ${n} thing${n === 1 ? "" : "s"} to do this week`;
  const lead = checkup
    ? `<p style="font-size:16px;margin:0 0 8px"><strong>${esc(checkup.title)} is ready.</strong> About 5 minutes: fees, supplies,
sales not entered yet, drives, and the bank check.</p>${button(`${ENDZONE}/checkup/${checkup.period}`, "Start the checkup")}`
    : `<p style="font-size:16px;margin:0 0 8px">Here's what's on your EndZone To Do list.</p>`;
  const html = layout("Your week in EndZone",
    lead + section("Now", now) + section("This week", week) +
    `<p style="margin-top:20px">${button(`${ENDZONE}/todo`, "Open To Do", "#1FA39A")}</p>
<p style="font-size:13px;color:#666;margin-top:16px">You can turn this Sunday email off at the bottom of the To Do screen.</p>`);
  return { subject, html };
}

function urgent(p: Pending): { subject: string; html: string } {
  const i = p.items[0];
  const subject = i.kind === "task" ? `Urgent: ${i.title}` : `Reminder: ${i.title}`;
  const html = layout(esc(i.title),
    `${i.body ? `<p style="font-size:16px">${esc(i.body)}</p>` : ""}
${i.due && i.kind !== "sell_lead" ? `<p style="color:#444">Due ${esc(fmtDate(i.due))}.</p>` : ""}
${i.kind === "task" && i.added_by_mentor ? `<p style="color:#444">Scott added this to your To Do list.</p>` : ""}
<p>${button(`${ENDZONE}${i.link && i.link.startsWith("/") ? i.link : "/todo"}`, i.kind === "sell_lead" ? "Reply now" : "Open To Do")}</p>`);
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const admin = adminClient();

  // The business owner (the website's owner account) gets the emails.
  const { data: ws, error: wsErr } = await admin.from("website_settings").select("owner_user_id").limit(1).maybeSingle();
  if (wsErr || !ws?.owner_user_id) {
    console.error("No website owner", wsErr);
    return json({ error: "no_owner" }, 500);
  }
  const owner = ws.owner_user_id as string;

  const { data, error } = await admin.rpc("todo_email_pending", { p_user_id: owner });
  if (error) {
    console.error("todo_email_pending failed", error);
    return json({ error: "db" }, 500);
  }
  const results: unknown[] = [];
  for (const p of (data ?? []) as Pending[]) {
    if (!p.send) {
      await admin.rpc("todo_email_mark", { p_user_id: owner, p_kind: p.kind, p_period_key: p.period_key, p_status: "skipped", p_item_count: p.items.length });
      results.push({ kind: p.kind, key: p.period_key, skipped: true });
      continue;
    }
    const msg = p.kind === "digest" ? digest(p) : urgent(p);
    const ok = await sendEmail({ to: COLTON, subject: msg.subject, html: msg.html, from: "site" });
    if (ok) {
      const { error: mErr } = await admin.rpc("todo_email_mark", {
        p_user_id: owner, p_kind: p.kind, p_period_key: p.period_key, p_status: "sent", p_item_count: p.items.length,
      });
      if (mErr) console.error("todo_email_mark failed", p.period_key, mErr);
    }
    results.push({ kind: p.kind, key: p.period_key, sent: ok });
    await pause();
  }
  return json({ ok: true, results });
});
