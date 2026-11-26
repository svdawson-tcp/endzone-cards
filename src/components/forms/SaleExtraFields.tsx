import { useQuery } from "@tanstack/react-query";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useMentorAccess } from "@/contexts/MentorAccessContext";

/** Channels where a platform keeps a cut, so "what the buyer paid" is worth asking. */
export const GROSS_CHANNELS = ["ebay", "whatnot", "facebook", "website", "other"];

export const channelShowsGross = (channel: string) => GROSS_CHANNELS.includes(channel);

export const GROSS_BELOW_NET_ERROR = "Buyer paid can't be less than what you received.";

/** Returns an error message when the gross is below the net; otherwise undefined. */
export function validateGrossAmount(net: string, gross: string): string | undefined {
  if (!gross || !gross.trim()) return undefined;
  const grossNum = parseFloat(gross);
  const netNum = parseFloat(net);
  if (isNaN(grossNum) || isNaN(netNum)) return undefined;
  return grossNum < netNum ? GROSS_BELOW_NET_ERROR : undefined;
}

interface SaleExtraFieldsProps {
  idPrefix: string;
  channel: string;
  net: string;
  gross: string;
  onGrossChange: (value: string) => void;
  postage: string;
  onPostageChange: (value: string) => void;
  grossError?: string;
  inputClassName?: string;
  /** Optional buyer name (0037), for first-time vs repeat buyers. Not asked for website sales (the order has it). */
  buyer?: string;
  onBuyerChange?: (value: string) => void;
}

/** What to save as transactions.buyer_name: trimmed, single-spaced, blank → null, never for website sales. */
export function buyerNameForSave(channel: string, name: string | undefined): string | null {
  if (channel === "website") return null;
  const v = (name ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return v || null;
}

/** Buyer box with suggestions from earlier sales and website buyers, so the same person is typed the same way. */
function BuyerNameInput({ idPrefix, value, onChange, inputClassName }: {
  idPrefix: string; value: string; onChange: (v: string) => void; inputClassName?: string;
}) {
  const { viewingUserId, getEffectiveUserId } = useMentorAccess();
  const { data: names = [] } = useQuery({
    queryKey: ["buyerNames", viewingUserId],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_buyer_names", { p_user_id: userId });
      if (error) throw error;
      return ((data ?? []) as { name: string }[]).map((r) => r.name);
    },
  });
  return (
    <div>
      <label htmlFor={`${idPrefix}-buyer`} className="form-label">
        Buyer (optional)
      </label>
      <Input
        id={`${idPrefix}-buyer`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        list={`${idPrefix}-buyer-names`}
        placeholder="Name or Facebook name"
        autoComplete="off"
        autoCapitalize="words"
        maxLength={80}
        className={`mt-2 ${inputClassName || ""}`}
      />
      <datalist id={`${idPrefix}-buyer-names`}>
        {names.map((n) => <option key={n} value={n} />)}
      </datalist>
      <p className="text-xs text-muted-foreground mt-1">
        Counts toward first-time and repeat buyers on the Dashboard. Pick the same name each time they buy.
      </p>
    </div>
  );
}

export function SaleExtraFields({
  idPrefix,
  channel,
  net,
  gross,
  onGrossChange,
  postage,
  onPostageChange,
  grossError,
  inputClassName,
  buyer,
  onBuyerChange,
}: SaleExtraFieldsProps) {
  const grossNum = parseFloat(gross);
  const netNum = parseFloat(net);
  const showFee =
    !isNaN(grossNum) && !isNaN(netNum) && grossNum > 0 && grossNum >= netNum;
  const fee = showFee ? grossNum - netNum : 0;
  const feePct = showFee && grossNum > 0 ? (fee / grossNum) * 100 : 0;

  return (
    <>
      {onBuyerChange && channel && channel !== "website" && (
        <BuyerNameInput idPrefix={idPrefix} value={buyer ?? ""} onChange={onBuyerChange} inputClassName={inputClassName} />
      )}

      {channelShowsGross(channel) && (
        <div>
          <label htmlFor={`${idPrefix}-gross`} className="form-label">
            What the buyer paid (optional)
          </label>
          <CurrencyInput
            id={`${idPrefix}-gross`}
            value={gross}
            onChange={(e) => onGrossChange(e.target.value)}
            placeholder="0.00"
            className={`mt-2 ${grossError ? "border-destructive" : ""} ${inputClassName || ""}`}
          />
          {showFee && (
            <p className="text-xs text-muted-foreground mt-1">
              Platform fee: ${fee.toFixed(2)} ({feePct.toFixed(1)}%)
            </p>
          )}
          {grossError && <p className="text-destructive text-sm mt-1">{grossError}</p>}
        </div>
      )}

      <div>
        <label htmlFor={`${idPrefix}-postage`} className="form-label">
          Postage you paid yourself (optional)
        </label>
        <CurrencyInput
          id={`${idPrefix}-postage`}
          value={postage}
          onChange={(e) => onPostageChange(e.target.value)}
          placeholder="0.00"
          className={`mt-2 ${inputClassName || ""}`}
        />
        <p className="text-xs text-muted-foreground mt-1">
          Anything you covered out of your own pocket. It gets added to what the business owes you.
        </p>
      </div>
    </>
  );
}
