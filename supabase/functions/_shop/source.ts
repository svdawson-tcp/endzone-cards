// How the buyer found us (0037): "How did you hear about us?" plus the buyer's first visit, sent by the
// cart (shop-checkout) and the offer pay page (shop-offer-pay). Both optional.
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

/** Saved on the order by web_set_order_source, which only fills blanks and drops bad values.
 *  Never fails checkout: a problem here is logged and ignored. */
export async function saveOrderSource(admin: SupabaseClient, orderId: string, b: Record<string, unknown> | null) {
  const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  const fv = b?.first_visit && typeof b.first_visit === "object" ? b.first_visit as Record<string, unknown> : {};
  const heard = str(b?.heard_from, 30);
  const at = str(fv.at, 40);
  const visit = at && !isNaN(Date.parse(at)) ? new Date(at).toISOString() : null;
  const p = {
    p_order_id: orderId, p_heard_from: heard, p_referrer: str(fv.ref, 300), p_landing: str(fv.landing, 300),
    p_utm_source: str(fv.us, 100), p_utm_medium: str(fv.um, 100), p_utm_campaign: str(fv.uc, 100), p_first_visit_at: visit,
  };
  if (!heard && !visit && !p.p_referrer && !p.p_landing) return;
  try {
    const { error } = await admin.rpc("web_set_order_source", p);
    if (error) console.error("web_set_order_source failed", error);
  } catch (e) {
    console.error("web_set_order_source failed", e);
  }
}
