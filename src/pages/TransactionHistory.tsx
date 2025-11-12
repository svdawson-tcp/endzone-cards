import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { 
  Receipt, 
  Download,
  Filter,
  Search,
  Calendar,
  DollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TransactionType = "show_card_sale" | "bulk_sale" | "disposition";
type FilterType = "all" | TransactionType;
type SortOption = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

interface Transaction {
  id: string;
  transaction_type: TransactionType;
  revenue: number;
  quantity: number | null;
  notes: string | null;
  created_at: string;
  show_id: string | null;
  lot_id: string | null;
  show_card_id: string | null;
  shows?: { name: string } | null;
  lots?: { source: string } | null;
}

export default function TransactionHistory() {
  const [filterType, setFilterType] = useState<FilterType>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["all-transactions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("transactions")
        .select(`
          *,
          shows(name),
          lots(source)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as Transaction[];
    },
  });

  const filteredTransactions = transactions.filter((tx) => {
    if (filterType !== "all" && tx.transaction_type !== filterType) {
      return false;
    }

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesNotes = tx.notes?.toLowerCase().includes(searchLower);
      const matchesLot = tx.lots?.source?.toLowerCase().includes(searchLower);
      const matchesShow = tx.shows?.name?.toLowerCase().includes(searchLower);
      const matchesAmount = tx.revenue.toString().includes(searchLower);
      
      if (!matchesNotes && !matchesLot && !matchesShow && !matchesAmount) {
        return false;
      }
    }

    return true;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    switch (sortOption) {
      case "date-desc":
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      case "date-asc":
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case "amount-desc":
        return Number(b.revenue) - Number(a.revenue);
      case "amount-asc":
        return Number(a.revenue) - Number(b.revenue);
      default:
        return 0;
    }
  });

  const totalRevenue = filteredTransactions
    .filter(tx => tx.transaction_type !== "disposition")
    .reduce((sum, tx) => sum + Number(tx.revenue), 0);

  const counts = {
    all: transactions.length,
    show_card_sale: transactions.filter(tx => tx.transaction_type === "show_card_sale").length,
    bulk_sale: transactions.filter(tx => tx.transaction_type === "bulk_sale").length,
    disposition: transactions.filter(tx => tx.transaction_type === "disposition").length,
  };

  const handleExport = () => {
    const headers = ["Date", "Type", "Lot", "Show", "Amount", "Quantity", "Notes"];
    const rows = sortedTransactions.map(tx => [
      format(new Date(tx.created_at), "yyyy-MM-dd HH:mm"),
      tx.transaction_type,
      tx.lots?.source || "-",
      tx.shows?.name || "-",
      tx.revenue.toFixed(2),
      tx.quantity || "-",
      tx.notes || "-"
    ]);

    const csv = [
      headers.join(","),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `transactions-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
  };

  const getTypeBadgeVariant = (type: TransactionType) => {
    switch (type) {
      case "show_card_sale":
        return "default" as const;
      case "bulk_sale":
        return "secondary" as const;
      case "disposition":
        return "outline" as const;
      default:
        return "secondary" as const;
    }
  };

  const getTypeLabel = (type: TransactionType) => {
    switch (type) {
      case "show_card_sale":
        return "Premium Sale";
      case "bulk_sale":
        return "Bulk Sale";
      case "disposition":
        return "Disposition";
      default:
        return type;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
            <div>
              {/* Page Title - Uses page-title class for white text on dark background */}
              <h1 className="page-title mb-2">TRANSACTION HISTORY</h1>
              <p className="text-gray-600">
                Complete audit trail of all sales and dispositions
              </p>
            </div>
            <Button
              onClick={handleExport}
              variant="outline"
              disabled={sortedTransactions.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export CSV
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Transactions</div>
              <div className="text-2xl font-bold text-gray-900">{filteredTransactions.length}</div>
            </div>
            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Total Revenue</div>
              <div className="text-2xl font-bold text-green-600">
                ${totalRevenue.toFixed(2)}
              </div>
            </div>
            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Premium Sales</div>
              <div className="text-2xl font-bold text-gray-900">{counts.show_card_sale}</div>
            </div>
            <div className="bg-white shadow-md rounded-lg p-4">
              <div className="text-sm text-gray-600 mb-1">Bulk Sales</div>
              <div className="text-2xl font-bold text-gray-900">{counts.bulk_sale}</div>
            </div>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
              <Input
                placeholder="Search transactions..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <Select value={filterType} onValueChange={(value) => setFilterType(value as FilterType)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types ({counts.all})</SelectItem>
                <SelectItem value="show_card_sale">Premium ({counts.show_card_sale})</SelectItem>
                <SelectItem value="bulk_sale">Bulk ({counts.bulk_sale})</SelectItem>
                <SelectItem value="disposition">Dispositions ({counts.disposition})</SelectItem>
              </SelectContent>
            </Select>

            <Select value={sortOption} onValueChange={(value) => setSortOption(value as SortOption)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date-desc">Date (Newest First)</SelectItem>
                <SelectItem value="date-asc">Date (Oldest First)</SelectItem>
                <SelectItem value="amount-desc">Amount (High to Low)</SelectItem>
                <SelectItem value="amount-asc">Amount (Low to High)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-600">Loading transactions...</p>
          </div>
        )}

        {!isLoading && transactions.length === 0 && (
          <div className="bg-white shadow-md rounded-lg p-12 text-center">
            <Receipt className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No transactions yet</h2>
            <p className="text-gray-600">
              Transactions will appear here as you record sales and dispositions
            </p>
          </div>
        )}

        {!isLoading && transactions.length > 0 && sortedTransactions.length === 0 && (
          <div className="bg-white shadow-md rounded-lg p-12 text-center">
            <Receipt className="h-16 w-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No matching transactions</h2>
            <p className="text-gray-600">Try adjusting your filters or search term</p>
          </div>
        )}

        {!isLoading && sortedTransactions.length > 0 && (
          <div className="bg-white shadow-md rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead>Show</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions.map((tx) => (
                    <TableRow key={tx.id}>
                       <TableCell className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-500" />
                          <span className="text-gray-900 font-medium">{format(new Date(tx.created_at), "MM/dd/yy")}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {format(new Date(tx.created_at), "h:mm a")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={getTypeBadgeVariant(tx.transaction_type)}>
                          {getTypeLabel(tx.transaction_type)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-gray-900">
                        {tx.lots?.source || "-"}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate text-gray-900">
                        {tx.shows?.name || "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <DollarSign className="h-4 w-4 text-gray-500" />
                          <span className={tx.transaction_type === "disposition" 
                            ? "text-gray-500" 
                            : "text-green-600 font-semibold"
                          }>
                            {Number(tx.revenue).toFixed(2)}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-gray-600">
                        {tx.quantity || "-"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-gray-600 text-sm">
                        {tx.notes || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
