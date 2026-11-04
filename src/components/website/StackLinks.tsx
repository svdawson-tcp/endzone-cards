import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Layers, Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatMoment } from "@/lib/webShop";

const SITE = "https://www.cssportscards.com";

type StackRow = {
  id: string;
  token: string;
  customer_name: string;
  customer_email: string | null;
  note: string | null;
  closed_at: string | null;
  created_at: string;
  orders: { order_number: string; status: string; shipped_at: string | null }[];
};

export const stackLinkUrl = (token: string) => `${SITE}/shop?ship=${token}`;

/**
 * Open stacks: regulars Colton is holding cards for. Each gets a private link; website orders placed through it
 * ship free and show up in Web Orders as "Stack: name". He charges shipping once, when the stack ships, then closes it.
 */
export function StackLinks({ ownerId, readOnly }: { ownerId: string; readOnly: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [showClosed, setShowClosed] = useState(false);

  const { data: stacks = [], isLoading } = useQuery({
    queryKey: ["stackLinks", ownerId],
    queryFn: async () => {
      const COLS = "id, token, customer_name, customer_email, note, closed_at, created_at";
      const run = (select: string) => supabase.from("web_ship_links").select(select)
        .eq("user_id", ownerId).eq("kind", "stack").order("created_at", { ascending: false });
      let { data, error } = await run(`${COLS}, orders:web_orders!web_orders_ship_link_id_fkey(order_number, status, shipped_at)`);
      if (error) {
        console.error("Stack links with orders failed; loading without them", error);
        ({ data, error } = await run(COLS));
      }
      if (error) throw error;
      return ((data || []) as unknown as StackRow[]).map((r) => ({ ...r, orders: r.orders || [] }));
    },
  });

  const open = stacks.filter((s) => !s.closed_at);
  const closed = stacks.filter((s) => s.closed_at);

  const copy = async (s: StackRow) => {
    const url = stackLinkUrl(s.token);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(s.id);
      setTimeout(() => setCopied((c) => (c === s.id ? null : c)), 2000);
      toast({ title: "Link copied", description: `Text or email it to ${s.customer_name}.` });
    } catch {
      window.prompt("Copy this link:", url);
    }
  };

  const create = async () => {
    setBusy("new");
    try {
      const { data, error } = await supabase.rpc("web_create_stack_link", {
        p_name: name.trim(), p_email: email.trim() || undefined,
      });
      if (error) throw error;
      setName(""); setEmail(""); setAdding(false);
      await queryClient.invalidateQueries({ queryKey: ["stackLinks", ownerId] });
      if (data?.token) {
        try { await navigator.clipboard.writeText(stackLinkUrl(data.token)); } catch { /* shown in the list */ }
      }
      toast({ title: `Stack link made for ${data?.customer_name ?? "customer"}`, description: "Link copied. Text or email it to them." });
    } catch (e) {
      toast({ title: "Couldn't make the link", description: e instanceof Error ? e.message : "Please try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const setClosed = async (s: StackRow, reopen: boolean) => {
    setBusy(s.id);
    try {
      const { error } = await supabase.rpc("web_close_stack_link", { p_link_id: s.id, p_reopen: reopen });
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ["stackLinks", ownerId] });
      toast({ title: reopen ? `${s.customer_name}'s stack reopened` : `${s.customer_name}'s stack closed`,
        description: reopen ? "Their link gives free shipping again." : "Their link no longer gives free shipping." });
    } catch (e) {
      toast({ title: "Not saved", description: e instanceof Error ? e.message : "Please try again", variant: "destructive" });
    } finally {
      setBusy(null);
    }
  };

  const row = (s: StackRow) => {
    const waiting = s.orders.filter((o) => o.status === "paid" && !o.shipped_at);
    return (
      <li key={s.id} className={`rounded-md border border-border p-3 ${s.closed_at ? "opacity-60" : ""}`} data-testid="stack-row">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{s.customer_name}</p>
            <p className="text-xs text-muted-foreground">
              {s.customer_email ? `${s.customer_email} · ` : ""}
              {s.closed_at ? `Closed ${formatMoment(s.closed_at, "MMM d")}` : `Opened ${formatMoment(s.created_at, "MMM d")}`}
            </p>
            {waiting.length > 0 && (
              <p className="mt-1 text-sm text-foreground">
                Website orders in this stack: {waiting.map((o) => o.order_number).join(", ")}
              </p>
            )}
          </div>
          {!s.closed_at && <Badge className="shrink-0 text-xs">Free shipping on</Badge>}
        </div>
        {!readOnly && (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {s.closed_at ? (
              <Button variant="outline" className="col-span-2 min-h-[44px]" disabled={busy === s.id} onClick={() => setClosed(s, true)}>
                Reopen stack
              </Button>
            ) : (
              <>
                <Button variant="outline" className="min-h-[44px]" onClick={() => copy(s)}>
                  {copied === s.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                  Copy link
                </Button>
                <Button variant="outline" className="min-h-[44px]" disabled={busy === s.id} onClick={() => setClosed(s, false)}>
                  {busy === s.id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Stack shipped: close
                </Button>
              </>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="night-game-card space-y-3 p-4 md:p-6" data-testid="stack-links">
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5 text-[hsl(var(--accent))]" />
        <h2 className="text-lg font-bold text-foreground">Open stacks</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        For regulars you're holding cards for. Send them their link: anything they buy on the website through it ships free
        and is added to their stack. Close the stack when it ships.
      </p>

      {isLoading ? null : open.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">No open stacks.</p>
      ) : (
        <ul className="space-y-2">{open.map(row)}</ul>
      )}

      {!readOnly && (adding ? (
        <div className="space-y-2 rounded-md border border-border p-3">
          <label htmlFor="stack-name" className="form-label">Customer name</label>
          <Input id="stack-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="min-h-[44px]" autoFocus />
          <label htmlFor="stack-email" className="form-label">Email (optional, just for your reference)</label>
          <Input id="stack-email" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} className="min-h-[44px]" />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" className="min-h-[44px]" onClick={() => { setAdding(false); setName(""); setEmail(""); }}>Cancel</Button>
            <Button className="min-h-[44px] font-semibold" disabled={!name.trim() || busy === "new"} onClick={create}>
              {busy === "new" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Make link
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" className="min-h-[44px] w-full" onClick={() => setAdding(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New stack link
        </Button>
      ))}

      {closed.length > 0 && (
        <div>
          <button type="button" className="min-h-[44px] text-sm underline text-muted-foreground" onClick={() => setShowClosed((v) => !v)}>
            {showClosed ? "Hide" : "Show"} closed stacks ({closed.length})
          </button>
          {showClosed && <ul className="mt-2 space-y-2">{closed.map(row)}</ul>}
        </div>
      )}
    </div>
  );
}
