// EndZone → Sellers: "Got Cards?" submissions from cssportscards.com/sell (migration 0027).
// Colton sends an offer / asks for more / passes (sell-respond emails the seller), or logs a call or text.
// "Mark bought" opens Create Lot pre-filled; saving it links the lot here (web_sell_lead_link_lot).
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Inbox, Loader2, Mail, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { formatMoney, normalizeMoneyInput } from "@/lib/numericUtils";
import { formatMoment, functionErrorMessage } from "@/lib/webShop";
import type { Database } from "@/integrations/supabase/types";

type Lead = Database["public"]["Tables"]["web_sell_leads"]["Row"];
type Reply = "offer" | "ask_more" | "pass";
type Filter = "open" | "all";

const PAGE_SIZE = 50;
const CATEGORY: Record<string, string> = {
  football: "Football", basketball: "Basketball", baseball: "Baseball", hockey: "Hockey", soccer: "Soccer",
  pokemon: "Pokémon", disney: "Disney", marvel: "Marvel", "not sure": "Not sure",
};
const HANDOFF: Record<string, string> = {
  show: "Meet at a show", meetup: "Meet up (within ~90 min of Harrisburg)", ship: "Ship them in (lower 48)", "not sure": "Not sure yet",
};
const STATUS: Record<string, { label: string; tone: "new" | "wait" | "good" | "muted" }> = {
  new: { label: "New", tone: "new" },
  offer_sent: { label: "Offer sent", tone: "wait" },
  asked_more: { label: "Asked for more", tone: "wait" },
  accepted: { label: "Accepted — set up the buy", tone: "good" },
  declined: { label: "They said no", tone: "muted" },
  passed: { label: "Passed", tone: "muted" },
  bought: { label: "Bought", tone: "good" },
};
const OPEN = new Set(["new", "offer_sent", "asked_more", "accepted"]);
// Scott, 14 Nov 2026: CS sends a prepaid label once a seller accepts an offer of $100+ (keep in step with _shop/sell.ts).
const PREPAID_LABEL_MIN = 100;

function usePhotoUrls(leads: Lead[] | undefined) {
  const paths = useMemo(() => (leads || []).flatMap((l) => l.photo_paths), [leads]);
  return useQuery({
    queryKey: ["sellPhotoUrls", paths.join("|")],
    enabled: paths.length > 0,
    staleTime: 50 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from("sell-photos").createSignedUrls(paths, 60 * 60);
      if (error) throw error;
      const map: Record<string, string> = {};
      (data || []).forEach((d) => { if (d.path && d.signedUrl) map[d.path] = d.signedUrl; });
      return map;
    },
  });
}

