// Dashboard → Buyers (0037): first-time vs returning buyers, repeat share, and how new website buyers found us.
// All counting happens in get_buyer_kpis; this only formats it.
import { useQuery } from "@tanstack/react-query";
import { Repeat, UserPlus, Users, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { KpiInfoPopover } from "@/components/ui/KpiInfoPopover";
import { Skeleton } from "@/components/ui/skeleton";
import { kpiTooltips } from "@/data/kpiTooltips";

type BuyerKpis = {
  buyers: number; new_buyers: number; returning_buyers: number;
  buyer_sales: number; repeat_sales: number; new_sales: number;
  buyers_to_date: number; repeat_to_date: number;
  untagged_sales: number; untagged_count: number;
  new_found_via: { via: string; buyers: number }[];
};

const VIA_LABELS: Record<string, string> = {
  google: "Google", facebook: "Facebook", instagram: "Instagram", ai: "ChatGPT / AI",
  craigslist_nextdoor: "Craigslist / Nextdoor", show: "A card show", card_flyer: "Card, flyer or insert",
  friend: "Friend or family", other: "Something else", other_site: "Another website",
  direct: "Typed in / saved link", unknown: "Not recorded", not_website: "Facebook / show sale",
};

const money = (v: unknown) => `$${Number(v || 0).toFixed(2)}`;
const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function BuyersSection({ start, end, enabled }: { start: string | null; end: string | null; enabled: boolean }) {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  const { data, isLoading } = useQuery({
    queryKey: ["buyerKpis", viewingUserId, start, end],
    enabled,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_buyer_kpis", { p_user_id: userId, p_start: start, p_end: end });
      if (error) throw error;
      return data as unknown as BuyerKpis;
    },
  });

  const k = data;
  const tiles = [
    { icon: UserPlus, title: "First-Time Buyers", tooltip: kpiTooltips.newBuyers,
      value: k ? String(k.new_buyers) : "", sub: k ? `${money(k.new_sales)} in first purchases` : "" },
    { icon: Repeat, title: "Returning Buyers", tooltip: kpiTooltips.returningBuyers,
      value: k ? String(k.returning_buyers) : "", sub: k ? `${money(k.repeat_sales)} from repeat purchases` : "" },
    { icon: Percent, title: "Sales From Repeat Buyers", tooltip: kpiTooltips.repeatSales,
      value: k ? pct(Number(k.repeat_sales), Number(k.buyer_sales)) : "", sub: k ? `of ${money(k.buyer_sales)} from known buyers` : "" },
    { icon: Users, title: "Repeat Rate", tooltip: kpiTooltips.repeatRate,
      value: k ? pct(k.repeat_to_date, k.buyers_to_date) : "", sub: k ? `${k.repeat_to_date} of ${k.buyers_to_date} buyers came back` : "" },
  ];
  const via = (k?.new_found_via ?? []).filter((v) => v.buyers > 0);
  const viaMax = Math.max(1, ...via.map((v) => v.buyers));

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">Buyers</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {tiles.map((t) => (
          <div key={t.title} className="night-game-card p-4 md:p-6 relative">
            <KpiInfoPopover content={t.tooltip} />
            <t.icon className="h-7 w-7 md:h-8 md:w-8 text-accent mb-3 md:mb-4" />
            <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-1 pr-8">{t.title}</h3>
            {isLoading || !k ? (
              <Skeleton className="h-9 w-2/3 bg-muted/20" />
            ) : (
              <>
                <div className="text-2xl md:text-3xl font-bold text-foreground">{t.value}</div>
                <p className="text-xs md:text-sm text-muted-foreground mt-2">{t.sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {k && (via.length > 0 || Number(k.untagged_count) > 0) && (
        <div className="night-game-card p-4 md:p-6 relative">
          <KpiInfoPopover content={kpiTooltips.foundVia} />
          <h3 className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3 pr-8">
            How first-time buyers found us
          </h3>
          {via.length > 0 ? (
            <div className="space-y-3 pr-8">
              {via.map((v) => (
                <div key={v.via} className="space-y-1">
                  <div className="flex justify-between items-baseline gap-3">
                    <span className="text-sm text-foreground">{VIA_LABELS[v.via] ?? v.via}</span>
                    <span className="text-sm text-foreground">{v.buyers}</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted/30">
                    <div className="h-1.5 rounded-full bg-accent" style={{ width: `${(v.buyers / viaMax) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No first-time buyers in this period.</p>
          )}
          {Number(k.untagged_count) > 0 && (
            <p className="text-xs text-muted-foreground mt-4">
              {k.untagged_count} Facebook/show {k.untagged_count === 1 ? "sale" : "sales"} ({money(k.untagged_sales)}) in this
              period {k.untagged_count === 1 ? "has" : "have"} no buyer name, so {k.untagged_count === 1 ? "it isn't" : "they aren't"} counted above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
