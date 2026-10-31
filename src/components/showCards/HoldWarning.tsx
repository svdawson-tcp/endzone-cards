import { format, isToday } from "date-fns";
import { Clock } from "lucide-react";
import { isHeld } from "@/lib/shopApi";

/** "3:40 PM" today, "Sat 3:40 PM" on another day. */
const holdTime = (iso: string) => {
  const d = new Date(iso);
  return isToday(d) ? format(d, "h:mm a") : format(d, "EEE MMM d, h:mm a");
};

/**
 * Amber warning shown while a card is reserved for an online buyer (checkout in progress, or an
 * accepted/countered offer waiting for payment). Renders nothing when the card isn't held.
 */
export function HoldWarning({ holdUntil, children }: { holdUntil: string | null | undefined; children?: React.ReactNode }) {
  if (!isHeld(holdUntil)) return null;
  return (
    <div role="alert" className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-amber-900" data-testid="hold-warning">
      <div className="flex gap-2">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p className="text-sm">
          <span className="font-bold">On hold for an online buyer until {holdTime(holdUntil!)}.</span> Don't sell it in
          person until then.
        </p>
      </div>
      {children}
    </div>
  );
}
