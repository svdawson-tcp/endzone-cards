import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer } from "@/components/layout/AppLayout";
import { TripDialog, type TripRow } from "@/components/todo/TripDialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useInvalidateTodo } from "@/hooks/useTodo";
import { formatBusinessDate, todayLocal } from "@/lib/dateUtils";
import { formatMoney } from "@/lib/numericUtils";
import { periodLabel, tripPurposeLabel } from "@/lib/todo";
import { Car, Download, Plus } from "lucide-react";

type Summary = {
  year: number; trips: number; miles: number; deduction: number;
  months: { month: string; trips: number; miles: number; deduction: number }[];
  rates: { from: string; rate: number; source: string }[] | null;
};

const csvCell = (v: unknown) => {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function Trips() {
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();
  const invalidate = useInvalidateTodo();
  const [year, setYear] = useState(Number(todayLocal().slice(0, 4)));
  const [editing, setEditing] = useState<TripRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ["mileageSummary", viewingUserId, year],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_mileage_summary", { p_user_id: userId, p_year: year });
      if (error) throw error;
      return data as unknown as Summary;
    },
  });

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["trips", viewingUserId, year],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("trips")
        .select("id, trip_date, destination, purpose, miles, round_trip, notes, show_id, lot_id, sell_lead_id")
        .eq("user_id", userId)
        .gte("trip_date", `${year}-01-01`)
        .lte("trip_date", `${year}-12-31`)
        .order("trip_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as TripRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("trips").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Trip deleted" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: "Could not delete the trip", description: e.message, variant: "destructive" }),
  });

  const exportCsv = () => {
    const rows = [["Date", "Destination", "Purpose", "Business miles", "Round trip", "Notes"]];
    [...trips].reverse().forEach((t) =>
      rows.push([t.trip_date, t.destination, tripPurposeLabel(t.purpose), String(t.miles), t.round_trip ? "Yes" : "No", t.notes || ""]),
    );
    const blob = new Blob([rows.map((r) => r.map(csvCell).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mileage-log-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const thisYear = Number(todayLocal().slice(0, 4));

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        <h1 className="page-title mb-2">MILEAGE LOG</h1>
        <p className="text-muted-foreground">Business drives: shows, seller meetups, buying trips, post office runs.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {!isViewingAsMentor && (
          <Button onClick={() => setAdding(true)} className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold">
            <Plus className="mr-1 h-4 w-4" /> Log a drive
          </Button>
        )}
        <Button variant="outline" className="min-h-[44px]" onClick={exportCsv} disabled={trips.length === 0}>
          <Download className="mr-1 h-4 w-4" /> CSV for the accountant
        </Button>
        <div className="flex gap-1 ml-auto">
          {[thisYear - 1, thisYear].map((y) => (
            <Button key={y} variant={y === year ? "default" : "ghost"} className="min-h-[44px]" onClick={() => setYear(y)}>
              {y}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: "Drives", value: summary ? String(summary.trips) : "" },
          { label: "Miles", value: summary ? Number(summary.miles).toLocaleString("en-US", { maximumFractionDigits: 1 }) : "" },
          { label: "Est. deduction", value: summary ? formatMoney(summary.deduction) : "" },
        ].map((k) => (
          <div key={k.label} className="night-game-card p-4">
            <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{k.label}</h3>
            {loadingSummary ? <Skeleton className="h-7 w-2/3 bg-muted/20" /> : <div className="text-xl md:text-2xl font-bold text-foreground">{k.value}</div>}
          </div>
        ))}
      </div>

      <div className="night-game-card p-4 mb-6 text-sm text-muted-foreground space-y-2">
        <p>
          The estimate uses the IRS business rate on each drive's date
          {summary?.rates?.length
            ? `: ${summary.rates.map((r) => `${(Number(r.rate) * 100).toFixed(1).replace(/\.0$/, "")}¢ from ${formatBusinessDate(r.from, "MMM d")}`).join(", ")}`
            : ""}
          .
        </p>
        <p>
          For the accountant: the mileage rate already covers gas, so gas can't also be deducted if you use it. EndZone keeps both
          your gas expenses and this log; the accountant picks the method. Tolls and parking count either way.
        </p>
      </div>

      {summary && summary.months.length > 0 && (
        <div className="night-game-card p-4 mb-6">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">By month</h2>
          {summary.months.map((m) => (
            <div key={m.month} className="flex justify-between py-1.5 border-b border-border/40 last:border-0 text-sm">
              <span className="text-foreground">{periodLabel(m.month)}</span>
              <span className="text-muted-foreground">
                {Number(m.miles).toLocaleString("en-US", { maximumFractionDigits: 1 })} mi · {formatMoney(m.deduction)}
              </span>
            </div>
          ))}
        </div>
      )}

      {isLoading ? (
        <Skeleton className="h-24 w-full bg-muted/20" />
      ) : trips.length === 0 ? (
        <div className="night-game-card p-6 text-center text-muted-foreground">
          <Car className="h-8 w-8 mx-auto mb-2 text-accent" />
          No drives logged for {year} yet.
        </div>
      ) : (
        <div className="space-y-2">
          {trips.map((t) => (
            <div key={t.id} className="night-game-card p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold text-foreground truncate">{t.destination}</div>
                <div className="text-sm text-muted-foreground">
                  {formatBusinessDate(t.trip_date, "EEE MMM d")} · {tripPurposeLabel(t.purpose)}
                  {t.round_trip ? " · round trip" : ""}
                </div>
                {t.notes && <div className="text-sm text-muted-foreground mt-1">{t.notes}</div>}
              </div>
              <div className="text-right shrink-0">
                <div className="font-bold text-foreground">{Number(t.miles)} mi</div>
                {!isViewingAsMentor && (
                  <div className="flex gap-1 justify-end mt-1">
                    <Button variant="ghost" size="sm" className="min-h-[44px]" onClick={() => setEditing(t)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="min-h-[44px] text-destructive" disabled={remove.isPending}
                      onClick={() => (confirmId === t.id ? remove.mutate(t.id) : setConfirmId(t.id))}>
                      {confirmId === t.id ? "Tap to confirm" : "Delete"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <TripDialog open={adding} onOpenChange={setAdding} />
      <TripDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} trip={editing} />
    </PageContainer>
  );
}
