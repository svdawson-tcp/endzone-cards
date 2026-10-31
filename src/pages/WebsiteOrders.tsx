import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, isToday, isYesterday } from "date-fns";
import { AlertTriangle, Loader2, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useToast } from "@/hooks/use-toast";
import { PageContainer } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addBusinessDays, callShop, cardTitle, money2, shopErrorMessage, type CardInfo } from "@/lib/shopApi";

const ORDER_COLUMNS =
  "id, order_number, status, offer_id, buyer_email, buyer_name, ship_to, subtotal, shipping, tax, total, stripe_fee, problem, created_at, paid_at, shipped_at, carrier, tracking_number, shop_order_items(show_card_id, price, transaction_id, show_cards(player_name, year, card_details))";

type Item = { show_card_id: string; price: number; transaction_id: string | null; show_cards: CardInfo | null };
type Address = { line1?: string | null; line2?: string | null; city?: string | null; state?: string | null; postal_code?: string | null; country?: string | null };
type Order = {
  id: string;
  order_number: string;
  status: string;
  buyer_email: string | null;
  buyer_name: string | null;
  ship_to: { name?: string | null; address?: Address | null } | null;
  subtotal: number;
  shipping: number;
  tax: number;
  total: number | null;
  problem: string | null;
  created_at: string;
  paid_at: string | null;
  shipped_at: string | null;
  carrier: string | null;
  tracking_number: string | null;
  shop_order_items: Item[];
};

type Tab = "to_ship" | "shipped";
const CARRIERS = ["USPS", "UPS", "FedEx", "Other"];

const when = (iso: string) => {
  const d = new Date(iso);
  const day = isToday(d) ? "Today" : isYesterday(d) ? "Yesterday" : format(d, "EEE MMM d");
  return `${day} ${format(d, "h:mm a")}`;
};

/** Card ids in the problem text become player names, so Colton knows which card to refund. */
function readableProblem(o: Order): string {
  let text = o.problem ?? "";
  for (const it of o.shop_order_items) {
    if (it.show_cards) text = text.split(it.show_card_id).join(`${cardTitle(it.show_cards)} (${money2(it.price)})`);
  }
  return text.replace(/,(?=\S)/g, ", ");
}

export default function WebsiteOrders() {
  const queryClient = useQueryClient();
  const { getEffectiveUserId } = useMentorAccess();
  const [params] = useSearchParams();
  const focusId = params.get("order");
  const [tab, setTab] = useState<Tab>("to_ship");

  const { data: orders = [], isLoading, isError } = useQuery({
    queryKey: ["website-orders"],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("shop_orders")
        .select(ORDER_COLUMNS)
        .eq("user_id", userId)
        .in("status", ["paid", "shipped"])
        .order("paid_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Order[];
    },
  });

  const toShip = useMemo(
    () => orders.filter((o) => o.status === "paid").sort((a, b) => (a.paid_at ?? "").localeCompare(b.paid_at ?? "")),
    [orders]
  );
  const shipped = useMemo(() => orders.filter((o) => o.status === "shipped"), [orders]);

  // Coming from an offer's "See the order" link: open the tab that order is in.
  useEffect(() => {
    if (!focusId) return;
    const o = orders.find((x) => x.id === focusId);
    if (o) setTab(o.status === "shipped" ? "shipped" : "to_ship");
  }, [focusId, orders]);

  const shown = tab === "to_ship" ? toShip : shipped;

  return (
    <PageContainer maxWidth="2xl">
      <h1 className="page-title mb-1">WEBSITE ORDERS</h1>
      <p className="mb-4 text-muted-foreground">Paid orders from cssportscards.com, ready to pack and ship.</p>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {([
          ["to_ship", `To ship (${toShip.length})`],
          ["shipped", "Shipped"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "min-h-[40px] rounded-full border px-3 text-sm font-semibold transition-colors",
              tab === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
          Couldn't load orders. Try again in a minute.
        </p>
      ) : shown.length === 0 ? (
        <div className="rounded-lg bg-card p-6 text-center text-muted-foreground">
          {tab === "to_ship" ? "Nothing to ship. New paid orders show up here." : "No shipped orders yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((o) => (
            <OrderCard
              key={o.id}
              order={o}
              highlight={o.id === focusId}
              onShipped={() => {
                void queryClient.invalidateQueries({ queryKey: ["website-orders"] });
                void queryClient.invalidateQueries({ queryKey: ["website-badges"] });
              }}
            />
          ))}
        </div>
      )}

      {tab === "to_ship" && (
        <p className="mt-4 text-sm text-muted-foreground">
          Cards in a paid order were marked sold in EndZone the moment payment cleared, at the price paid. Your
          dashboard counts them like any other sale, tagged "Website".
        </p>
      )}
    </PageContainer>
  );
}

