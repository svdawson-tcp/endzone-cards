import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { useInvalidateTodo } from "@/hooks/useTodo";
import { todayLocal } from "@/lib/dateUtils";
import { TRIP_PURPOSES, type TripPrefill, type TripPurpose } from "@/lib/todo";

export type TripRow = {
  id: string;
  trip_date: string;
  destination: string;
  purpose: TripPurpose;
  miles: number;
  round_trip: boolean;
  notes: string | null;
  show_id: string | null;
  lot_id: string | null;
  sell_lead_id: string | null;
};

interface TripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prefill?: TripPrefill | null;
  /** editing an existing trip */
  trip?: TripRow | null;
  onSaved?: () => void;
}

const parseMiles = (v: string): number | null => {
  if (!/^\d{1,4}(\.\d)?$/.test(v.trim())) return null;
  const n = Number(v);
  return n > 0 ? n : null;
};

/**
 * Log a business drive. Colton enters one-way miles; round trip (on by default) doubles them.
 * The trip is a mileage log only: no money moves. The last miles used for the same destination are suggested.
 */
export function TripDialog({ open, onOpenChange, prefill, trip, onSaved }: TripDialogProps) {
  const invalidate = useInvalidateTodo();
  const [date, setDate] = useState(todayLocal());
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState<TripPurpose>("other");
  const [miles, setMiles] = useState("");
  const [roundTrip, setRoundTrip] = useState(true);
  const [notes, setNotes] = useState("");
  const [touchedMiles, setTouchedMiles] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (trip) {
      setDate(trip.trip_date);
      setDestination(trip.destination);
      setPurpose(trip.purpose);
      setRoundTrip(trip.round_trip);
      setMiles(String(trip.round_trip ? Number(trip.miles) / 2 : Number(trip.miles)));
      setNotes(trip.notes || "");
      setTouchedMiles(true);
    } else {
      setDate(prefill?.trip_date && prefill.trip_date <= todayLocal() ? prefill.trip_date : todayLocal());
      setDestination(prefill?.destination || "");
      setPurpose(prefill?.purpose || "other");
      setRoundTrip(true);
      setMiles("");
      setNotes("");
      setTouchedMiles(false);
    }
  }, [open, trip, prefill]);

  // Suggest the one-way miles from the last trip to the same place.
  const { data: recentTrips = [] } = useQuery({
    queryKey: ["trips", "recentDestinations"],
    enabled: open,
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data, error } = await supabase
        .from("trips")
        .select("destination, miles, round_trip")
        .eq("user_id", user.id)
        .order("trip_date", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data || [];
    },
  });
  const destinations = useMemo(() => {
    const seen = new Map<string, number>();
    for (const t of recentTrips) {
      const k = t.destination.trim().toLowerCase();
      if (!seen.has(k)) seen.set(k, t.round_trip ? Number(t.miles) / 2 : Number(t.miles));
    }
    return seen;
  }, [recentTrips]);
  const destinationNames = useMemo(
    () => Array.from(new Set(recentTrips.map((t) => t.destination.trim()))).slice(0, 30),
    [recentTrips],
  );
  useEffect(() => {
    if (touchedMiles) return;
    const s = destinations.get(destination.trim().toLowerCase());
    setMiles(s ? String(s) : "");
  }, [destination, destinations, touchedMiles]);

  const oneWay = parseMiles(miles);
  const total = oneWay === null ? null : Math.round((roundTrip ? oneWay * 2 : oneWay) * 10) / 10;

  const mutation = useMutation({
    mutationFn: async () => {
      if (destination.trim().length < 2) throw new Error("Where did you drive to?");
      if (total === null) throw new Error("Enter the miles (whole number or one decimal)");
      if (total > 2000) throw new Error("That's more than 2,000 miles. Check the number.");
      const row = {
        trip_date: date,
        destination: destination.trim(),
        purpose,
        miles: total,
        round_trip: roundTrip,
        notes: notes.trim() || null,
      };
      if (trip) {
        const { error } = await supabase.from("trips").update(row).eq("id", trip.id);
        if (error) throw error;
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase.from("trips").insert({
        ...row,
        user_id: user.id,
        show_id: prefill?.show_id || null,
        lot_id: prefill?.lot_id || null,
        sell_lead_id: prefill?.sell_lead_id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: trip ? "Trip updated" : `Logged ${total} miles` });
      invalidate();
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Could not save the trip", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{trip ? "Edit trip" : "Log a drive"}</DialogTitle>
          <DialogDescription>Business miles are a tax deduction. The IRS wants the date, where, why and how far.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <FormField label="Date" htmlFor="trip-date" required>
            <DateInput id="trip-date" value={date} max={todayLocal()} onChange={(e) => setDate(e.target.value)} />
          </FormField>

          <FormField label="Where to" htmlFor="trip-dest" required helperText="Town, show or seller">
            <Input
              id="trip-dest"
              className="min-h-[44px]"
              value={destination}
              list="trip-destinations"
              maxLength={120}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="e.g. Hershey, PA"
            />
            <datalist id="trip-destinations">
              {destinationNames.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </FormField>

          <div>
            <span className="form-label">Why</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {TRIP_PURPOSES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPurpose(p.value)}
                  className={`min-h-[44px] px-3 rounded-md border text-sm font-medium ${
                    purpose === p.value ? "bg-primary text-primary-foreground border-primary" : "border-input text-foreground"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <FormField
            label="Miles one way"
            htmlFor="trip-miles"
            required
            helperText={destinations.has(destination.trim().toLowerCase()) && !touchedMiles ? "Same as your last trip there" : undefined}
          >
            <Input
              id="trip-miles"
              className="min-h-[44px]"
              inputMode="decimal"
              value={miles}
              onChange={(e) => {
                setTouchedMiles(true);
                setMiles(e.target.value);
              }}
              placeholder="23"
            />
          </FormField>

          <div className="flex items-center justify-between gap-4 rounded-md border border-input p-3 min-h-[44px]">
            <Label htmlFor="trip-round" className="cursor-pointer">
              Round trip (there and back)
            </Label>
            <Switch id="trip-round" checked={roundTrip} onCheckedChange={setRoundTrip} />
          </div>
          {total !== null && (
            <p className="text-sm font-semibold text-foreground">{total} business miles</p>
          )}

          <FormField label="Note" htmlFor="trip-notes">
            <Textarea id="trip-notes" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {trip ? "SAVE TRIP" : "LOG THE DRIVE"}
            </Button>
            <Button variant="ghost" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
