import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Layers, Loader2, PackageCheck, Truck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { centsToMoney, formatMoney, moneyToCents } from "@/lib/numericUtils";
import { formatMoment, formatShippingAddress } from "@/lib/webShop";
import type { Json } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import { useWebsiteSettings } from "@/hooks/useWebsiteSettings";
import { StackLinks } from "@/components/website/StackLinks";

const PAGE_SIZE = 50;

type OrderRow = {
  id: string;
  order_number: string;
  source: string;
  status: string;
  buyer_email: string | null;
  buyer_name: string | null;
  shipping_address: Json | null;
  subtotal: number;
  shipping: number;
  /** Shipping charged at checkout, then refunded because it was combined with an earlier order. */
  shipping_refunded?: number | null;
  /** Discount code used at checkout (cards only), and how much it took off. */
  discount_code?: string | null;
  discount?: number | null;
  /** Refunded in Stripe and applied to EndZone's books (not counting automatic shipping refunds). */
  refunded_amount?: number | null;
  refunded_at?: string | null;
  total: number;
  stripe_fee: number | null;
  paid_at: string | null;
  shipped_at: string | null;
  tracking_number: string | null;
  problem_note: string | null;
  hold_expires_at: string;
  created_at: string;
  /** This order shipped free because it came through a combine link: which order or stack it goes with. */
  ship_link: {
    kind: string;
    customer_name: string | null;
    parent: { order_number: string; shipping_address: Json | null } | null;
  } | null;
  /** This order's own "add to my order" link: the window, and orders that came through it. */
  my_link: {
    expires_at: string | null;
    closed_at: string | null;
    combined: { order_number: string; status: string }[];
  } | null;
  web_order_items: {
    id: string;
    price: number;
    description: string;
    show_cards: { photo_front_url: string | null } | null;
  }[];
};

const FILTERS = [
  { value: "to_ship", label: "Needs shipping" },
  { value: "shipped", label: "Shipped" },
  { value: "paid", label: "All paid" },
  { value: "unpaid", label: "Unpaid / expired" },
] as const;
type Filter = (typeof FILTERS)[number]["value"];

