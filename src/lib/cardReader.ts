// Card reader: sends the card photos to the read-card Edge Function, which reads the details with Claude.
// Photos are shrunk to a 1200px long edge first: plenty for reading text, and it keeps each read about a cent.
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type ReadField<T = string | null> = { value: T; sure: boolean; note: string | null };

export type CardReadFields = {
  player_name: ReadField;
  year: ReadField;
  brand: ReadField;
  set_name: ReadField;
  card_number: ReadField;
  parallel: ReadField;
  serial_number: ReadField;
  rookie: ReadField<boolean>;
  autograph: ReadField<boolean>;
  graded: ReadField<boolean>;
  grading_company: ReadField;
  grade: ReadField;
  cert_number: ReadField;
  sport: ReadField;
  team: ReadField;
};

export type CardReadResult =
  | { status: "ok"; isSportsCard: boolean; fields: CardReadFields }
  | { status: "limit" }
  | { status: "error" };

type PreparedImage = { data: string; media_type: "image/jpeg" };

const MAX_EDGE = 1200;

/** Shrink a photo (a picked File, or the URL of an already-saved photo) to a JPEG for reading. */
export async function prepareForReading(source: File | Blob | string): Promise<PreparedImage> {
  const blob = typeof source === "string" ? await (await fetch(source)).blob() : source;
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.drawImage(bitmap, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    return { data: dataUrl.slice(dataUrl.indexOf(",") + 1), media_type: "image/jpeg" };
  } finally {
    bitmap.close();
  }
}

export async function readCard(front: PreparedImage, back: PreparedImage | null): Promise<CardReadResult> {
  const { data, error } = await supabase.functions.invoke("read-card", {
    body: back ? { front, back } : { front },
  });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context?.status === 429) return { status: "limit" };
    console.error("Card read failed:", error);
    return { status: "error" };
  }
  if (!data?.fields) return { status: "error" };
  return { status: "ok", isSportsCard: data.is_sports_card !== false, fields: data.fields as CardReadFields };
}
