import { SALES_CHANNELS } from "@/lib/moneyConstants";
import { cn } from "@/lib/utils";

interface SalesChannelChipsProps {
  value: string;
  onChange: (value: string) => void;
  error?: string;
  label?: string;
}

export function SalesChannelChips({ value, onChange, error, label = "Sold on" }: SalesChannelChipsProps) {
  return (
    <div>
      <label className="form-label">{label} *</label>
      <div className="flex flex-wrap gap-2 mt-2">
        {SALES_CHANNELS.map((channel) => {
          const selected = value === channel.value;
          return (
            <button
              key={channel.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(channel.value)}
              className={cn(
                "min-h-[44px] px-4 rounded-full border text-sm font-medium transition-colors",
                selected
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-input hover:bg-muted"
              )}
            >
              {channel.label}
            </button>
          );
        })}
      </div>
      {error && <p className="text-destructive text-sm mt-1">{error}</p>}
    </div>
  );
}
