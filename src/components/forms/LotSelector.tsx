import { useState, useMemo } from "react";
import { format } from "date-fns";
import { Search, ChevronRight, Package, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

interface Lot {
  id: string;
  source: string;
  purchase_date: string;
  total_cost: number;
  status: string;
}

interface LotSelectorProps {
  lots: Lot[];
  selectedLotId: string;
  onSelect: (lotId: string) => void;
  disabled?: boolean;
  error?: string;
  placeholder?: string;
}

export function LotSelector({
  lots,
  selectedLotId,
  onSelect,
  disabled,
  error,
  placeholder = "Select lot",
}: LotSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedLot = lots.find((l) => l.id === selectedLotId);

  const filteredLots = useMemo(() => {
    if (!search.trim()) return lots;
    const term = search.toLowerCase();
    return lots.filter((lot) => 
      lot.source.toLowerCase().includes(term)
    );
  }, [lots, search]);

  const handleSelect = (lotId: string) => {
    onSelect(lotId);
    setOpen(false);
    setSearch("");
  };

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={`w-full min-h-[44px] justify-between text-left font-normal ${
            error ? "border-red-500" : ""
          } ${!selectedLot ? "text-muted-foreground" : ""}`}
        >
          {selectedLot ? (
            <div className="flex flex-col items-start">
              <span className="font-medium truncate max-w-[250px]">
                {selectedLot.source}
              </span>
              <span className="text-xs text-muted-foreground">
                {format(new Date(selectedLot.purchase_date), "MMM d, yyyy")} · ${selectedLot.total_cost}
              </span>
            </div>
          ) : (
            <span>{placeholder}</span>
          )}
          <ChevronRight className="h-4 w-4 opacity-50" />
        </Button>
      </DrawerTrigger>
      
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="border-b pb-4">
          <DrawerTitle>Select Lot</DrawerTitle>
          <div className="relative mt-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by source..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 min-h-[44px]"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        </DrawerHeader>
        
        <div className="overflow-y-auto p-4 space-y-2">
          {filteredLots.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No lots found matching "{search}"
            </p>
          ) : (
            filteredLots.map((lot) => (
              <button
                key={lot.id}
                type="button"
                onClick={() => handleSelect(lot.id)}
                className={`w-full p-4 rounded-lg border text-left transition-colors min-h-[72px] ${
                  lot.id === selectedLotId
                    ? "border-[hsl(var(--navy-base))] bg-[hsl(var(--navy-base))]/5"
                    : "border-border hover:bg-accent"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Package className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{lot.source}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(lot.purchase_date), "MMM d, yyyy")} · ${lot.total_cost}
                      </p>
                    </div>
                  </div>
                  {lot.id === selectedLotId && (
                    <Check className="h-5 w-5 text-[hsl(var(--navy-base))]" />
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
