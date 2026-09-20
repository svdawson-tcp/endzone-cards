import { CurrencyInput } from "@/components/forms/CurrencyInput";

/** Channels where a platform keeps a cut, so "what the buyer paid" is worth asking. */
export const GROSS_CHANNELS = ["ebay", "whatnot", "facebook", "other"];

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
}: SaleExtraFieldsProps) {
  const grossNum = parseFloat(gross);
  const netNum = parseFloat(net);
  const showFee =
    !isNaN(grossNum) && !isNaN(netNum) && grossNum > 0 && grossNum >= netNum;
  const fee = showFee ? grossNum - netNum : 0;
  const feePct = showFee && grossNum > 0 ? (fee / grossNum) * 100 : 0;

  return (
    <>
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
