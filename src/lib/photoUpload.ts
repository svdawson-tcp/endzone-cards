// Upload a card photo to the show_cards bucket, retrying once. Storage sometimes stalls for a minute and
// answers with a plain-text 504, which iPhone Safari reports as "The string did not match the expected
// pattern". Retry once with a fresh file name, then give a message Colton can act on.
import { supabase } from "@/integrations/supabase/client";
import { photoFormat } from "@/lib/photoCompression";

export async function uploadCardPhoto(userId: string, side: "front" | "back", blob: Blob): Promise<string> {
  const { ext, contentType } = photoFormat(blob);
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const path = `${userId}/${Date.now()}_${side}.${ext}`;
    try {
      const { error } = await supabase.storage.from("show_cards").upload(path, blob, { contentType, upsert: false });
      if (error) throw error;
      return supabase.storage.from("show_cards").getPublicUrl(path).data.publicUrl;
    } catch (e) {
      lastError = e;
      console.error(`Photo upload attempt ${attempt} failed`, e);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
    }
  }
  console.error("Photo upload gave up", lastError);
  throw new Error(`The ${side} photo didn't upload (the connection timed out). Everything you typed is still here: check your signal and tap save again.`);
}
