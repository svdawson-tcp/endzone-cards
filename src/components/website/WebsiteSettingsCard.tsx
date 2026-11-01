import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useWebsiteSettings } from "@/hooks/useWebsiteSettings";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { effectiveOfferFloor, pctToPercentText, validateFloorPercent } from "@/lib/webShop";
import { formatMoney } from "@/lib/numericUtils";

/** Website offer settings: offers on/off and the default auto-accept percent (website_settings). */
export function WebsiteSettingsCard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isViewingAsMentor } = useMentorAccess();
  const { data: settings, isLoading } = useWebsiteSettings();

  const [offersEnabled, setOffersEnabled] = useState(true);
  const [percent, setPercent] = useState("85");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setOffersEnabled(settings.offers_enabled);
      setPercent(pctToPercentText(settings.offer_floor_pct));
    }
  }, [settings]);

  if (isLoading || !settings) return null;

  const percentError = validateFloorPercent(percent);
  const dirty =
    offersEnabled !== settings.offers_enabled || percent.trim() !== pctToPercentText(settings.offer_floor_pct);
  const example = percentError ? null : effectiveOfferFloor("100", null, Number(percent) / 100);

  const save = async () => {
    if (percentError) return;
    setSaving(true);
    try {
      const { data, error } = await supabase
        .from("website_settings")
        .update({
          offers_enabled: offersEnabled,
          offer_floor_pct: Number((Number(percent.trim()) / 100).toFixed(3)),
        })
        .eq("owner_user_id", settings.owner_user_id)
        .select("offers_enabled");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("Only the website owner can change these settings.");
      queryClient.invalidateQueries({ queryKey: ["websiteSettings"] });
      toast({ title: "Website settings saved" });
    } catch (error) {
      toast({
        title: "Couldn't save website settings",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="night-game-card space-y-4 p-4 md:p-6">
      <h2 className="text-lg font-bold text-foreground">Website offer settings</h2>

      <div className="flex min-h-[44px] items-center justify-between gap-4">
        <label htmlFor="offers-enabled" className="flex-1">
          <span className="block font-semibold text-foreground">Accept offers on cssportscards.com</span>
          <span className="text-xs text-muted-foreground">Turn off to hide the "Make an offer" button on every card</span>
        </label>
        <Switch
          id="offers-enabled"
          checked={offersEnabled}
          onCheckedChange={setOffersEnabled}
          disabled={isViewingAsMentor}
          className="scale-125"
        />
      </div>

      <div>
        <label htmlFor="offer-floor-pct" className="form-label">
          Auto-accept offers at or above (% of asking)
        </label>
        <div className="relative mt-2">
          <Input
            id="offer-floor-pct"
            type="text"
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
            disabled={isViewingAsMentor}
            className="min-h-[44px] pr-8"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">%</span>
        </div>
        {percentError ? (
          <p className="mt-1 text-sm text-destructive">{percentError}</p>
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">
            A $100.00 card auto-accepts offers of {formatMoney(example)} or more. Lower offers come to you.
            A card's own "Lowest offer to auto-accept" overrides this.
          </p>
        )}
      </div>

      {!isViewingAsMentor && (
        <Button
          onClick={save}
          disabled={!dirty || !!percentError || saving}
          className="min-h-[44px] w-full bg-primary font-semibold uppercase text-primary-foreground hover:bg-primary/90 md:w-auto"
        >
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      )}
    </div>
  );
}
