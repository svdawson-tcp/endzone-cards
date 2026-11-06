import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type TickerLine = {
  id: number;
  league: string;
  player: string;
  line: string;
  opponent: string | null;
  game_at: string;
  hidden: boolean;
  case_cards: number;
  bin_cards: number;
};

function gameDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/New_York", weekday: "short", month: "numeric", day: "numeric",
  }).toUpperCase();
}

/**
 * Big Games ticker on cssportscards.com: every line from the last 8 days that matches a card Colton has listed,
 * including ones he has hidden. Hide takes a wrong or unwanted line off the site within a minute; Show brings it back.
 * The ticker itself only ever shows 15 lines, newest first.
 */
export function TickerEditor({ readOnly }: { readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<number | null>(null);

  const { data: lines, isLoading, error } = useQuery({
    queryKey: ["bigGamesAdmin"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_big_games_admin");
      if (error) throw error;
      return ((data as unknown as TickerLine[]) || []);
    },
  });

  const setHidden = async (l: TickerLine, hidden: boolean) => {
    setBusy(l.id);
    try {
      const { error } = await supabase.rpc("web_hide_big_game", { p_id: l.id, p_hidden: hidden });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["bigGamesAdmin"] });
      toast({
        title: hidden ? "Hidden from the ticker" : "Back on the ticker",
        description: `${l.player}: ${l.line}`,
      });
    } catch (e) {
      toast({
        title: "Couldn't change that line",
        description: e instanceof Error ? e.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const shown = (lines || []).filter((l) => !l.hidden).length;

  return (
    <div className="night-game-card space-y-4 p-4 md:p-6">
      <div>
        <h2 className="text-lg font-bold text-foreground">Big Games ticker</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Big games from the last 8 days for players you have cards listed for. If a line looks wrong, or you'd
          rather not show it, tap Hide. The site shows up to 15 lines, newest first.
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : error ? (
        <p className="text-sm text-destructive">Couldn't load the ticker lines. Please refresh.</p>
      ) : !lines?.length ? (
        <p className="text-sm text-muted-foreground">
          No big games this week for players you have listed, so the ticker isn't showing.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {shown} showing{lines.length > shown ? `, ${lines.length - shown} hidden` : ""}
          </p>
          <ul className="divide-y divide-border">
            {lines.map((l) => (
              <li key={l.id} className={`flex items-center gap-3 py-3 ${l.hidden ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-foreground">{l.player}</span>
                    <Badge variant="outline" className="uppercase">{l.league}</Badge>
                    {l.hidden && <Badge variant="secondary">Hidden</Badge>}
                  </div>
                  <p className="text-sm text-foreground">
                    {l.line}
                    {l.opponent ? ` ${l.opponent}` : ""} · {gameDay(l.game_at)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {[
                      l.case_cards ? `${l.case_cards} in the case` : "",
                      l.bin_cards ? `${l.bin_cards} in the bin` : "",
                    ].filter(Boolean).join(", ")}
                  </p>
                </div>
                {!readOnly && (
                  <Button
                    variant="outline"
                    className="min-h-[44px] shrink-0"
                    disabled={busy === l.id}
                    onClick={() => setHidden(l, !l.hidden)}
                    aria-label={`${l.hidden ? "Show" : "Hide"} ${l.player} ${l.line}`}
                  >
                    {busy === l.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : l.hidden ? (
                      <><Eye className="mr-2 h-4 w-4" />Show</>
                    ) : (
                      <><EyeOff className="mr-2 h-4 w-4" />Hide</>
                    )}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
