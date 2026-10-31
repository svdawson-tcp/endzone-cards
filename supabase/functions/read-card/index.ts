// EndZone "read-card" Edge Function — see card_reader.ts for what it does and the rules it follows.
import { adminClient, checkImage, cors, json, loggedRead } from "./card_reader.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return json(req, 405, { error: "method_not_allowed" });

  const admin = adminClient();

  // Who is asking: a signed-in EndZone user.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(req, 401, { error: "not_signed_in" });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json(req, 401, { error: "not_signed_in" });
  const userId = userData.user.id;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: "bad_request" });
  }
  const front = checkImage(body.front);
  const back = body.back == null ? null : checkImage(body.back);
  if (!front || (body.back != null && !back)) return json(req, 400, { error: "bad_image" });

  try {
    const r = await loggedRead(admin, userId, "app", front, back);
    if (r.limited) return json(req, 429, { error: "daily_limit" });
    return json(req, 200, { is_sports_card: r.is_sports_card, fields: r.fields });
  } catch (e) {
    console.error("read-card failed:", e instanceof Error ? e.message : e);
    return json(req, 502, { error: "read_failed" });
  }
});
