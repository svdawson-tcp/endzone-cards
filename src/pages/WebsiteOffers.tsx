import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Check, ImageIcon, Loader2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { PageContainer } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { cn } from "@/lib/utils";
import { callShop, cardTitle, money, shopErrorMessage, ShopError, type CardInfo } from "@/lib/shopApi";

// Only the columns the app role is granted. Never "*": pay_token is not granted and "*" errors.
const OFFER_COLUMNS =
  "id, show_card_id, buyer_email, buyer_name, amount, asking_price, status, auto_accepted, counter_amount, agreed_amount, created_at, respond_by, responded_at, pay_by, order_id, show_cards(player_name, year, card_details, photo_front_url, asking_price, offer_floor)";

type Offer = {
  id: string;
  show_card_id: string;
  buyer_email: string;
  buyer_name: string | null;
  amount: number;
  asking_price: number;
  status: string;
  auto_accepted: boolean;
  counter_amount: number | null;
  agreed_amount: number | null;
  created_at: string;
  respond_by: string;
  responded_at: string | null;
  pay_by: string | null;
  order_id: string | null;
  show_cards: CardInfo | null;
};

type Tab = "new" | "answered" | "auto";
type Done = { kind: "ok" | "error"; text: string };

const past = (iso: string | null) => !!iso && new Date(iso).getTime() <= Date.now();
/** "46h" or "35m" until a time. */
const timeLeft = (iso: string) => {
  const ms = new Date(iso).getTime() - Date.now();
  const h = Math.floor(ms / 3_600_000);
  return h >= 1 ? `${h}h` : `${Math.max(1, Math.floor(ms / 60_000))}m`;
};
const isNew = (o: Offer) => o.status === "pending" && !past(o.respond_by);

/** What to show on an answered offer: the stored status, with time-outs spelled out. */
function effectiveStatus(o: Offer): { label: string; tone: "green" | "blue" | "slate" | "amber" } {
  if (o.status === "pending") return { label: "expired · not answered", tone: "amber" };
  if (o.status === "paid") return { label: "paid", tone: "green" };
  if ((o.status === "accepted" || o.status === "countered") && past(o.pay_by)) {
    return { label: `${o.status} · not paid in time`, tone: "amber" };
  }
  if (o.status === "accepted") return { label: "accepted · waiting on payment", tone: "green" };
  if (o.status === "countered") return { label: "countered · waiting on buyer", tone: "blue" };
  if (o.status === "declined") return { label: "declined", tone: "slate" };
  return { label: o.status, tone: "amber" };
}

const toneClass = {
  green: "bg-green-100 text-green-800",
  blue: "bg-blue-100 text-blue-800",
  slate: "bg-slate-200 text-slate-800",
  amber: "bg-amber-100 text-amber-900",
};

export default function WebsiteOffers() {
  const queryClient = useQueryClient();
  const { getEffectiveUserId } = useMentorAccess();
  const [tab, setTab] = useState<Tab>("new");
  // Offers answered on this screen keep their card in "New" with the result, until the page is left.
  const [done, setDone] = useState<Record<string, Done>>({});

  const { data: offers = [], isLoading, isError } = useQuery({
    queryKey: ["website-offers"],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("shop_offers")
        .select(OFFER_COLUMNS)
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as Offer[];
    },
  });

  const lists = useMemo(() => {
    const fresh = offers.filter(isNew);
    return {
      new: offers.filter((o) => isNew(o) || !!done[o.id]),
      newCount: fresh.length,
      answered: offers.filter((o) => !isNew(o) && !o.auto_accepted),
      auto: offers.filter((o) => o.auto_accepted),
    };
  }, [offers, done]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["website-offers"] });
    void queryClient.invalidateQueries({ queryKey: ["website-badges"] });
  };

  const shown = tab === "new" ? lists.new : tab === "answered" ? lists.answered : lists.auto;

  return (
    <PageContainer maxWidth="2xl">
      <h1 className="page-title mb-1">WEBSITE OFFERS</h1>
      <p className="mb-4 text-muted-foreground">Offers from cssportscards.com. Answer within 48 hours.</p>

      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {([
          ["new", `New (${lists.newCount})`],
          ["answered", "Answered"],
          ["auto", `Auto-accepted (${lists.auto.length})`],
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
          Couldn't load offers. Pull down to refresh or try again in a minute.
        </p>
      ) : shown.length === 0 ? (
        <div className="rounded-lg bg-card p-6 text-center text-muted-foreground">
          {tab === "new" ? "No new offers. You're all caught up." : tab === "answered" ? "No answered offers yet." : "No offers have been auto-accepted yet."}
        </div>
      ) : (
        <div className="space-y-4">
          {shown.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              done={done[o.id]}
              actionable={tab === "new" && isNew(o) && done[o.id]?.kind !== "ok"}
              onDone={(d) => {
                setDone((m) => ({ ...m, [o.id]: d }));
                refresh();
              }}
            />
          ))}
        </div>
      )}

      <p className="mt-4 text-sm text-muted-foreground">
        Offers you don't answer in 48 hours expire and the buyer is told politely. Accepting or countering holds the
        card off the website for 24 hours while the buyer pays.
      </p>
    </PageContainer>
  );
}

