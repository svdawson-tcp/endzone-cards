import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormField } from "@/components/forms/FormField";
import { CurrencyInput } from "@/components/forms/CurrencyInput";
import { PageContainer } from "@/components/layout/AppLayout";
import { CASH_ACCOUNT_KINDS } from "@/lib/moneyConstants";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { ArrowLeftRight, Plus, Archive } from "lucide-react";

interface AccountMetric {
  id: string;
  name: string;
  kind: string;
  target: number | null;
  is_default: boolean;
  balance: number;
}

export default function Accounts() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isViewingAsMentor, viewingUserId, getEffectiveUserId } = useMentorAccess();

  const [editing, setEditing] = useState<AccountMetric | null>(null);
  const [editName, setEditName] = useState("");
  const [editTarget, setEditTarget] = useState("");

  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState("other");
  const [newTarget, setNewTarget] = useState("");

  const { data: accounts, isLoading } = useQuery({
    queryKey: ["accountBalances", viewingUserId],
    queryFn: async () => {
      const userId = await getEffectiveUserId();
      const { data, error } = await supabase.rpc("get_dashboard_metrics", {
        p_user_id: userId,
        p_start: null,
        p_end: null,
      });
      if (error) throw error;
      return ((data as any)?.accounts || []) as AccountMetric[];
    },
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["accountBalances"] });
    queryClient.invalidateQueries({ queryKey: ["cash_accounts"] });
    queryClient.invalidateQueries({ queryKey: ["dashboardMetrics"] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editing) throw new Error("No account selected");
      const trimmed = editName.trim();
      if (!trimmed) throw new Error("Please enter an account name");
      const target = editTarget.trim() === "" ? null : Number(editTarget);
      if (target !== null && (isNaN(target) || target < 0)) {
        throw new Error("Target must be zero or more");
      }

      const { error } = await supabase
        .from("cash_accounts")
        .update({ name: trimmed, target_amount: target })
        .eq("id", editing.id);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Account saved" });
      setEditing(null);
      refresh();
    },
    onError: (error: Error) =>
      toast({ title: "Could not save", description: error.message, variant: "destructive" }),
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const userId = await getEffectiveUserId();
      const trimmed = newName.trim();
      if (!trimmed) throw new Error("Please enter an account name");
      const target = newTarget.trim() === "" ? null : Number(newTarget);
      if (target !== null && (isNaN(target) || target < 0)) {
        throw new Error("Target must be zero or more");
      }

      const maxSort = (accounts || []).length;
      const { error } = await supabase.from("cash_accounts").insert({
        user_id: userId,
        name: trimmed,
        kind: newKind,
        target_amount: target,
        sort_order: maxSort + 1,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Account added" });
      setAddOpen(false);
      setNewName("");
      setNewKind("other");
      setNewTarget("");
      refresh();
    },
    onError: (error: Error) =>
      toast({ title: "Could not add account", description: error.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: async (accountId: string) => {
      const { error } = await supabase
        .from("cash_accounts")
        .update({ archived: true })
        .eq("id", accountId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Account archived" });
      setEditing(null);
      refresh();
    },
    onError: (error: Error) =>
      toast({ title: "Could not archive", description: error.message, variant: "destructive" }),
  });

  const openEdit = (account: AccountMetric) => {
    if (isViewingAsMentor) return;
    setEditing(account);
    setEditName(account.name);
    setEditTarget(account.target === null ? "" : Number(account.target).toFixed(2));
  };

  const canArchive = editing && Number(editing.balance) === 0 && !editing.is_default;

  return (
    <PageContainer maxWidth="2xl">
      <div className="mb-6">
        <h1 className="page-title mb-2">ACCOUNTS</h1>
        <p className="text-muted-foreground">Where your business cash sits</p>
      </div>

      {!isViewingAsMentor && (
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <Button
            onClick={() => navigate("/cash/transfer")}
            className="flex-1 min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            <ArrowLeftRight className="mr-2 h-4 w-4" />
            Transfer Between Accounts
          </Button>
          <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setAddOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add Account
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full bg-muted/20" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {(accounts || []).map((account) => {
            const target = account.target === null ? null : Number(account.target);
            const balance = Number(account.balance);
            const pct = target && target > 0 ? Math.max(0, Math.min(100, (balance / target) * 100)) : 0;
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => openEdit(account)}
                disabled={isViewingAsMentor}
                className="w-full text-left night-game-card p-4 min-h-[44px]"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-foreground">{account.name}</span>
                  <span className="text-xl font-bold text-foreground">${balance.toFixed(2)}</span>
                </div>
                {target !== null && (
                  <div className="mt-3">
                    <Progress value={pct} className="h-2" />
                    <p className="text-xs text-muted-foreground mt-1">
                      ${balance.toFixed(2)} / ${target.toFixed(2)} target
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FormField label="Name" htmlFor="account-name" required>
              <Input
                id="account-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={50}
                className="min-h-[44px]"
              />
            </FormField>
            <FormField label="Target" htmlFor="account-target" helperText="Leave blank for no target">
              <CurrencyInput
                id="account-target"
                value={editTarget}
                onChange={(e) => setEditTarget(e.target.value)}
                placeholder="0.00"
              />
            </FormField>
            <div className="flex flex-col gap-3 pt-2">
              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 min-h-[44px]"
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                >
                  Save
                </Button>
              </div>
              {canArchive && (
                <Button
                  variant="outline"
                  className="min-h-[44px] text-destructive"
                  onClick={() => editing && archiveMutation.mutate(editing.id)}
                  disabled={archiveMutation.isPending}
                >
                  <Archive className="mr-2 h-4 w-4" />
                  Archive Account
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <FormField label="Name" htmlFor="new-account-name" required>
              <Input
                id="new-account-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={50}
                className="min-h-[44px]"
              />
            </FormField>
            <FormField label="Kind" htmlFor="new-account-kind" required>
              <Select value={newKind} onValueChange={setNewKind}>
                <SelectTrigger id="new-account-kind" className="min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CASH_ACCOUNT_KINDS.map((kind) => (
                    <SelectItem key={kind.value} value={kind.value}>
                      {kind.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Target (Optional)" htmlFor="new-account-target">
              <CurrencyInput
                id="new-account-target"
                value={newTarget}
                onChange={(e) => setNewTarget(e.target.value)}
                placeholder="0.00"
              />
            </FormField>
            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 min-h-[44px]" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 min-h-[44px]"
                onClick={() => addMutation.mutate()}
                disabled={addMutation.isPending}
              >
                Add
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}