/** Same street + ZIP? Used to warn when a combined order goes to a different address. */
function sameAddress(a: Json | null | undefined, b: Json | null | undefined): boolean {
  const key = (x: Json | null | undefined) => {
    const o = (x && typeof x === "object" && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
    return `${o.line1 ?? ""}|${o.postal_code ?? ""}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
  };
  return key(a) === key(b);
}

/** What Colton keeps: total charged minus the Stripe fee. Display only — the database writes the sales. */
function netAmount(order: OrderRow): string | null {
  const total = moneyToCents(order.total);
  const fee = moneyToCents(order.stripe_fee);
  const refunded = moneyToCents(order.refunded_amount ?? 0) ?? 0n;
  if (total === null || fee === null) return null;
  return centsToMoney(total - refunded - fee);
}

const UNPAID_LABELS: Record<string, string> = {
  pending: "Checkout in progress",
  expired: "Expired — not paid",
  canceled: "Canceled",
};

export default function WebOrders() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();
  const [searchParams, setSearchParams] = useSearchParams();
  const orderParam = searchParams.get("order");

  const [filter, setFilter] = useState<Filter>(orderParam ? "paid" : "to_ship");
  const [pages, setPages] = useState(1);
  const [shippingFor, setShippingFor] = useState<string | null>(null);
  const [tracking, setTracking] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["webOrders", viewingUserId, filter, orderParam, pages],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const BASE = `id, order_number, source, status, buyer_email, buyer_name, shipping_address, subtotal, shipping, total,
           stripe_fee, paid_at, shipped_at, tracking_number, problem_note, hold_expires_at, created_at,
           web_order_items (id, price, description, show_cards (photo_front_url))`;
      const LINKS = `, shipping_refunded, discount_code, discount, refunded_amount, refunded_at,
           ship_link:web_ship_links!web_orders_ship_link_id_fkey (kind, customer_name,
             parent:web_orders!web_ship_links_order_id_fkey (order_number, shipping_address)),
           my_link:web_ship_links!web_ship_links_order_id_fkey (expires_at, closed_at,
             combined:web_orders!web_orders_ship_link_id_fkey (order_number, status))`;

      const run = (select: string) => {
        let query = supabase.from("web_orders").select(select).eq("user_id", userId);
        if (orderParam) {
          query = query.eq("order_number", orderParam);
        } else if (filter === "unpaid") {
          query = query.neq("status", "paid");
        } else {
          query = query.eq("status", "paid");
          if (filter === "to_ship") query = query.is("shipped_at", null);
          if (filter === "shipped") query = query.not("shipped_at", "is", null);
        }
        return query
          .order("paid_at", { ascending: false, nullsFirst: false })
          .order("created_at", { ascending: false })
          .range(0, pages * PAGE_SIZE - 1);
      };

      let { data, error } = await run(BASE + LINKS);
      if (error) {
        // Combined-shipping details are extra: never let them hide the orders themselves.
        console.error("Web orders with ship links failed; loading without them", error);
        ({ data, error } = await run(BASE));
      }
      if (error) throw error;
      return (data || []) as unknown as OrderRow[];
    },
  });

  const chooseFilter = (value: Filter) => {
    setFilter(value);
    setPages(1);
    if (orderParam) setSearchParams({});
  };

  const startShipping = (order: OrderRow) => {
    setShippingFor(order.id);
    setTracking(order.tracking_number || "");
  };

  const saveShipping = async (order: OrderRow) => {
    setSavingId(order.id);
    try {
      const { data, error } = await supabase
        .from("web_orders")
        .update({
          // Keep the original ship date when only the tracking number is being edited.
          shipped_at: order.shipped_at || new Date().toISOString(),
          tracking_number: tracking.trim() || null,
        })
        .eq("id", order.id)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Only the business owner can update shipping.");
      toast({
        title: order.shipped_at ? "Tracking updated" : `${order.order_number} marked shipped`,
        description: tracking.trim() ? `Tracking ${tracking.trim()}` : undefined,
      });
      setShippingFor(null);
      setTracking("");
      queryClient.invalidateQueries({ queryKey: ["webOrders"] });
      queryClient.invalidateQueries({ queryKey: ["webShopCounts"] });
    } catch (error) {
      toast({
        title: "Couldn't save shipping",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSavingId(null);
    }
  };

  const hasMore = (orders?.length || 0) >= pages * PAGE_SIZE;
  const { data: settings } = useWebsiteSettings();

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-32 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground md:text-3xl">Web Orders</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paid orders from cssportscards.com. Sales are recorded automatically when payment clears.
        </p>
      </div>

      {settings && <StackLinks ownerId={settings.owner_user_id} readOnly={isViewingAsMentor} />}

      <div className="grid grid-cols-2 gap-2 md:flex" role="tablist" aria-label="Order filter">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            role="tab"
            aria-selected={!orderParam && filter === f.value}
            variant={!orderParam && filter === f.value ? "default" : "outline"}
            onClick={() => chooseFilter(f.value)}
            className="min-h-[44px] whitespace-nowrap"
          >
            {f.label}
          </Button>
        ))}
      </div>
      {orderParam && (
        <p className="text-sm text-muted-foreground">
          Showing order {orderParam}.{" "}
          <button className="min-h-[44px] underline" onClick={() => chooseFilter("to_ship")}>
            Show all
          </button>
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-48 w-full bg-muted/20" />
          ))}
        </div>
      ) : !orders || orders.length === 0 ? (
        <div className="night-game-card p-6 text-center">
          <PackageCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-muted-foreground">
            {filter === "to_ship" && !orderParam ? "Nothing to ship. You're all caught up." : "No orders here."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const paid = order.status === "paid";
            const address = formatShippingAddress(order.shipping_address);
            const net = netAmount(order);
            const editing = shippingFor === order.id;
            const saving = savingId === order.id;
            const link = order.ship_link;
            const shipsWith = link
              ? link.kind === "stack" ? `${link.customer_name}'s stack` : link.parent ? `order ${link.parent.order_number}` : null
              : null;
            const otherAddress = !!link?.parent && !sameAddress(link.parent.shipping_address, order.shipping_address);
            const windowOpen = paid && !order.shipped_at && !!order.my_link?.expires_at && !order.my_link.closed_at
              && new Date(order.my_link.expires_at) > new Date();
            const together = (order.my_link?.combined || []).filter((o) => o.status === "paid").map((o) => o.order_number);

            return (
              <div key={order.id} className="night-game-card space-y-4 p-4 md:p-6" data-testid="web-order">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-bold text-foreground">{order.order_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {paid ? `Paid ${formatMoment(order.paid_at, "MMM d, yyyy h:mm a")}` : formatMoment(order.created_at, "MMM d, yyyy h:mm a")}
                      {order.source === "offer" && " · Accepted offer"}
                    </p>
                  </div>
                  {paid ? (
                    order.shipped_at ? (
                      <Badge variant="outline" className="shrink-0 text-xs">Shipped</Badge>
                    ) : (
                      <Badge className="shrink-0 text-xs">Needs shipping</Badge>
                    )
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-xs">
                      {UNPAID_LABELS[order.status] || order.status}
                    </Badge>
                  )}
                </div>

                {(shipsWith || windowOpen || together.length > 0) && (
                  <div className="space-y-1 rounded-md border-2 border-[hsl(var(--accent))] px-3 py-2 text-sm text-foreground" data-testid="ships-with">
                    {shipsWith && (
                      <p className="flex items-center gap-2 font-semibold">
                        <Layers className="h-4 w-4 shrink-0" />
                        {link?.kind === "stack"
                          ? `Add to ${shipsWith}. No shipping charged.`
                          : order.shipping_refunded
                            ? `Ship with ${shipsWith}. Shipping refunded automatically.`
                            : `Ship with ${shipsWith}. No shipping charged.`}
                      </p>
                    )}
                    {otherAddress && (
                      <p className="font-semibold text-destructive">
                        The address is different from {shipsWith}. Check with the buyer before packing them together.
                      </p>
                    )}
                    {together.length > 0 && <p>Also in this package: {together.join(", ")}</p>}
                    {windowOpen && (
                      <p className="text-muted-foreground">
                        The buyer can add more with free shipping until {formatMoment(order.my_link!.expires_at, "EEE MMM d, h:mm a")}
                        {" "}or until you mark this shipped.
                      </p>
                    )}
                  </div>
                )}

                {order.problem_note && (
                  <div
                    role="alert"
                    className="flex gap-2 rounded-md border-2 border-destructive bg-destructive/15 px-3 py-2 text-sm font-semibold text-destructive"
                  >
                    <AlertTriangle className="h-5 w-5 shrink-0" />
                    <span>{order.problem_note}</span>
                  </div>
                )}

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Buyer</p>
                    <p className="text-sm text-foreground">{order.buyer_name || "—"}</p>
                    {order.buyer_email && (
                      <a href={`mailto:${order.buyer_email}`} className="break-all text-sm text-accent">
                        {order.buyer_email}
                      </a>
                    )}
                  </div>
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Ship to</p>
                    {address.length > 0 ? (
                      <address className="text-sm not-italic leading-snug text-foreground">
                        {address.map((line, i) => (
                          <span key={i} className="block">
                            {line}
                          </span>
                        ))}
                      </address>
                    ) : (
                      <p className="text-sm text-muted-foreground">No address yet</p>
                    )}
                  </div>
                </div>

                <div className="divide-y divide-border/50">
                  {order.web_order_items.map((item) => (
                    <div key={item.id} className="flex items-center gap-3 py-2">
                      {item.show_cards?.photo_front_url && (
                        <img
                          src={item.show_cards.photo_front_url}
                          alt=""
                          className="h-14 w-10 shrink-0 rounded object-cover"
                        />
                      )}
                      <span className="flex-1 text-sm text-foreground">{item.description}</span>
                      <span className="text-sm font-semibold text-foreground">{formatMoney(item.price)}</span>
                    </div>
                  ))}
                </div>

                <dl className="space-y-1 border-t border-border/50 pt-3 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Subtotal</dt>
                    <dd className="text-foreground">{formatMoney(order.subtotal)}</dd>
                  </div>
                  {!!order.discount && Number(order.discount) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Code {order.discount_code}</dt>
                      <dd className="text-foreground">−{formatMoney(order.discount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Shipping{order.shipping_refunded ? ` (${formatMoney(order.shipping_refunded)} refunded)` : ""}
                    </dt>
                    <dd className="text-foreground">{formatMoney(order.shipping)}</dd>
                  </div>
                  <div className="flex justify-between font-semibold">
                    <dt className="text-foreground">Total paid</dt>
                    <dd className="text-foreground">{formatMoney(order.total)}</dd>
                  </div>
                  {!!order.refunded_amount && Number(order.refunded_amount) > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        Refunded in Stripe{order.refunded_at ? ` ${new Date(order.refunded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
                      </dt>
                      <dd className="text-foreground">−{formatMoney(order.refunded_amount)}</dd>
                    </div>
                  )}
                  {paid && (
                    <>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">Stripe fee</dt>
                        <dd className="text-foreground">
                          {order.stripe_fee === null ? "Pending" : `−${formatMoney(order.stripe_fee)}`}
                        </dd>
                      </div>
                      <div className="flex justify-between font-bold">
                        <dt className="text-foreground">You keep</dt>
                        <dd className="text-[hsl(var(--metric-positive))]">{net === null ? "—" : formatMoney(net)}</dd>
                      </div>
                    </>
                  )}
                </dl>

                {paid && (
                  <div className="space-y-3 border-t border-border/50 pt-3">
                    {order.shipped_at && !editing && (
                      <p className="flex items-center gap-2 text-sm text-foreground">
                        <Truck className="h-4 w-4 text-muted-foreground" />
                        Shipped {formatMoment(order.shipped_at, "MMM d, yyyy")}
                        {order.tracking_number ? ` · ${order.tracking_number}` : " · no tracking"}
                      </p>
                    )}
                    {!isViewingAsMentor && editing && (
                      <div className="space-y-2">
                        {windowOpen && !order.shipped_at && (
                          <p className="text-sm text-muted-foreground">
                            Marking this shipped ends the buyer's free-shipping window for adding more cards.
                          </p>
                        )}
                        <label htmlFor={`tracking-${order.id}`} className="form-label">
                          Tracking number (optional)
                        </label>
                        <Input
                          id={`tracking-${order.id}`}
                          value={tracking}
                          onChange={(e) => setTracking(e.target.value)}
                          maxLength={100}
                          autoCapitalize="characters"
                          autoComplete="off"
                          placeholder="9400 1000 0000 0000 0000 00"
                          className="min-h-[44px]"
                          autoFocus
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            variant="outline"
                            className="min-h-[44px]"
                            disabled={saving}
                            onClick={() => setShippingFor(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            className="min-h-[44px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                            disabled={saving}
                            onClick={() => saveShipping(order)}
                          >
                            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {order.shipped_at ? "Save tracking" : "Mark shipped"}
                          </Button>
                        </div>
                      </div>
                    )}
                    {!isViewingAsMentor && !editing && (
                      <Button
                        variant={order.shipped_at ? "outline" : "default"}
                        className={cn(
                          "min-h-[44px] w-full font-semibold",
                          !order.shipped_at && "bg-primary uppercase text-primary-foreground hover:bg-primary/90",
                        )}
                        onClick={() => startShipping(order)}
                      >
                        {order.shipped_at ? (order.tracking_number ? "Edit tracking" : "Add tracking") : (
                          <>
                            <Truck className="mr-2 h-4 w-4" />
                            Mark shipped
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {hasMore && (
            <div className="text-center">
              <Button variant="outline" className="min-h-[44px]" onClick={() => setPages((p) => p + 1)}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