function OfferCard({
  offer: o,
  done,
  actionable,
  onDone,
}: {
  offer: Offer;
  done?: Done;
  actionable: boolean;
  onDone: (d: Done) => void;
}) {
  const card = o.show_cards;
  const asking = Number(card?.asking_price ?? o.asking_price);
  const amount = Number(o.amount);
  const under = asking - amount;
  const floor = card?.offer_floor != null ? Number(card.offer_floor) : null;
  const [sending, setSending] = useState<null | "accept" | "counter" | "decline">(null);
  const [counterOpen, setCounterOpen] = useState(false);
  const [counter, setCounter] = useState(() => {
    const mid = Math.round((amount + asking) / 2);
    return mid > amount && mid < asking ? String(mid) : "";
  });
  const [counterError, setCounterError] = useState("");

  const counterValue = Number(counter);
  const counterProblem = (() => {
    if (counter.trim() === "" || !Number.isFinite(counterValue)) return "Enter a price.";
    if (!/^\d+(\.\d{1,2})?$/.test(counter.trim())) return "Use dollars and cents, like 75 or 75.50.";
    if (counterValue <= amount) return `Must be more than the offer (${money(amount)}).`;
    if (counterValue >= asking) return `Must be less than the asking price (${money(asking)}).`;
    return "";
  })();

  const respond = async (decision: "accept" | "counter" | "decline") => {
    if (decision === "counter") {
      if (counterProblem) return setCounterError(counterProblem);
      setCounterError("");
    }
    setSending(decision);
    try {
      await callShop({
        action: "offer_respond",
        offer_id: o.id,
        decision,
        ...(decision === "counter" ? { counter_amount: Math.round(counterValue * 100) / 100 } : {}),
      });
      const text =
        decision === "accept"
          ? `Accepted at ${money(amount)}. The buyer has a pay link, good for 24 hours.`
          : decision === "counter"
            ? `Countered at ${money(counterValue)}. Waiting on the buyer.`
            : "Declined. The buyer was told politely.";
      onDone({ kind: "ok", text });
    } catch (e) {
      const msg = shopErrorMessage(e);
      if (e instanceof ShopError && e.code === "bad_counter") setCounterError(msg);
      onDone({ kind: "error", text: msg });
    } finally {
      setSending(null);
    }
  };

  const busy = sending !== null;
  const status = !actionable && !done ? effectiveStatus(o) : null;

  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-card-shadow" data-testid="offer-card">
      <div className="flex gap-3">
        <div className="h-[72px] w-[54px] shrink-0 overflow-hidden rounded bg-muted">
          {card?.photo_front_url ? (
            <img src={card.photo_front_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-bold leading-snug text-card-foreground">{cardTitle(card)}</h2>
          <p className="text-sm text-muted-foreground">
            Asking {money(asking)} · {floor != null ? `your floor ${money(floor)}` : "no floor set"}
          </p>
          <p className="truncate text-sm text-muted-foreground">
            from {o.buyer_name ? `${o.buyer_name} · ` : ""}
            {o.buyer_email}
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDistanceToNowStrict(new Date(o.created_at))} ago
            {isNew(o) && ` · expires in ${timeLeft(o.respond_by)}`}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm text-muted-foreground">Offer</span>
        <span className="text-3xl font-extrabold text-card-foreground">{money(amount)}</span>
        {under > 0 && <span className="text-sm font-semibold text-amber-300">{money(under)} under asking</span>}
      </div>

      {status && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", toneClass[status.tone])}>{status.label}</span>
          {o.agreed_amount != null && o.status !== "declined" && (
            <span className="text-muted-foreground">at {money(o.agreed_amount)}</span>
          )}
          {o.responded_at && (
            <span className="text-muted-foreground">· {formatDistanceToNowStrict(new Date(o.responded_at))} ago</span>
          )}
          {o.status === "paid" && o.order_id && (
            <Link to={`/website-orders?order=${o.order_id}`} className="font-semibold text-primary underline">
              See the order
            </Link>
          )}
        </div>
      )}

      {actionable && (
        <>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant="success"
              disabled={busy}
              onClick={() => void respond("accept")}
              aria-label="Accept offer"
              className="min-h-[44px] min-w-0 font-semibold"
            >
              {sending === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Accept"}
            </Button>
            <Button
              type="button"
              disabled={busy}
              onClick={() => setCounterOpen((v) => !v)}
              aria-expanded={counterOpen}
              className="min-h-[44px] min-w-0 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
            >
              Counter
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void respond("decline")}
              aria-label="Decline offer"
              className="min-h-[44px] min-w-0 font-semibold"
            >
              {sending === "decline" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decline"}
            </Button>
          </div>

          {counterOpen && (
            <div className="mt-3 rounded-lg border border-primary/40 bg-primary/10 p-3">
              <label htmlFor={`counter-${o.id}`} className="text-sm font-semibold text-card-foreground">
                Counter at
              </label>
              <div className="mt-1 flex gap-2">
                <div className="flex-1">
                  <CurrencyInput
                    id={`counter-${o.id}`}
                    value={counter}
                    onChange={(e) => {
                      setCounter(e.target.value);
                      setCounterError("");
                    }}
                    placeholder={String(Math.round((amount + asking) / 2))}
                    aria-invalid={!!counterError}
                  />
                </div>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => void respond("counter")}
                  aria-label="Send counter"
                  className="min-h-[44px] min-w-[80px] bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                >
                  {sending === "counter" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
                </Button>
              </div>
              {counterError ? (
                <p className="mt-2 text-sm font-semibold text-red-300" role="alert">{counterError}</p>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">
                  Between {money(amount)} and {money(asking)}. The buyer gets a pay link
                  {counterProblem ? "" : ` at ${money(counterValue)}`}, good for 24 hours. The card is held from the
                  site until then.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {done && (
        <div
          role="status"
          className={cn(
            "mt-3 flex items-start gap-2 rounded-lg border p-3 text-sm",
            done.kind === "ok" ? "border-green-300 bg-green-50 text-green-900" : "border-red-400 bg-red-50 text-red-900"
          )}
        >
          {done.kind === "ok" ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{done.text}</span>
        </div>
      )}
    </article>
  );
}