function OrderCard({ order: o, highlight, onShipped }: { order: Order; highlight: boolean; onShipped: () => void }) {
  const { toast } = useToast();
  const [packed, setPacked] = useState<Record<string, boolean>>({});
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const toShip = o.status === "paid";
  const shipBy = o.paid_at ? addBusinessDays(new Date(o.paid_at), 2) : null;
  const addr = o.ship_to?.address ?? null;
  const skipped = new Set((o.problem ?? "").match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) ?? []);

  const markShipped = async () => {
    setSending(true);
    setError("");
    try {
      await callShop({
        action: "order_shipped",
        order_id: o.id,
        ...(carrier ? { carrier } : {}),
        ...(tracking.trim() ? { tracking_number: tracking.trim() } : {}),
      });
      toast({ title: `${o.order_number} marked shipped`, description: "The buyer was emailed." });
      onShipped();
    } catch (e) {
      setError(shopErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <article
      className={cn("rounded-lg border bg-card p-4 shadow-card-shadow", highlight ? "border-primary" : "border-border")}
      data-testid="order-card"
    >
      {o.problem && (
        <div role="alert" className="mb-3 flex gap-2 rounded-lg border-2 border-red-500 bg-red-50 p-3 text-sm text-red-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div>
            <p className="font-bold">Refund needed in Stripe</p>
            <p className="mt-1 break-words">{readableProblem(o)}</p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl font-extrabold text-card-foreground">{o.order_number}</h2>
        {toShip ? (
          <span className="shrink-0 rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold text-green-800">
            Paid · ship by {shipBy ? format(shipBy, "EEE") : "soon"}
          </span>
        ) : (
          <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-800">
            Shipped {o.shipped_at ? format(new Date(o.shipped_at), "MMM d") : ""}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {o.paid_at ? when(o.paid_at) : when(o.created_at)} · {money2(o.subtotal)} cards + {money2(o.shipping)} shipping
        {Number(o.tax) > 0 && ` + ${money2(o.tax)} tax`}
        {o.total != null && ` = ${money2(o.total)}`}
      </p>

      <ul className="mt-3 divide-y divide-border border-y border-border">
        {o.shop_order_items.map((it) => {
          const refund = skipped.has(it.show_card_id);
          return (
            <li key={it.show_card_id} className="flex min-h-[44px] items-center gap-3 py-1.5">
              {toShip && !refund ? (
                <Checkbox
                  id={`pack-${o.id}-${it.show_card_id}`}
                  checked={!!packed[it.show_card_id]}
                  onCheckedChange={(v) => setPacked((p) => ({ ...p, [it.show_card_id]: v === true }))}
                  className="h-5 w-5 border-muted-foreground"
                  aria-label={`Packed ${cardTitle(it.show_cards)}`}
                />
              ) : null}
              <label
                htmlFor={`pack-${o.id}-${it.show_card_id}`}
                className={cn(
                  "flex-1 text-sm text-card-foreground",
                  packed[it.show_card_id] && "text-muted-foreground line-through",
                  refund && "text-red-300"
                )}
              >
                {cardTitle(it.show_cards)}
                {refund && <span className="ml-1 font-semibold">· don't ship, refund</span>}
              </label>
              <span className="text-sm font-semibold text-card-foreground">{money2(it.price)}</span>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-lg bg-muted p-3 text-sm text-card-foreground">
        <p className="font-bold">Ship to</p>
        <p>{o.ship_to?.name || o.buyer_name || "No name given"}</p>
        {addr ? (
          <>
            <p>{[addr.line1, addr.line2].filter(Boolean).join(", ")}</p>
            <p>
              {[addr.city, addr.state].filter(Boolean).join(", ")} {addr.postal_code}
              {addr.country && addr.country !== "US" ? ` · ${addr.country}` : ""}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No address on file. Check the payment in Stripe.</p>
        )}
        {o.buyer_email && <p className="mt-1 break-all text-muted-foreground">{o.buyer_email}</p>}
      </div>

      {toShip ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-2">
            <div>
              <label htmlFor={`carrier-${o.id}`} className="text-sm font-semibold text-card-foreground">
                Carrier
              </label>
              <Select value={carrier} onValueChange={setCarrier}>
                <SelectTrigger id={`carrier-${o.id}`} className="mt-1 min-h-[44px]">
                  <SelectValue placeholder="Optional" />
                </SelectTrigger>
                <SelectContent>
                  {CARRIERS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor={`tracking-${o.id}`} className="text-sm font-semibold text-card-foreground">
                Tracking number
              </label>
              <Input
                id={`tracking-${o.id}`}
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                placeholder="Paste or scan"
                maxLength={60}
                autoComplete="off"
                className="mt-1 min-h-[44px]"
              />
            </div>
          </div>
          {error && (
            <p role="alert" className="rounded-lg border border-red-400 bg-red-50 p-3 text-sm text-red-900">
              {error}
            </p>
          )}
          <Button
            type="button"
            onClick={() => void markShipped()}
            disabled={sending}
            className="min-h-[48px] w-full bg-primary text-base font-bold text-primary-foreground hover:bg-primary/90"
          >
            {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Truck className="h-5 w-5" />}
            Mark shipped and email buyer
          </Button>
        </div>
      ) : (
        <p className="mt-3 text-sm text-card-foreground">
          <span className="font-semibold">Tracking:</span>{" "}
          {o.tracking_number ? (
            <span className="break-all">
              {o.carrier ? `${o.carrier} ` : ""}
              {o.tracking_number}
            </span>
          ) : (
            <span className="text-muted-foreground">none added{o.carrier ? ` (${o.carrier})` : ""}</span>
          )}
          {o.shipped_at && <span className="text-muted-foreground"> · shipped {when(o.shipped_at)}</span>}
        </p>
      )}
    </article>
  );
}