export default function Sellers() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const focusId = params.get("lead");
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();

  const [filter, setFilter] = useState<Filter>("open");
  const [pages, setPages] = useState(1);
  const [replyFor, setReplyFor] = useState<{ id: string; kind: Reply } | null>(null);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const { data: leads, isLoading } = useQuery({
    queryKey: ["sellLeads", viewingUserId, pages],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase
        .from("web_sell_leads")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .range(0, pages * PAGE_SIZE - 1);
      if (error) throw error;
      return (data || []) as Lead[];
    },
  });
  const { data: photoUrls } = usePhotoUrls(leads);

  // A link from Colton's email (?lead=…) shows that seller even when it's closed, and scrolls to it.
  useEffect(() => {
    if (!focusId || !leads) return;
    const l = leads.find((x) => x.id === focusId);
    if (l && !OPEN.has(l.status)) setFilter("all");
    setTimeout(() => document.getElementById(`lead-${focusId}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }, [focusId, leads]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["sellLeads"] });
    queryClient.invalidateQueries({ queryKey: ["webShopCounts"] });
  };

  const openReply = (lead: Lead, kind: Reply) => {
    setReplyFor({ id: lead.id, kind });
    setAmount(kind === "offer" && lead.offer_amount ? Number(lead.offer_amount).toFixed(2) : "");
    setMessage("");
  };

  const sendReply = async (lead: Lead) => {
    if (!replyFor) return;
    const offer = replyFor.kind === "offer" ? normalizeMoneyInput(amount) : null;
    if (replyFor.kind === "offer" && (offer === null || Number(offer) <= 0)) {
      toast({ title: "Enter your offer", description: "An amount like 120 or 120.50.", variant: "destructive" });
      return;
    }
    if (replyFor.kind === "ask_more" && !message.trim()) {
      toast({ title: "Write your question", description: "Say what you'd like to see or know.", variant: "destructive" });
      return;
    }
    setBusyId(lead.id);
    try {
      const { data, error } = await supabase.functions.invoke("sell-respond", {
        body: { lead_id: lead.id, action: replyFor.kind, amount: offer, message: message.trim() },
      });
      if (error) {
        toast({ title: "Not sent", description: await functionErrorMessage(error, "Couldn't reach the website. Please try again."), variant: "destructive" });
        return;
      }
      toast({
        title: replyFor.kind === "offer" ? `Offer of ${formatMoney(offer)} sent` : replyFor.kind === "pass" ? "Passed" : "Question sent",
        description: data?.warning || `${lead.seller_name} was emailed. Their reply comes to your inbox.`,
      });
      setReplyFor(null);
    } finally {
      setBusyId(null);
      refresh();
    }
  };

  const logStatus = async (lead: Lead, status: "accepted" | "declined" | "passed") => {
    setBusyId(lead.id);
    const { error } = await supabase
      .from("web_sell_leads")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", lead.id);
    setBusyId(null);
    if (error) toast({ title: "Not saved", description: error.message, variant: "destructive" });
    refresh();
  };

  const saveNotes = async (lead: Lead) => {
    setBusyId(lead.id);
    const { error } = await supabase.from("web_sell_leads").update({ owner_notes: notes.trim() || null }).eq("id", lead.id);
    setBusyId(null);
    if (error) {
      toast({ title: "Notes not saved", description: error.message, variant: "destructive" });
      return;
    }
    setNotesFor(null);
    refresh();
  };

  const shown = (leads || []).filter((l) => filter === "all" || OPEN.has(l.status) || l.id === focusId);
  const newCount = (leads || []).filter((l) => l.status === "new").length;
  const hasMore = (leads?.length || 0) >= pages * PAGE_SIZE;

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-6 pb-32 md:pb-8">
      <div>
        <h1 className="text-2xl font-bold uppercase tracking-wide text-foreground md:text-3xl">Sellers</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          People who sent cards through cssportscards.com/sell.{" "}
          {newCount > 0 ? `${newCount} new — the site promises a reply within 24 hours.` : "Nothing new."}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2" role="tablist">
        {(["open", "all"] as Filter[]).map((f) => (
          <Button
            key={f}
            role="tab"
            aria-selected={filter === f}
            variant={filter === f ? "default" : "outline"}
            className="min-h-[44px] font-semibold uppercase"
            onClick={() => setFilter(f)}
          >
            {f === "open" ? "Open" : "All"}
          </Button>
        ))}
      </div>

      <div className="night-game-card p-4 md:p-6">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-40 w-full bg-muted/20" />)}
          </div>
        ) : shown.length === 0 ? (
          <div className="py-8 text-center">
            <Inbox className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="text-muted-foreground">{filter === "open" ? "No open sellers." : "No sellers yet."}</p>
          </div>
        ) : (
          <div className="divide-y divide-border/50">
            {shown.map((lead) => {
              const st = STATUS[lead.status] ?? { label: lead.status, tone: "muted" as const };
              const busy = busyId === lead.id;
              const replying = replyFor?.id === lead.id ? replyFor.kind : null;
              const closed = lead.status === "bought";
              return (
                <div key={lead.id} id={`lead-${lead.id}`} className="space-y-3 py-5 first:pt-0 last:pb-0" data-testid="lead-row">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-lg font-bold leading-tight text-foreground">{lead.seller_name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatMoment(lead.created_at)}{lead.zip ? ` · ${lead.zip}` : ""}
                      </p>
                    </div>
                    <Badge
                      variant={st.tone === "muted" ? "outline" : "default"}
                      className={st.tone === "new" ? "bg-accent text-accent-foreground" : "text-xs"}
                    >
                      {st.label}
                    </Badge>
                  </div>

                  <div className="flex flex-wrap gap-2 text-sm">
                    <a className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 text-foreground" href={`mailto:${lead.seller_email}`}>
                      <Mail className="h-4 w-4" /> {lead.seller_email}
                    </a>
                    {lead.seller_phone && (
                      <a className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-border px-3 text-foreground" href={`tel:${lead.seller_phone.replace(/[^\d+]/g, "")}`}>
                        <Phone className="h-4 w-4" /> {lead.seller_phone}
                      </a>
                    )}
                  </div>

                  {lead.photo_paths.length > 0 && (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {lead.photo_paths.map((p, i) =>
                        photoUrls?.[p] ? (
                          <button key={p} type="button" onClick={() => setZoom(photoUrls[p])} aria-label={`Open photo ${i + 1}`}>
                            <img src={photoUrls[p]} alt={`Photo ${i + 1} from ${lead.seller_name}`} className="aspect-square w-full rounded-md object-cover" loading="lazy" />
                          </button>
                        ) : (
                          <Skeleton key={p} className="aspect-square w-full bg-muted/20" />
                        ),
                      )}
                    </div>
                  )}

                  <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
                    {lead.categories.length > 0 && <Fact k="Cards" v={lead.categories.map((c) => CATEGORY[c] ?? c).join(", ")} />}
                    {lead.card_count && <Fact k="How many" v={lead.card_count} />}
                    {lead.graded && <Fact k="Graded" v={lead.graded} />}
                    {lead.era && <Fact k="Mostly from" v={lead.era} />}
                    <Fact k="Asking" v={lead.asking_price != null ? formatMoney(lead.asking_price) : "No price — wants an offer"} />
                    {lead.handoff && <Fact k="Handoff" v={HANDOFF[lead.handoff] ?? lead.handoff} />}
                  </dl>
                  {lead.details && (
                    <p className="whitespace-pre-wrap break-words rounded-md bg-muted/20 px-3 py-2 text-sm text-foreground/90">“{lead.details}”</p>
                  )}

                  {(lead.offer_amount != null || lead.last_message || lead.responded_at) && (
                    <p className="text-sm text-muted-foreground">
                      {lead.offer_amount != null && <>Your {closed ? "price" : "offer"}: <span className="font-semibold text-foreground">{formatMoney(lead.offer_amount)}</span>. </>}
                      {lead.responded_at && <>Last update {formatMoment(lead.responded_at)}.</>}
                      {lead.last_message && <span className="mt-1 block whitespace-pre-wrap">You wrote: “{lead.last_message}”</span>}
                    </p>
                  )}

                  {lead.status === "accepted" && lead.handoff === "ship" && (
                    <p className="rounded-md border-l-4 border-accent bg-muted/20 px-3 py-2 text-sm text-foreground">
                      {Number(lead.offer_amount ?? 0) >= PREPAID_LABEL_MIN
                        ? "They're shipping, and the deal is $100+: email them a prepaid shipping label (insured, with tracking)."
                        : "They're shipping, and the deal is under $100: email them your address; they pay the postage."}
                    </p>
                  )}

                  {lead.owner_notes && notesFor !== lead.id && (
                    <p className="whitespace-pre-wrap text-sm"><span className="font-semibold">Your notes:</span> {lead.owner_notes}</p>
                  )}

                  {closed && lead.lot_id && (
                    <Button variant="link" className="min-h-[44px] px-0 text-accent" onClick={() => navigate(`/lots/${lead.lot_id}`)}>
                      Open the lot <ExternalLink className="ml-1 h-4 w-4" />
                    </Button>
                  )}

                  {!isViewingAsMentor && !closed && (
                    replying ? (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <p className="form-label">
                          {replying === "offer" ? "Your offer" : replying === "ask_more" ? "Ask for more" : "Pass on these"}
                        </p>
                        {replying === "offer" && (
                          <CurrencyInput id={`offer-${lead.id}`} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
                        )}
                        <Textarea
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          maxLength={2000}
                          rows={3}
                          placeholder={
                            replying === "offer" ? "Optional note, e.g. what the offer covers"
                              : replying === "ask_more" ? "e.g. Can you send the backs of the Brady and the Mahomes?"
                              : "Optional note (a polite pass is sent either way)"
                          }
                        />
                        <p className="text-xs text-muted-foreground">
                          {lead.seller_name} gets an email from the website. Replies come to colton@cssportscards.com.
                        </p>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => setReplyFor(null)}>Cancel</Button>
                          <Button className="min-h-[44px] font-semibold" disabled={busy} onClick={() => sendReply(lead)}>
                            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {replying === "offer" ? "Send offer" : replying === "ask_more" ? "Send" : "Send pass"}
                          </Button>
                        </div>
                      </div>
                    ) : notesFor === lead.id ? (
                      <div className="space-y-2 rounded-md border border-border p-3">
                        <p className="form-label">Your notes (only you see these)</p>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} autoFocus
                          placeholder="e.g. Talked Tue, meeting Sat at the Harrisburg show, bringing cash" />
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => setNotesFor(null)}>Cancel</Button>
                          <Button className="min-h-[44px] font-semibold" disabled={busy} onClick={() => saveNotes(lead)}>Save notes</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-3 gap-2">
                          <Button className="min-h-[44px] font-semibold" disabled={busy} onClick={() => openReply(lead, "offer")}>
                            {lead.status === "offer_sent" ? "New offer" : "Offer"}
                          </Button>
                          <Button variant="outline" className="min-h-[44px] font-semibold" disabled={busy} onClick={() => openReply(lead, "ask_more")}>Ask more</Button>
                          <Button variant="outline" className="min-h-[44px] font-semibold text-destructive" disabled={busy} onClick={() => openReply(lead, "pass")}>Pass</Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <Button
                            className="min-h-[44px] bg-primary font-semibold text-primary-foreground"
                            disabled={busy}
                            onClick={() => navigate(`/lots/new?seller=${lead.id}`)}
                          >
                            Mark bought
                          </Button>
                          {lead.status !== "accepted" && (
                            <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => logStatus(lead, "accepted")}>They said yes</Button>
                          )}
                          {lead.status !== "declined" && (
                            <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => logStatus(lead, "declined")}>They said no</Button>
                          )}
                          <Button variant="outline" className="min-h-[44px]" disabled={busy} onClick={() => { setNotesFor(lead.id); setNotes(lead.owner_notes || ""); }}>Notes</Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Called or texted instead? Use “They said yes / no” and Notes to keep track. “Mark bought” records the lot (cost comes out of your cash like any lot).
                        </p>
                      </div>
                    )
                  )}
                </div>
              );
            })}
            {hasMore && (
              <div className="pt-4 text-center">
                <Button variant="outline" className="min-h-[44px]" onClick={() => setPages((p) => p + 1)}>Load more</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!zoom} onOpenChange={(o) => !o && setZoom(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {zoom && <img src={zoom} alt="Seller photo" className="max-h-[80vh] w-full rounded-md object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted-foreground">{k}</dt>
      <dd className="min-w-0 break-words text-foreground">{v}</dd>
    </div>
  );
}
