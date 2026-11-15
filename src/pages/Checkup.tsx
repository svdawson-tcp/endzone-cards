import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageContainer } from "@/components/layout/AppLayout";
import { ReconcileDialog } from "@/components/accounts/ReconcileDialog";
import { TripDialog } from "@/components/todo/TripDialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useTaxTracker } from "@/hooks/useTaxTracker";
import { useInvalidateTodo } from "@/hooks/useTodo";
import { formatBusinessDate } from "@/lib/dateUtils";
import { formatMoney } from "@/lib/numericUtils";
import type { TripPrefill } from "@/lib/todo";
import { AlertTriangle, ArrowLeft, Car, CheckCircle2, ClipboardCheck, Scale } from "lucide-react";

type Named = { id: string; name: string; show_date: string };
type Metrics = { gross_sales?: number; revenue?: number; sale_count?: number; expenses?: number; inventory_purchased?: number };
type Checkup = {
  period: string; month_name: string; start: string; end: string; done: boolean; first: boolean;
  shows_no_fee: Named[]; shows_open: Named[]; missing_categories: string[];
  no_receipt: { id: string; category: string; amount: number; expense_date: string }[];
  trip_prompts: (TripPrefill & { key: string; title: string; body: string })[];
  trips_this_month: { count: number; miles: number };
  accounts: { id: string; name: string; kind: string; checked_today: boolean }[];
  this_month: Metrics; last_month: Metrics;
};

type Answer = "added" | "none" | "skipped";
type CheckupProgress = { step: number; startedAt: string; answers: Record<string, Answer> };

type Action = { label: string; to?: string; trip?: TripPrefill | true };
type Step =
  | { key: string; type: "question"; title: string; body: string; actions: Action[]; list?: string[] }
  | { key: "trips"; type: "trips"; title: string; body: string }
  | { key: "money"; type: "money"; title: string; body: string }
  | { key: "summary"; type: "summary"; title: string; body: string };

const storageKey = (p: string) => `checkup:${p}`;
const readProgress = (p: string): CheckupProgress | null => {
  try {
    const raw = sessionStorage.getItem(storageKey(p));
    return raw ? (JSON.parse(raw) as CheckupProgress) : null;
  } catch {
    return null;
  }
};
const writeProgress = (p: string, v: CheckupProgress) => {
  try {
    sessionStorage.setItem(storageKey(p), JSON.stringify(v));
  } catch {
    // progress just won't survive a reload
  }
};
const clearProgress = (p: string) => {
  try {
    sessionStorage.removeItem(storageKey(p));
  } catch {
    // ignore
  }
};

/**
 * The monthly checkup (0031): one question per screen. "Yes" opens the usual entry screen, which comes back here
 * when saved (?returnTo); "Nothing to add" moves on. Answers are stored once, owner-only, when it's finished.
 */
