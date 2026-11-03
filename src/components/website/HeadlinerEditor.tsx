import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

const NOTE_MAX = 160;

type PickCard = {
  id: string;
  player_name: string;
  year: string | null;
  card_details: Record<string, unknown> | null;
  asking_price: number | null;
  photo_front_url: string | null;
  status: string;
  show_on_website: boolean;
  in_bargain_bin: boolean;
};

const CARD_COLS = "id, player_name, year, card_details, asking_price, photo_front_url, status, show_on_website, in_bargain_bin";

function cardLine(c: PickCard): string {
  const d = (c.card_details || {}) as Record<string, string | null>;
  return [c.year, d.brand, d.set, d.parallel].map((v) => (v ?? "").toString().trim()).filter(Boolean).join(" ");
}

function money(n: number | null): string {
  return n == null ? "" : `$${Number(n).toFixed(2)}`;
}

/**
 * Weekly Headliner: the one case card featured at the top of the cssportscards.com home page, with Colton's line on why.
 * Only cards in Shop the Case can be picked (on the website, available, not Bargain Bin). If the headliner sells,
 * the home page keeps showing it stamped SOLD until a new one is picked.
 */
export function HeadlinerEditor({ ownerId, readOnly }: { ownerId: string; readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pickId, setPickId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ["websiteHeadliner", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("website_settings")
        .select("headliner_card_id, headliner_note")
        .eq("owner_user_id", ownerId)
        .maybeSingle();
      if (error) throw error;
      let card: PickCard | null = null;
      if (data?.headliner_card_id) {
        const res = await supabase.from("show_cards").select(CARD_COLS).eq("id", data.headliner_card_id).maybeSingle();
        if (res.error) throw res.error;
        card = res.data as PickCard | null;
      }
      return { cardId: data?.headliner_card_id ?? null, note: data?.headliner_note ?? "", card };
    },
  });

  const { data: caseCards = [], isLoading: loadingCards } = useQuery({
    queryKey: ["websiteHeadlinerChoices", ownerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("show_cards")
        .select(CARD_COLS)
        .eq("user_id", ownerId)
        .eq("status", "available")
        .eq("show_on_website", true)
        .eq("in_bargain_bin", false)
        .gte("asking_price", 10)
        .order("asking_price", { ascending: false });
      if (error) throw error;
      return (data || []) as PickCard[];
    },
  });

  // Start the form from what's on the site now.
  useEffect(() => {
    if (!current) return;
    setPickId(current.cardId);
    setNote(current.note || "");
  }, [current]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return caseCards;
    return caseCards.filter((c) => `${c.player_name} ${cardLine(c)}`.toLowerCase().includes(q));
  }, [caseCards, search]);

  const dirty = !!current && (pickId !== current.cardId || note.trim() !== (current.note || "").trim());

  const save = async (cardId: string | null, noteText: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("website_settings")
        .update({ headliner_card_id: cardId, headliner_note: cardId ? noteText.trim() || null : null })
        .eq("owner_user_id", ownerId);
      if (error) throw error;
      toast({ title: cardId ? "Weekly Headliner saved" : "Weekly Headliner removed", description: "Live on the home page within a minute." });
      queryClient.invalidateQueries({ queryKey: ["websiteHeadliner", ownerId] });
    } catch (e) {
      console.error("Headliner save failed", e);
      toast({ title: "Not saved", description: "Please try again.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  if (loadingCurrent) return <Skeleton className="h-40 w-full" />;

  const live = current?.card;
  const picked = caseCards.find((c) => c.id === pickId) || (live && live.id === pickId ? live : null);

  return (
    <div className="space-y-4">
      <div className="night-game-card space-y-3 p-4 md:p-6" data-testid="headliner-now">
        <h2 className="text-lg font-bold text-foreground">On the home page now</h2>
        {live ? (
          <div className="flex items-start gap-3">
            {live.photo_front_url ? (
              <img src={live.photo_front_url} alt="" className="h-28 w-20 flex-none rounded object-cover" />
            ) : (
              <div className="flex h-28 w-20 flex-none items-center justify-center rounded bg-muted">
                <ImageIcon className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0 space-y-1">
              <p className="font-bold text-foreground">{live.player_name}</p>
              <p className="text-sm text-muted-foreground">{cardLine(live)}</p>
              <p className="text-sm font-semibold text-foreground">{money(live.asking_price)}</p>
              {live.status === "sold" && <Badge variant="destructive">SOLD: pick a new headliner</Badge>}
              {live.status === "available" && (!live.show_on_website || live.in_bargain_bin) && (
                <Badge variant="outline">Not in Shop the Case, so it's hidden. Pick another.</Badge>
              )}
              {current?.note && <p className="text-sm italic text-muted-foreground">"{current.note}"</p>}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No headliner picked. The home page skips that spot until you choose one.
          </p>
        )}
        {live && !readOnly && (
          <Button variant="outline" className="min-h-[44px]" disabled={saving} onClick={() => save(null, "")}>
            Remove from home page
          </Button>
        )}
      </div>

      {!readOnly && (
        <div className="night-game-card space-y-4 p-4 md:p-6">
          <div>
            <h2 className="text-lg font-bold text-foreground">Pick this week's headliner</h2>
            <p className="text-sm text-muted-foreground">Any card in Shop the Case. Bargain Bin cards can't headline.</p>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search player, set, parallel"
              className="min-h-[44px] pl-9"
            />
          </div>
          {loadingCards ? (
            <Skeleton className="h-40 w-full" />
          ) : shown.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {caseCards.length === 0 ? "No cards are in Shop the Case yet." : "No cards match."}
            </p>
          ) : (
            <div className="grid max-h-[420px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3" data-testid="headliner-choices">
              {shown.map((c) => {
                const on = c.id === pickId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setPickId(c.id)}
                    aria-pressed={on}
                    className={`relative flex min-h-[44px] flex-col rounded-lg border-2 p-2 text-left transition ${
                      on ? "border-[hsl(var(--accent))] bg-[hsl(var(--accent))]/10" : "border-border hover:border-muted-foreground"
                    }`}
                  >
                    {on && (
                      <span className="absolute right-1 top-1 rounded-full bg-[hsl(var(--accent))] p-0.5 text-white">
                        <Check className="h-4 w-4" />
                      </span>
                    )}
                    {c.photo_front_url ? (
                      <img src={c.photo_front_url} alt="" className="mb-2 h-32 w-full rounded object-cover" loading="lazy" />
                    ) : (
                      <div className="mb-2 flex h-32 w-full items-center justify-center rounded bg-muted">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                    <span className="text-sm font-semibold leading-tight text-foreground">{c.player_name}</span>
                    <span className="text-xs leading-tight text-muted-foreground">{cardLine(c)}</span>
                    <span className="mt-1 text-sm font-semibold text-foreground">{money(c.asking_price)}</span>
                  </button>
                );
              })}
            </div>
          )}

          <div>
            <label htmlFor="headliner-note" className="form-label">Why it's the headliner (one line)</label>
            <Textarea
              id="headliner-note"
              value={note}
              maxLength={NOTE_MAX}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Rookie-year PSA 10 of the WNBA's biggest star."
              className="mt-2"
            />
            <p className="mt-1 text-xs text-muted-foreground">{note.length}/{NOTE_MAX}</p>
          </div>

          <Button
            className="min-h-[44px] w-full bg-[#041E42] font-semibold uppercase text-white hover:bg-[#0A2E63]"
            disabled={!pickId || !picked || !dirty || saving}
            onClick={() => save(pickId, note)}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {picked ? `Make ${picked.player_name} the headliner` : "Pick a card"}
          </Button>
        </div>
      )}
    </div>
  );
}
