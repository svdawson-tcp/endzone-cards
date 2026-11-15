import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/forms/FormField";
import { DateInput } from "@/components/forms/DateInput";
import { useMentorAccess } from "@/contexts/MentorAccessContext";
import { useInvalidateTodo } from "@/hooks/useTodo";

export type TaskRow = { id: string; title: string; notes: string | null; due_date: string | null; urgent: boolean };

interface TaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskRow | null;
}

/**
 * Add or edit a typed-in task. Colton adds to his own list; Scott (mentor view) adds to Colton's list and can
 * edit or delete only the tasks he added. Only Colton marks tasks done (enforced in the database).
 */
export function TaskDialog({ open, onOpenChange, task }: TaskDialogProps) {
  const invalidate = useInvalidateTodo();
  const { isViewingAsMentor, getEffectiveUserId } = useMentorAccess();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [due, setDue] = useState("");
  const [urgent, setUrgent] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title || "");
    setNotes(task?.notes || "");
    setDue(task?.due_date || "");
    setUrgent(task?.urgent || false);
  }, [open, task]);

  const save = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("What needs doing?");
      const row = { title: title.trim(), notes: notes.trim() || null, due_date: due || null, urgent };
      if (task) {
        const { data, error } = await supabase.from("tasks").update(row).eq("id", task.id).select("id");
        if (error) throw error;
        if (!data?.length) throw new Error("You can only change tasks you added");
        return;
      }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");
      const owner = await getEffectiveUserId();
      const { error } = await supabase.from("tasks").insert({ ...row, user_id: owner, created_by: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: task ? "Task updated" : "Task added" });
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Could not save the task", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!task) return;
      const { data, error } = await supabase.from("tasks").delete().eq("id", task.id).select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("You can only delete tasks you added");
    },
    onSuccess: () => {
      toast({ title: "Task deleted" });
      invalidate();
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Could not delete the task", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : isViewingAsMentor ? "Add a task for Colton" : "Add a task"}</DialogTitle>
          <DialogDescription>It shows on the To Do list until it's marked done.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <FormField label="Task" htmlFor="task-title" required>
            <Input id="task-title" className="min-h-[44px]" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Order the package-insert cards" />
          </FormField>
          <FormField label="Details" htmlFor="task-notes">
            <Textarea id="task-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
          <FormField label="Due" htmlFor="task-due" helperText="Leave empty for no date">
            <DateInput id="task-due" value={due} onChange={(e) => setDue(e.target.value)} />
          </FormField>
          <div className="flex items-center justify-between gap-4 rounded-md border border-input p-3 min-h-[44px]">
            <Label htmlFor="task-urgent" className="cursor-pointer">
              Urgent: email right away
            </Label>
            <Switch id="task-urgent" checked={urgent} onCheckedChange={setUrgent} />
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <Button
              className="min-h-[44px] bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              {task ? "SAVE TASK" : "ADD TASK"}
            </Button>
            {task && (
              <Button variant="outline" className="min-h-[44px] text-destructive" disabled={remove.isPending} onClick={() => remove.mutate()}>
                Delete task
              </Button>
            )}
            <Button variant="ghost" className="min-h-[44px]" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
