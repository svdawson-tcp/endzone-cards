// EndZone → Website → On the Hunt (migration 0029): photos of cards Colton is looking for, shown on
// cssportscards.com/sell. Up to 12 visible; photos go to the public show_cards bucket under <owner>/hunt/.
import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Camera, ExternalLink, Eye, EyeOff, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { compressPhoto, photoFormat } from "@/lib/photoCompression";
import { formatMoney, normalizeMoneyInput } from "@/lib/numericUtils";
import type { Database } from "@/integrations/supabase/types";

type Hunt = Database["public"]["Tables"]["website_hunt"]["Row"];
const MAX_VISIBLE = 12;
const SELL_PAGE = "https://www.cssportscards.com/sell#on-the-hunt";

type Draft = { id: string | null; title: string; note: string; pay: string; photoUrl: string | null; file: File | null; preview: string | null };
const EMPTY: Draft = { id: null, title: "", note: "", pay: "", photoUrl: null, file: null, preview: null };

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? "");
  if (msg.includes("HUNT_FULL")) return `${MAX_VISIBLE} are already on the page. Hide or delete one first.`;
  if (msg.includes("website_hunt_photo_url")) return "That photo didn't save correctly. Pick it again.";
  return msg || "Please try again.";
}

/** Upload one photo to <owner>/hunt/ in the public show_cards bucket, retrying once (same as card photos). */
async function uploadHuntPhoto(userId: string, file: File): Promise<string> {
  const blob = await compressPhoto(file);
  const { ext, contentType } = photoFormat(blob);
  let last: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const path = `${userId}/hunt/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage.from("show_cards").upload(path, blob, { contentType, upsert: false });
    if (!error) return supabase.storage.from("show_cards").getPublicUrl(path).data.publicUrl;
    last = error;
    if (attempt === 1) await new Promise((r) => setTimeout(r, 1500));
  }
  console.error("Hunt photo upload failed", last);
  throw new Error("The photo didn't upload (the connection timed out). Check your signal and try again.");
}

/** Remove a photo we stored, if it's one of ours (best effort). */
async function removeHuntPhoto(url: string | null) {
  const m = url?.match(/\/object\/public\/show_cards\/(.+\/hunt\/[^/?#]+)$/);
  if (m) await supabase.storage.from("show_cards").remove([m[1]]);
}

export function HuntEditor({ ownerId, readOnly }: { ownerId: string; readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: items, isLoading } = useQuery({
    queryKey: ["websiteHunt", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_hunt").select("*").eq("user_id", ownerId)
        .order("sort_order").order("created_at");
      if (error) throw error;
      return (data || []) as Hunt[];
    },
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["websiteHunt"] });
  const visibleCount = (items || []).filter((h) => h.visible).length;

  const pickPhoto = (f: File | undefined) => {
    if (!f || !draft) return;
    if (draft.preview) URL.revokeObjectURL(draft.preview);
    setDraft({ ...draft, file: f, preview: URL.createObjectURL(f) });
  };

  const save = async () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return toast({ title: "Add a title", description: "e.g. Kobe Bryant rookies", variant: "destructive" });
    if (!draft.file && !draft.photoUrl) return toast({ title: "Add a photo", variant: "destructive" });
    const pay = draft.pay.trim() ? normalizeMoneyInput(draft.pay) : null;
    if (draft.pay.trim() && (pay === null || Number(pay) <= 0)) {
      return toast({ title: "Check the price", description: "A dollar amount, or leave it blank.", variant: "destructive" });
    }
    setBusy(true);
    let newUrl: string | null = null;
    try {
      if (draft.file) newUrl = await uploadHuntPhoto(ownerId, draft.file);
      const row = { title, note: draft.note.trim() || null, pay_up_to: pay === null ? null : Number(pay), photo_url: newUrl ?? draft.photoUrl! };
      if (draft.id) {
        const { error } = await supabase.from("website_hunt").update(row).eq("id", draft.id);
        if (error) throw error;
        if (newUrl && draft.photoUrl) await removeHuntPhoto(draft.photoUrl);
      } else {
        const nextOrder = Math.max(0, ...(items || []).map((h) => h.sort_order)) + 1;
        const { error } = await supabase.from("website_hunt").insert({ ...row, user_id: ownerId, sort_order: nextOrder, visible: visibleCount < MAX_VISIBLE });
        if (error) throw error;
      }
      toast({ title: draft.id ? "Saved" : visibleCount < MAX_VISIBLE ? "Added to the page" : "Saved (hidden: 12 already showing)" });
      if (draft.preview) URL.revokeObjectURL(draft.preview);
      setDraft(null);
      refresh();
    } catch (e) {
      if (newUrl) await removeHuntPhoto(newUrl);
      toast({ title: "Not saved", description: errorText(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (h: Hunt) => {
    setBusy(true);
    const { error } = await supabase.from("website_hunt").update({ visible: !h.visible }).eq("id", h.id);
    setBusy(false);
    if (error) toast({ title: "Not changed", description: errorText(error), variant: "destructive" });
    refresh();
  };

  const move = async (index: number, dir: -1 | 1) => {
    const list = items || [];
    const a = list[index], b = list[index + dir];
    if (!a || !b) return;
    setBusy(true);
    // Renumber everything so ties from older rows can't stall a move.
    const order = list.map((h) => h.id);
    [order[index], order[index + dir]] = [order[index + dir], order[index]];
    const results = await Promise.all(order.map((id, i) => supabase.from("website_hunt").update({ sort_order: i + 1 }).eq("id", id)));
    setBusy(false);
    const err = results.find((r) => r.error)?.error;
    if (err) toast({ title: "Not moved", description: errorText(err), variant: "destructive" });
    refresh();
  };

  const remove = async (h: Hunt) => {
    if (!window.confirm(`Delete "${h.title}" from On the Hunt?`)) return;
    setBusy(true);
    const { error } = await supabase.from("website_hunt").delete().eq("id", h.id);
    if (!error) await removeHuntPhoto(h.photo_url);
    setBusy(false);
    if (error) toast({ title: "Not deleted", description: errorText(error), variant: "destructive" });
    refresh();
  };

  return (
    <div className="night-game-card space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wide">On the Hunt</h2>
          <p className="text-sm text-muted-foreground">
            Photos of cards you're looking for, shown on the Got Cards? page. {visibleCount} of {MAX_VISIBLE} showing.
          </p>
        </div>
        <a href={SELL_PAGE} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center gap-1 text-sm text-accent">
          See it on the site <ExternalLink className="h-4 w-4" />
        </a>
      </div>

      {!readOnly && !draft && (
        <Button className="min-h-[44px] w-full font-semibold sm:w-auto" onClick={() => setDraft({ ...EMPTY })} disabled={busy}>
          <Plus className="mr-2 h-4 w-4" /> Add a card you're hunting
        </Button>
      )}

      {draft && (
        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="form-label">{draft.id ? "Edit" : "New"}</p>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex aspect-[4/3] w-full max-w-xs items-center justify-center overflow-hidden rounded-md border-2 border-dashed border-border bg-muted/20"
          >
            {draft.preview || draft.photoUrl ? (
              <img src={draft.preview || draft.photoUrl!} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex flex-col items-center gap-2 text-sm text-muted-foreground"><Camera className="h-6 w-6" /> Take or pick a photo</span>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ""; }} />
          <div>
            <label htmlFor="hunt-title" className="form-label">Title *</label>
            <Input id="hunt-title" className="mt-2 min-h-[44px]" maxLength={60} value={draft.title}
              placeholder="e.g. Kobe Bryant rookies" onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div>
            <label htmlFor="hunt-note" className="form-label">Short note</label>
            <Input id="hunt-note" className="mt-2 min-h-[44px]" maxLength={140} value={draft.note}
              placeholder="e.g. Any year, raw or graded" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
          </div>
          <div>
            <label htmlFor="hunt-pay" className="form-label">Paying up to (optional)</label>
            <CurrencyInput id="hunt-pay" value={draft.pay} onChange={(e) => setDraft({ ...draft, pay: e.target.value })} placeholder="Leave blank to hide" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-[44px]" disabled={busy}
              onClick={() => { if (draft.preview) URL.revokeObjectURL(draft.preview); setDraft(null); }}>Cancel</Button>
            <Button className="min-h-[44px] font-semibold" disabled={busy} onClick={save}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-32 w-full bg-muted/20" />
      ) : (items || []).length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">Nothing yet. The section stays hidden on the site until you add one.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {(items || []).map((h, i) => (
            <li key={h.id} className="flex gap-3 py-3" data-testid="hunt-row">
              <img src={h.photo_url} alt="" className={`h-20 w-20 shrink-0 rounded-md object-cover ${h.visible ? "" : "opacity-40"}`} loading="lazy" />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold leading-tight">{h.title}</p>
                  {!h.visible && <Badge variant="outline" className="text-xs">Hidden</Badge>}
                </div>
                {h.note && <p className="text-sm text-muted-foreground">{h.note}</p>}
                {h.pay_up_to != null && <p className="text-sm">Paying up to <span className="font-semibold">{formatMoney(h.pay_up_to)}</span></p>}
                {!readOnly && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button size="icon" variant="outline" className="h-11 w-11" aria-label="Move up" disabled={busy || i === 0} onClick={() => move(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="outline" className="h-11 w-11" aria-label="Move down" disabled={busy || i === (items || []).length - 1} onClick={() => move(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                    <Button size="icon" variant="outline" className="h-11 w-11" aria-label={h.visible ? "Hide" : "Show"} disabled={busy} onClick={() => toggle(h)}>
                      {h.visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="outline" className="h-11 w-11" aria-label="Edit" disabled={busy}
                      onClick={() => setDraft({ id: h.id, title: h.title, note: h.note || "", pay: h.pay_up_to != null ? Number(h.pay_up_to).toFixed(2) : "", photoUrl: h.photo_url, file: null, preview: null })}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="outline" className="h-11 w-11 text-destructive" aria-label="Delete" disabled={busy} onClick={() => remove(h)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