export default function Checkup() {
  const { period = "" } = useParams();
  const navigate = useNavigate();
  const invalidate = useInvalidateTodo();
  const { isViewingAsMentor } = useMentorAccess();
  const { data: tax } = useTaxTracker();
  const here = `/checkup/${period}`;

  const [progress, setProgress] = useState<CheckupProgress>(
    () => readProgress(period) ?? { step: 0, startedAt: new Date().toISOString(), answers: {} },
  );
  useEffect(() => writeProgress(period, progress), [period, progress]);
  const [tripPrefill, setTripPrefill] = useState<TripPrefill | null>(null);
  const [reconcile, setReconcile] = useState<Checkup["accounts"][number] | null>(null);
  const [note, setNote] = useState("");
  const [finished, setFinished] = useState<{ items_added: number } | null>(null);

  const { data: c, isLoading, error, refetch } = useQuery({
    queryKey: ["checkup", period],
    enabled: !isViewingAsMentor && /^\d{4}-\d{2}$/.test(period),
    queryFn: async () => {
      const { data, error: e } = await supabase.rpc("get_checkup", { p_period: period });
      if (e) throw e;
      return data as unknown as Checkup;
    },
  });

  const steps: Step[] = useMemo(() => {
    if (!c) return [];
    const add = (category: string, extra = "") =>
      `/expenses/new?category=${encodeURIComponent(category)}${extra}&returnTo=${encodeURIComponent(here)}`;
    const back = `returnTo=${encodeURIComponent(here)}`;
    const s: Step[] = [];
    if (c.shows_no_fee.length)
      s.push({
        key: "show_fees", type: "question", title: "Booth fees",
        body: "These shows have no table or booth fee recorded. Add it if you paid one.",
        list: c.shows_no_fee.map((x) => `${x.name} · ${formatBusinessDate(x.show_date, "MMM d")}`),
        actions: c.shows_no_fee.map((x) => ({
          label: `Add fee: ${x.name}`,
          to: add("Table / Booth Fees", `&showId=${x.id}&date=${x.show_date}`),
        })),
      });
    if (c.shows_open.length)
      s.push({
        key: "shows_open", type: "question", title: "Shows still open",
        body: "These shows are over but still open. Close each one so its results are final.",
        list: c.shows_open.map((x) => `${x.name} · ${formatBusinessDate(x.show_date, "MMM d")}`),
        actions: c.shows_open.map((x) => ({ label: `Open ${x.name}`, to: `/shows/${x.id}` })),
      });
    if (c.missing_categories.length)
      s.push({
        key: "missing_categories", type: "question", title: "Anything you usually log?",
        body: `You logged these in the last two months but nothing in ${c.month_name}.`,
        actions: c.missing_categories.map((cat) => ({ label: cat, to: add(cat) })),
      });
    if (c.no_receipt.length)
      s.push({
        key: "receipts", type: "question", title: "Receipts for bigger expenses",
        body: "Keep a receipt photo for anything $75 or more. Open Expenses to add one.",
        list: c.no_receipt.map((x) => `${x.category} · ${formatMoney(x.amount)} · ${formatBusinessDate(x.expense_date, "MMM d")}`),
        actions: [{ label: "Open Expenses", to: "/expenses" }],
      });
    if (c.trip_prompts.length)
      s.push({ key: "trips", type: "trips", title: "Drives to log", body: "These might have involved a drive." });
    s.push(
      {
        key: "fees", type: "question", title: "Fees not on a sale",
        body: "eBay store or promoted listings, Whatnot, PayPal, Stripe. Check each monthly statement and add one expense per platform.",
        actions: [{ label: "Add platform fees", to: add("Platform Fees") }, { label: "Add bank or payment fees", to: add("Bank & Payment Fees") }],
      },
      {
        key: "postage", type: "question", title: "Postage and shipping",
        body: "Labels, stamps, mailers, bubble envelopes bought this month.",
        actions: [{ label: "Add postage", to: add("Shipping & Postage") }],
      },
      {
        key: "supplies", type: "question", title: "Supplies",
        body: "Sleeves, top loaders, team bags, boxes, display cases.",
        actions: [{ label: "Add supplies", to: add("Supplies") }],
      },
      {
        key: "recurring", type: "question", title: "Subscriptions, phone, insurance, grading",
        body: "Monthly apps and services, the business share of your phone, insurance, grading fees.",
        actions: [
          { label: "Subscriptions", to: add("Software & Subscriptions") },
          { label: "Grading", to: add("Grading") },
          { label: "Phone, insurance, other", to: add("Other") },
        ],
      },
      {
        key: "sales", type: "question", title: "Sales not in EndZone yet",
        body: "Cash at the table, Venmo, Facebook or Instagram drops, trades for cash.",
        actions: [{ label: "Record a sale", to: `/transactions/new?${back}` }],
      },
      {
        key: "disposals", type: "question", title: "Cards that left with no sale",
        body: "Trades, cards you kept for yourself, giveaways, bulk you threw out.",
        actions: [{ label: "Record it", to: `/transactions/disposition/new?${back}` }],
      },
      {
        key: "personal", type: "question", title: "Personal money",
        body: "A business cost you paid with your own card or cash, or money you took out of the business for yourself.",
        actions: [
          { label: "I paid a business cost", to: add("Other", "&paid=1") },
          { label: "I took money out", to: `/cash/new?type=owner_draw&${back}` },
        ],
      },
      {
        key: "drives", type: "question", title: "Drives not logged",
        body: `${c.trips_this_month.count} drive${Number(c.trips_this_month.count) === 1 ? "" : "s"} logged in ${c.month_name} so far (${Number(c.trips_this_month.miles)} miles). Any others? Post office runs count.`,
        actions: [{ label: "Log a drive", trip: true }],
      },
    );
    if (c.first)
      s.push({
        key: "catchup", type: "question", title: "Catch up your mileage",
        body: "First checkup: add the business drives since you went full time on Oct 12 (shows, seller meetups, buying trips). Your calendar and texts help.",
        actions: [{ label: "Log a drive", trip: true }],
      });
    s.push(
      {
        key: "money", type: "money", title: "Bank check",
        body: "Enter today's sales first. Then, for each account, use the posted balance in your banking app (not \"available\"). For Operating, count the cash box too.",
      },
      { key: "summary", type: "summary", title: `${c.month_name} at a glance`, body: "" },
    );
    return s;
  }, [c, here]);

  const finish = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase.rpc("complete_checkup", {
        p_period: period,
        p_started_at: progress.startedAt,
        p_answers: progress.answers,
        p_note: note.trim() || undefined,
      });
      if (e) throw e;
      return data as unknown as { items_added: number };
    },
    onSuccess: (d) => {
      clearProgress(period);
      setFinished(d);
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Could not finish the checkup", description: e.message, variant: "destructive" }),
  });

  if (isViewingAsMentor) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="night-game-card p-6 text-muted-foreground">The checkup is Colton's. You'll see on the weekly call card when it's done.</div>
      </PageContainer>
    );
  }
  if (error) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="night-game-card p-4 text-sm metric-negative">Could not load the checkup: {(error as Error).message}</div>
      </PageContainer>
    );
  }
  if (isLoading || !c) {
    return (
      <PageContainer maxWidth="2xl">
        <Skeleton className="h-40 w-full bg-muted/20" />
      </PageContainer>
    );
  }

  if (finished || c.done) {
    return (
      <PageContainer maxWidth="2xl">
        <div className="night-game-card p-6 text-center">
          <CheckCircle2 className="h-10 w-10 metric-positive mx-auto mb-3" />
          <div className="text-2xl font-bold text-foreground mb-1">{c.month_name} checkup done</div>
          {finished && (
            <p className="text-muted-foreground">
              {finished.items_added === 0 ? "Nothing needed adding. Nice." : `You added ${finished.items_added} item${finished.items_added === 1 ? "" : "s"}.`}
            </p>
          )}
          <Button className="mt-5 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={() => navigate("/todo")}>
            Back to To Do
          </Button>
        </div>
      </PageContainer>
    );
  }

  const idx = Math.min(progress.step, steps.length - 1);
  const step = steps[idx];
  const answer = (key: string, a: Answer) =>
    setProgress((p) => ({ ...p, answers: { ...p.answers, [key]: p.answers[key] === "added" && a !== "added" ? "added" : a } }));
  const go = (to: number) => {
    setProgress((p) => ({ ...p, step: Math.max(0, Math.min(steps.length - 1, to)) }));
    window.scrollTo({ top: 0 });
  };
  const next = (a: Answer) => {
    answer(step.key, a);
    go(idx + 1);
  };
  const doAction = (act: Action) => {
    answer(step.key, "added");
    if (act.trip) setTripPrefill(act.trip === true ? {} : act.trip);
    else if (act.to) navigate(act.to);
  };
  const added = progress.answers[step.key] === "added";

  const tm = c.this_month || {};
  const lm = c.last_month || {};
  const behind = Number(tax?.position || 0) < -0.004;

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-4">
        <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground min-h-[44px]" onClick={() => (idx === 0 ? navigate("/todo") : go(idx - 1))}>
          <ArrowLeft className="h-4 w-4" /> {idx === 0 ? "To Do" : "Back"}
        </button>
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-accent" />
          <h1 className="page-title">{c.month_name.toUpperCase()} CHECKUP</h1>
        </div>
        <Progress value={((idx + 1) / steps.length) * 100} className="h-2 mt-3" />
        <p className="text-xs text-muted-foreground mt-1">Step {idx + 1} of {steps.length}</p>
      </div>

      <div className="night-game-card p-5 md:p-6">
        <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">{step.title}</h2>
        {step.body && <p className="text-muted-foreground mb-4">{step.body}</p>}

        {step.type === "question" && (
          <>
            {step.list && (
              <ul className="mb-4 space-y-1 text-sm text-foreground">
                {step.list.map((l) => (
                  <li key={l} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />{l}</li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-2">
              {step.actions.map((a) => (
                <Button key={a.label} variant="outline" className="min-h-[48px] justify-start text-left" onClick={() => doAction(a)}>
                  {a.trip ? <Car className="mr-2 h-4 w-4" /> : null}
                  {a.label}
                </Button>
              ))}
              <Button className="min-h-[48px] mt-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={() => next(added ? "added" : "none")}>
                {added ? "Done, next" : "Nothing to add"}
              </Button>
            </div>
          </>
        )}

        {step.type === "trips" && (
          <div className="flex flex-col gap-3">
            {c.trip_prompts.length === 0 && <p className="text-sm metric-positive">All answered.</p>}
            {c.trip_prompts.map((t) => (
              <div key={t.key} className="rounded-lg border border-border p-3">
                <div className="font-semibold text-foreground">{t.title}</div>
                <div className="text-sm text-muted-foreground">{t.body}</div>
                <div className="flex gap-2 mt-2">
                  <Button className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground" onClick={() => { answer("trips", "added"); setTripPrefill({ ...t, prompt_key: t.key }); }}>
                    Log the drive
                  </Button>
                  <Button variant="ghost" className="min-h-[44px] text-muted-foreground"
                    onClick={async () => {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      const { error: e } = await supabase.from("reminders_state").upsert(
                        { user_id: user.id, reminder_key: t.key, period_key: "once", dismissed_at: new Date().toISOString(), updated_at: new Date().toISOString() },
                        { onConflict: "user_id,reminder_key,period_key" });
                      if (e) toast({ title: "Could not save", description: e.message, variant: "destructive" });
                      refetch();
                      invalidate();
                    }}>
                    No drive
                  </Button>
                </div>
              </div>
            ))}
            <Button className="min-h-[48px] mt-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={() => next(progress.answers.trips === "added" ? "added" : "none")}>
              Next
            </Button>
          </div>
        )}

        {step.type === "money" && (
          <div className="flex flex-col gap-2">
            {c.accounts.map((a) => (
              <Button key={a.id} variant="outline" className="min-h-[52px] justify-between" disabled={a.checked_today} onClick={() => setReconcile(a)}>
                <span className="flex items-center gap-2"><Scale className="h-4 w-4" />{a.name}</span>
                {a.checked_today ? <span className="flex items-center gap-1 metric-positive"><CheckCircle2 className="h-4 w-4" /> Checked</span> : <span className="text-muted-foreground">Check</span>}
              </Button>
            ))}
            {(() => {
              const allDone = c.accounts.every((a) => a.checked_today);
              return (
                <>
                  <Button className="min-h-[48px] mt-2 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" onClick={() => next(allDone ? "added" : "skipped")}>
                    {allDone ? "Next" : "Skip for now"}
                  </Button>
                  {!allDone && <p className="text-xs text-muted-foreground">If you skip, the bank-check reminder comes back on the first Monday of next month.</p>}
                </>
              );
            })()}
          </div>
        )}

        {step.type === "summary" && (
          <div className="space-y-4">
            <div className={`rounded-lg border p-3 ${behind ? "border-amber-400/60" : "border-border"}`}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">Tax set-aside</div>
              <div className={`text-lg font-bold ${behind ? "text-amber-400" : "metric-positive"}`}>
                {behind ? `${formatMoney(-Number(tax?.position || 0))} behind` : "Up to date"}
              </div>
            </div>
            <div className="rounded-lg border border-border p-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-muted-foreground text-xs uppercase tracking-wider mb-1">
                <span></span><span className="text-right">{c.month_name}</span><span className="text-right">Last month</span>
              </div>
              {[
                { label: "Sales", a: tm.gross_sales ?? tm.revenue, b: lm.gross_sales ?? lm.revenue },
                { label: "Lots bought", a: tm.inventory_purchased, b: lm.inventory_purchased },
                { label: "Expenses", a: tm.expenses, b: lm.expenses },
              ].map((r) => (
                <div key={r.label} className="grid grid-cols-3 gap-2 py-1 text-foreground">
                  <span>{r.label}</span>
                  <span className="text-right font-semibold">{formatMoney(r.a)}</span>
                  <span className="text-right text-muted-foreground">{formatMoney(r.b)}</span>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-1">{c.month_name} so far.</p>
            </div>
            <div>
              <label htmlFor="checkup-note" className="form-label">Anything to remember? (optional)</label>
              <Textarea id="checkup-note" className="mt-2" rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <Button className="w-full min-h-[52px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold" disabled={finish.isPending} onClick={() => finish.mutate()}>
              FINISH THE CHECKUP
            </Button>
          </div>
        )}
      </div>

      <TripDialog open={tripPrefill !== null} onOpenChange={(o) => !o && setTripPrefill(null)} prefill={tripPrefill} onSaved={() => refetch()} />
      {reconcile && (
        <ReconcileDialog
          open={reconcile !== null}
          onOpenChange={(o) => {
            if (!o) {
              setReconcile(null);
              refetch();
            }
          }}
          accountId={reconcile.id}
          accountName={reconcile.name}
          accountKind={reconcile.kind}
        />
      )}
    </PageContainer>
  );
}
