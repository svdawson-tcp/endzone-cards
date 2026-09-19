import { Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { todayLocal } from "@/lib/dateUtils";
import { PERIOD_OPTIONS, type PeriodState } from "@/hooks/usePeriod";

interface PeriodPickerProps {
  state: PeriodState;
  children?: React.ReactNode;
}

export function PeriodPicker({ state, children }: PeriodPickerProps) {
  const { period, setPeriod, customFrom, setCustomFrom, customTo, setCustomTo, customInvalid } = state;

  return (
    <div className="w-full md:w-auto space-y-3">
      <Select value={period} onValueChange={setPeriod}>
        <SelectTrigger className="w-full md:w-[220px] min-h-[44px] bg-card border-input text-foreground">
          <Calendar className="mr-2 h-4 w-4 text-accent" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-card border-input text-foreground">
          {PERIOD_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {period === "custom" && (
        <div className="space-y-2">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="range-from">From</label>
              <input
                id="range-from"
                type="date"
                value={customFrom}
                max={todayLocal()}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-input bg-card px-3 text-foreground"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-muted-foreground mb-1" htmlFor="range-to">To</label>
              <input
                id="range-to"
                type="date"
                value={customTo}
                max={todayLocal()}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-full min-h-[44px] rounded-md border border-input bg-card px-3 text-foreground"
              />
            </div>
          </div>
          {customInvalid && (
            <p className="text-sm metric-negative">From date must be on or before the To date.</p>
          )}
        </div>
      )}

      {children}
    </div>
  );
}
