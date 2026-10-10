import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { DateInput } from "@/components/forms/DateInput";
import { PageContainer } from "@/components/layout/AppLayout";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { MONEY_QUERY_KEYS } from "@/hooks/useTaxTracker";
import { todayLocal, formatBusinessDate } from "@/lib/dateUtils";
import { formatMoney, normalizeMoneyInput } from "@/lib/numericUtils";
import { ArrowLeft, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";

type AccountKind = "operating" | "travel" | "tax" | "reserve";
type OpeningRow = { kind: AccountKind; type: "contribution" | "transfer"; label: string; source: string; amount: string; date: string };
type AccountMetric = { id: string; name: string; kind: string; balance: number };
type SetupResult = {
  setup_date: string;
  reconciliations: { account: string; difference: number; adjustment_id: string | null; app_balance: number }[];
};

const ACCOUNT_LABEL: Record<string, string> = {
  operating: "Operating",
  travel: "Travel & Shows",
  tax: "Tax",
  reserve: "Reserve",
  old: "Old M&T savings",
};

// The funding plan agreed in Sept/Oct 2026; every figure is editable on screen.
const PLANNED: Omit<OpeningRow, "date">[] = [
  { kind: "operating", type: "contribution", label: "Scott's gift into Operating", source: "From Scott", amount: "7500.00" },
  { kind: "travel", type: "contribution", label: "Scott's gift into Travel & Shows", source: "From Scott", amount: "2500.00" },
  { kind: "tax", type: "transfer", label: "Catch-up into Tax", source: "From old business cash", amount: "2500.00" },
  { kind: "reserve", type: "transfer", label: "Into Reserve", source: "From old business cash", amount: "" },
];

const STEPS = ["Old account", "Opening money", "Cash outside the bank", "Bank balances", "Weekly transfer", "Confirm"];

export default function MoneySetup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();

  const [step, setStep] = useState(0);
  const [oldStatus, setOldStatus] = useState<"closed" | "open" | "">("");
  const [oldBalance, setOldBalance] = useState("");
  const [opening, setOpening] = useState<OpeningRow[]>([]);
  const [cashOutside, setCashOutside] = useState("");
  const [bank, setBank] = useState<Record<string, string>>({});
  const [roundUp, setRoundUp] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const [result, setResult] = useState<SetupResult | null>(null);

  // Current balances, so money already recorded (e.g. a transfer entered before setup) isn't counted twice
  const { data: accounts = [] } = useQuery({
    queryKey: ["accountBalances", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_dashboard_metrics", { p_user_id: userId, p_start: null, p_end: null });
      if (error) throw error;
      return ((data as unknown as { accounts?: AccountMetric[] })?.accounts || []) as AccountMetric[];
    },
  });

  const { data: settings, isLoading: loadingSettings } = useQuery({
    queryKey: ["moneySettings", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.from("money_settings").select("*").eq("user_id", userId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const balanceOf = (kind: string) => Number(accounts.find((a) => a.kind === kind)?.balance || 0);

  // Pre-fill the opening rows once balances are known: subtract anything already recorded in Travel/Tax/Reserve
  useEffect(() => {
    if (opening.length > 0 || accounts.length === 0) return;
    setOpening(
      PLANNED.map((row) => {
        const already = row.kind === "operating" ? 0 : balanceOf(row.kind);
        const planned = row.amount ? Number(row.amount) : 0;
        const remaining = planned > 0 ? Math.max(0, planned - already) : 0;
        return { ...row, amount: planned > 0 ? remaining.toFixed(2) : "", date: todayLocal() };
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts]);

  const bankKinds = useMemo(
    () => (oldStatus === "open" ? ["operating", "travel", "tax", "reserve", "old"] : ["operating", "travel", "tax", "reserve"]),
    [oldStatus],
  );

  const invalidAmount = (v: string) => v.trim() !== "" && normalizeMoneyInput(v) === null;

  const stepValid = (): boolean => {
    switch (step) {
      case 0:
        return oldStatus === "closed" || (oldStatus === "open" && normalizeMoneyInput(oldBalance) !== null);
      case 1:
        return opening.every((r) => !invalidAmount(r.amount) && (!r.amount || (r.date && r.date <= todayLocal())));
      case 2:
        return !invalidAmount(cashOutside);
      case 3:
        return bankKinds.every((k) => normalizeMoneyInput(bank[k] || "") !== null);
      case 4:
        return roundUp !== null;
      default:
        return true;
    }
  };

  const setupMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        setup_date: todayLocal(),
        old_account: { status: oldStatus, balance: oldStatus === "open" ? normalizeMoneyInput(oldBalance) : "0.00" },
        opening: opening
          .filter((r) => normalizeMoneyInput(r.amount) && Number(normalizeMoneyInput(r.amount)) > 0)
          .map((r) => ({
            type: r.type,
            account: r.kind,
            amount: normalizeMoneyInput(r.amount),
            date: r.date,
            note: r.type === "contribution" ? "Opening funding (gift from Scott)" : `Opening transfer to ${ACCOUNT_LABEL[r.kind]}`,
          })),
        cash_outside_bank: normalizeMoneyInput(cashOutside) || "0.00",
        bank_balances: Object.fromEntries(bankKinds.map((k) => [k, normalizeMoneyInput(bank[k] || "")])),
        round_up_transfers: roundUp,
        note: note.trim() || null,
      };
      const { data, error } = await supabase.rpc("complete_money_setup", { p: payload as unknown as Json });
      if (error) throw error;
      return data as unknown as SetupResult;
    },
    onSuccess: (data) => {
      setResult(data);
      MONEY_QUERY_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: [...key] }));
      queryClient.invalidateQueries({ queryKey: ["moneySettings"] });
    },
    onError: (error: Error) => toast({ title: "Setup was not saved", description: error.message, variant: "destructive" }),
  });

  if (isViewingAsMentor) {
    return (
      <PageContainer maxWidth="2xl">
        <h1 className="page-title mb-2">ACCOUNT SETUP</h1>
        <div className="night-game-card p-6 text-muted-foreground">
          {settings?.setup_completed_at
            ? `Completed ${formatBusinessDate(settings.setup_completed_at.slice(0, 10), "MMM d, yyyy")}.`
            : "Not done yet. The account owner completes this the first time they open Tax or Accounts."}
        </div>
      </PageContainer>
    );
  }

  if (!loadingSettings && settings?.setup_completed_at && !result) {
    return (
      <PageContainer maxWidth="2xl">
        <h1 className="page-title mb-2">ACCOUNT SETUP</h1>
        <div className="night-game-card p-6 space-y-4">
          <p className="text-foreground">
            Your accounts were set up on {formatBusinessDate(settings.setup_completed_at.slice(0, 10), "MMMM d, yyyy")}.
          </p>
          <Button onClick={() => navigate("/accounts")} className="min-h-[44px]">Go to Accounts</Button>
        </div>
      </PageContainer>
    );
  }

  if (result) {
    return (
      <PageContainer maxWidth="2xl">
        <h1 className="page-title mb-2">YOU'RE SET UP</h1>
        <div className="night-game-card p-6 space-y-3 mb-6">
          {result.reconciliations.map((r) => {
            const diff = Number(r.difference || 0);
            return (
              <div key={r.account} className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {diff === 0 ? <CheckCircle2 className="h-5 w-5 metric-positive" /> : <AlertTriangle className="h-5 w-5 text-amber-400" />}
                  <span className="text-foreground">{ACCOUNT_LABEL[r.account] || r.account}</span>
                </div>
                <span className="text-sm text-muted-foreground text-right">
                  {diff === 0 ? "Matched the bank" : `Adjusted by ${formatMoney(-diff, { sign: true })} to match the bank`}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={() => navigate("/tax")} className="flex-1 min-h-[44px] bg-primary text-primary-foreground">Open Tax</Button>
          <Button variant="outline" onClick={() => navigate("/accounts")} className="flex-1 min-h-[44px]">See accounts</Button>
        </div>
      </PageContainer>
    );
  }

  const choice = (selected: boolean, onClick: () => void, title: string, body: string) => (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-lg border p-4 min-h-[44px] transition-colors ${
        selected ? "border-accent bg-accent/10" : "border-border hover:border-accent/60"
      }`}
    >
      <div className="font-semibold text-foreground">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{body}</div>
    </button>
  );

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-4">
        <h1 className="page-title mb-1">SET UP YOUR ACCOUNTS</h1>
        <p className="text-muted-foreground text-sm">
          Step {step + 1} of {STEPS.length}: {STEPS[step]} · nothing is saved until you confirm
        </p>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1.5 mt-3" />
      </div>

      <div className="night-game-card p-5 md:p-6 space-y-5 mb-6">
        {step === 0 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Is the old M&T savings account closed?</h2>
            <p className="text-sm text-muted-foreground">The savings sub-account the business used before the LLC.</p>
            {choice(oldStatus === "closed", () => setOldStatus("closed"), "Closed, or empty", "All its money has moved to the new accounts.")}
            {choice(oldStatus === "open", () => setOldStatus("open"), "Still open with money in it", "It gets its own account here until you empty it.")}
            {oldStatus === "open" && (
              <FormField label="What's in it today?" htmlFor="old-balance" required>
                <CurrencyInput id="old-balance" value={oldBalance} onChange={(e) => setOldBalance(e.target.value)} placeholder="0.00" />
              </FormField>
            )}
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="text-lg font-bold text-foreground">How were the new accounts funded?</h2>
            <p className="text-sm text-muted-foreground">
              Check each amount and the date it actually landed. Leave an amount blank if that money didn't move.
            </p>
            {opening.map((row, i) => {
              const already = row.kind === "operating" ? 0 : balanceOf(row.kind);
              return (
                <div key={row.kind} className="rounded-lg border border-border p-4 space-y-3">
                  <div>
                    <div className="font-semibold text-foreground">{row.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {row.source}
                      {already > 0 && ` · ${formatMoney(already)} already recorded in ${ACCOUNT_LABEL[row.kind]}`}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <CurrencyInput
                      aria-label={`${row.label} amount`}
                      value={row.amount}
                      placeholder={row.kind === "reserve" ? "about 3,900" : "0.00"}
                      onChange={(e) => setOpening((rows) => rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))}
                    />
                    <DateInput
                      aria-label={`${row.label} date`}
                      value={row.date}
                      max={todayLocal()}
                      onChange={(e) => setOpening((rows) => rows.map((r, j) => (j === i ? { ...r, date: e.target.value } : r)))}
                    />
                  </div>
                  {invalidAmount(row.amount) && <p className="text-sm text-destructive">Enter dollars and cents, like 3900.00</p>}
                </div>
              );
            })}
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Money outside the bank</h2>
            <p className="text-sm text-muted-foreground">
              Show cash, plus any PayPal, Venmo, eBay or Whatnot balance that hasn't paid out to M&T yet. In the app this all
              counts as Operating, so the bank check needs it.
            </p>
            <FormField label="Total right now" htmlFor="cash-outside" helperText="Enter 0 if there isn't any">
              <CurrencyInput id="cash-outside" value={cashOutside} onChange={(e) => setCashOutside(e.target.value)} placeholder="0.00" />
            </FormField>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Today's bank balances</h2>
            <p className="text-sm text-muted-foreground">
              From your banking apps. If the app and the bank differ, the gap becomes one noted adjustment per account so they
              start out matching.
            </p>
            {bankKinds.map((k) => (
              <FormField key={k} label={ACCOUNT_LABEL[k]} htmlFor={`bank-${k}`} required>
                <CurrencyInput
                  id={`bank-${k}`}
                  value={bank[k] || ""}
                  onChange={(e) => setBank((b) => ({ ...b, [k]: e.target.value }))}
                  placeholder="0.00"
                />
              </FormField>
            ))}
            <FormField label="Anything that explains a difference? (optional)" htmlFor="setup-note">
              <Textarea id="setup-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={400}
                placeholder="e.g. bank fees not entered, a sale not yet recorded" />
            </FormField>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Your weekly tax transfer</h2>
            <p className="text-sm text-muted-foreground">Each Monday the app tells you what to move from Operating to Tax.</p>
            {choice(roundUp === true, () => setRoundUp(true), "Round up to the next dollar",
              "Easier to type at the bank; builds a few dollars of cushion. $187.40 owed → send $188.")}
            {choice(roundUp === false, () => setRoundUp(false), "Exact amount", "$187.40 owed → send $187.40.")}
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="text-lg font-bold text-foreground">Ready to save</h2>
            <ul className="text-sm text-foreground space-y-2">
              <li>Old M&T savings: {oldStatus === "open" ? `still open, ${formatMoney(normalizeMoneyInput(oldBalance))}` : "closed"}</li>
              {opening.filter((r) => Number(normalizeMoneyInput(r.amount) || 0) > 0).map((r) => (
                <li key={r.kind}>
                  {r.label}: {formatMoney(normalizeMoneyInput(r.amount))} on {formatBusinessDate(r.date, "MMM d")}
                </li>
              ))}
              <li>Money outside the bank: {formatMoney(normalizeMoneyInput(cashOutside) || "0")}</li>
              {bankKinds.map((k) => (
                <li key={k}>Bank balance, {ACCOUNT_LABEL[k]}: {formatMoney(normalizeMoneyInput(bank[k] || ""))}</li>
              ))}
              <li>Weekly transfer: {roundUp ? "rounded up to the dollar" : "exact amount"}</li>
            </ul>
          </>
        )}
      </div>

      <div className="flex gap-3 pb-24">
        <Button
          type="button"
          variant="outline"
          className="flex-1 min-h-[48px]"
          onClick={() => (step === 0 ? navigate(-1) : setStep((s) => s - 1))}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          {step === 0 ? "Later" : "Back"}
        </Button>
        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            className="flex-1 min-h-[48px] bg-primary hover:bg-primary/90 text-primary-foreground"
            disabled={!stepValid()}
            onClick={() => setStep((s) => s + 1)}
          >
            Next
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            type="button"
            className="flex-1 min-h-[48px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            disabled={setupMutation.isPending}
            onClick={() => setupMutation.mutate()}
          >
            {setupMutation.isPending ? "SAVING..." : "CONFIRM AND SAVE"}
          </Button>
        )}
      </div>
    </PageContainer>
  );
}
