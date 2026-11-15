import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TodoList } from "@/components/todo/TodoList";
import { useTodo } from "@/hooks/useTodo";

/** Dashboard: the top 3 "Now" items, with a link to the full To Do list. Hidden when nothing needs doing now. */
export function TodoPreview() {
  const navigate = useNavigate();
  const { data: items = [] } = useTodo();
  const now = items.filter((i) => i.tier === "now");
  if (now.length === 0) return null;
  const more = items.length - Math.min(3, now.length);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground uppercase tracking-wide">To Do</h2>
        <Button variant="ghost" className="min-h-[44px] text-accent" onClick={() => navigate("/todo")}>
          {more > 0 ? `See all (${more} more)` : "See all"}
        </Button>
      </div>
      <TodoList items={now.slice(0, 3)} />
    </div>
  );
}
