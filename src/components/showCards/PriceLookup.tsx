import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { format } from "date-fns";
import { ebaySoldUrl, lookupQuery, PRICE_SOURCES, tcgplayerUrl, type LookupCard } from "@/lib/priceLookup";

/** Two buttons that open eBay sold listings and TCGplayer already searched for this card. */
export function PriceLookupButtons({ card, compact }: { card: LookupCard; compact?: boolean }) {
  const q = lookupQuery(card);
  if (!q) return null;
  const btn = "flex-1 min-h-[44px] inline-flex items-center justify-center gap-2 rounded-md border-2 border-[hsl(var(--silver-base))]/40 px-3 text-sm font-semibold uppercase text-white hover:bg-white/10";
  return (
    <div className="space-y-1" data-testid="price-lookup">
      <div className="flex gap-2">
        <a className={btn} href={ebaySoldUrl(card)} target="_blank" rel="noopener noreferrer" data-testid="lookup-ebay">
          eBay Sold <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
        <a className={btn} href={tcgplayerUrl(card)} target="_blank" rel="noopener noreferrer" data-testid="lookup-tcgplayer">
          TCGplayer <ExternalLink className="h-4 w-4" aria-hidden />
        </a>
      </div>
      {!compact && <p className="text-xs text-[hsl(var(--silver-base))]">Searches for: {q}</p>}
    </div>
  );
}

type MarketCard = LookupCard & {
  id: string;
  asking_price?: number | string | null;
  market_price?: number | string | null;
  market_price_source?: string | null;
  market_price_at?: string | null;
};

/** Card page: look the card up, then save what it's selling for ("market check"). */
export function MarketCheck({ card }: { card: MarketCard }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState("");
  const [source, setSource] = useState("ebay_sold");
  const [saving, setSaving] = useState(false);

  const market = card.market_price != null ? Number(card.market_price) : null;
  const asking = card.asking_price != null ? Number(card.asking_price) : null;
  const diff = market != null && asking ? asking - market : null;

  const save = async (clear = false) => {
    const value = clear ? null : Number(String(price).replace(/[$,\s]/g, ""));
    if (!clear && !(value != null && value >= 0 && Number.isFinite(value))) {
      toast({ title: "Enter the price you found", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("show_cards").update({
      market_price: value,
      market_price_source: clear ? null : source,
      market_price_at: clear ? null : new Date().toISOString(),
    }).eq("id", card.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
      return;
    }
    setEditing(false);
    queryClient.invalidateQueries({ queryKey: ["show-card", card.id] });
    toast({ title: clear ? "Market check cleared" : "Market check saved" });
  };

  return (
    <div className="space-y-3 border-t border-[hsl(var(--silver-base))]/20 pt-4" data-testid="market-check">
      <p className="text-sm font-semibold text-[hsl(var(--silver-light))]">Look up prices</p>
      <PriceLookupButtons card={card} />
      {market != null && !editing && (
        <div className="flex items-baseline justify-between gap-3" data-testid="market-saved">
          <div>
            <p className="text-sm text-[hsl(var(--silver-base))]">
              Market check · {PRICE_SOURCES[card.market_price_source ?? "other"] ?? "Other"}
              {card.market_price_at ? ` · ${format(new Date(card.market_price_at), "MMM d, yyyy")}` : ""}
            </p>
            {diff != null && Math.abs(diff) >= 0.01 && (
              <p className={`text-xs ${diff > 0 ? "text-amber-300" : "text-[hsl(var(--silver-base))]"}`}>
                Asking is ${Math.abs(diff).toFixed(2)} {diff > 0 ? "above" : "below"} this
              </p>
            )}
          </div>
          <p className="text-2xl font-bold text-white">${market.toFixed(2)}</p>
        </div>
      )}
      {editing ? (
        <div className="space-y-3" data-testid="market-form">
          <div>
            <label htmlFor="market-price" className="form-label">What's it selling for?</label>
            <CurrencyInput id="market-price" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" min={0} step={0.01} className="mt-2" />
          </div>
          <div className="flex gap-2" role="group" aria-label="Where you found it">
            {Object.entries(PRICE_SOURCES).map(([k, label]) => (
              <Button key={k} type="button" variant={source === k ? "default" : "outline"} aria-pressed={source === k}
                className="flex-1 min-h-[44px]" onClick={() => setSource(k)}>{label}</Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" className="flex-1 min-h-[44px]" disabled={saving} onClick={() => save()} data-testid="market-save">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "SAVE"}
            </Button>
            <Button type="button" variant="outline" className="flex-1 min-h-[44px]" onClick={() => setEditing(false)}>CANCEL</Button>
          </div>
          {market != null && (
            <button type="button" className="text-xs underline text-[hsl(var(--silver-base))]" onClick={() => save(true)}>Clear market check</button>
          )}
        </div>
      ) : (
        <Button type="button" variant="outline" className="w-full min-h-[44px]" data-testid="market-edit"
          onClick={() => { setPrice(market != null ? market.toFixed(2) : ""); setSource(card.market_price_source ?? "ebay_sold"); setEditing(true); }}>
          {market != null ? "UPDATE MARKET CHECK" : "SAVE WHAT YOU FOUND"}
        </Button>
      )}
    </div>
  );
}
