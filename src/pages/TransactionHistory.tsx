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

type TransactionType = "show_card_sale" | "bulk_sale" | "disposition" | "deposit" | "withdrawal" | "adjustment";
type FilterCategory = "all" | "sales" | "cash";
type SortOption = "date-desc" | "date-asc" | "amount-desc" | "amount-asc";

interface BaseTransaction {
  id: string;
  transaction_type: TransactionType;
  notes: string | null;
  created_at: string;
  source: "sales" | "cash";
}

interface SalesTransaction extends BaseTransaction {
  source: "sales";
  revenue: number;
  quantity: number | null;
  show_id: string | null;
  lot_id: string | null;
  show_card_id: string | null;
  transaction_date?: string;
  shows?: { name: string } | null;
  lots?: { source: string } | null;
  show_cards?: { player_name: string; year: string | null } | null;
}

interface CashTransaction extends BaseTransaction {
  source: "cash";
  amount: number;
}

type Transaction = SalesTransaction | CashTransaction;

export default function TransactionHistory() {
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [sortOption, setSortOption] = useState<SortOption>("date-desc");
  const [searchTerm, setSearchTerm] = useState("");

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["all-transactions"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Fetch sales transactions
      const { data: salesData, error: salesError } = await supabase
        .from("transactions")
        .select(`
          *,
          shows(name),
          lots(source),
          show_cards(player_name, year)
        `)
        .eq("user_id", user.id)
        .order("transaction_date", { ascending: false });

      if (salesError) throw salesError;

      // Fetch manual cash transactions (exclude auto-generated ones)
      const { data: cashData, error: cashError } = await supabase
        .from("cash_transactions")
        .select("*")
        .eq("user_id", user.id)
        .in("transaction_type", ["deposit", "withdrawal", "adjustment"])
        .order("created_at", { ascending: false });

      if (cashError) throw cashError;

      // Merge and sort by date
      const allTransactions: Transaction[] = [
        ...(salesData || []).map(t => ({ 
          ...t, 
          source: "sales" as const,
          transaction_type: t.transaction_type as TransactionType
        })),
        ...(cashData || []).map(t => ({ 
          ...t, 
          source: "cash" as const,
          transaction_type: t.transaction_type as TransactionType
        }))
      ].sort((a, b) => {
        const aDate = a.source === "sales" ? ((a as SalesTransaction).transaction_date || a.created_at) : a.created_at;
        const bDate = b.source === "sales" ? ((b as SalesTransaction).transaction_date || b.created_at) : b.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      });

      return allTransactions;
    },
  });

  const filteredTransactions = transactions.filter((tx) => {
    // Filter by category
    if (filterCategory === "sales") {
      if (tx.source !== "sales") return false;
    } else if (filterCategory === "cash") {
      if (tx.source !== "cash") return false;
    }

    // Search filtering
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesNotes = tx.notes?.toLowerCase().includes(searchLower);
      
      if (tx.source === "sales") {
        const salesTx = tx as SalesTransaction;
        const matchesLot = salesTx.lots?.source?.toLowerCase().includes(searchLower);
        const matchesShow = salesTx.shows?.name?.toLowerCase().includes(searchLower);
        const matchesCard = salesTx.show_cards?.player_name?.toLowerCase().includes(searchLower);
        const matchesAmount = salesTx.revenue.toString().includes(searchLower);
        
        if (!matchesNotes && !matchesLot && !matchesShow && !matchesCard && !matchesAmount) {
          return false;
        }
      } else {
        const cashTx = tx as CashTransaction;
        const matchesAmount = Math.abs(cashTx.amount).toString().includes(searchLower);
        
        if (!matchesNotes && !matchesAmount) {
          return false;
        }
      }
    }

    return true;
  });

  const sortedTransactions = [...filteredTransactions].sort((a, b) => {
    switch (sortOption) {
      case "date-desc": {
        const aDate = a.source === "sales" ? ((a as SalesTransaction).transaction_date || a.created_at) : a.created_at;
        const bDate = b.source === "sales" ? ((b as SalesTransaction).transaction_date || b.created_at) : b.created_at;
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      }
      case "date-asc": {
        const aDate = a.source === "sales" ? ((a as SalesTransaction).transaction_date || a.created_at) : a.created_at;
        const bDate = b.source === "sales" ? ((b as SalesTransaction).transaction_date || b.created_at) : b.created_at;
        return new Date(aDate).getTime() - new Date(bDate).getTime();
      }
      case "amount-desc": {
        const aAmount = a.source === "sales" ? (a as SalesTransaction).revenue : Math.abs((a as CashTransaction).amount);
        const bAmount = b.source === "sales" ? (b as SalesTransaction).revenue : Math.abs((b as CashTransaction).amount);
        return bAmount - aAmount;
      }
      case "amount-asc": {
        const aAmount = a.source === "sales" ? (a as SalesTransaction).revenue : Math.abs((a as CashTransaction).amount);
        const bAmount = b.source === "sales" ? (b as SalesTransaction).revenue : Math.abs((b as CashTransaction).amount);
        return aAmount - bAmount;
      }
      default:
        return 0;
    }
  });

  const totalRevenue = filteredTransactions
    .filter(tx => tx.source === "sales" && tx.transaction_type !== "disposition")
    .reduce((sum, tx) => sum + Number((tx as SalesTransaction).revenue), 0);

  const counts = {
    all: transactions.length,
    sales: transactions.filter(tx => tx.source === "sales").length,
    cash: transactions.filter(tx => tx.source === "cash").length,
    show_card_sale: transactions.filter(tx => tx.transaction_type === "show_card_sale").length,
    bulk_sale: transactions.filter(tx => tx.transaction_type === "bulk_sale").length,
  };

  const handleExport = () => {
    const headers = ["Date", "Type", "Source", "Lot", "Show", "Amount", "Quantity", "Notes"];
    const rows = sortedTransactions.map(tx => {
      if (tx.source === "sales") {
        const salesTx = tx as SalesTransaction;
        return [
          format(new Date(salesTx.transaction_date || tx.created_at), "yyyy-MM-dd HH:mm"),
          tx.transaction_type,
          "sales",
          tx.transaction_type === "show_card_sale" && salesTx.show_cards
            ? `${salesTx.show_cards.player_name} (${salesTx.show_cards.year || ""})`
            : salesTx.lots?.source || "-",
          salesTx.shows?.name || "-",
          salesTx.revenue.toFixed(2),
          salesTx.quantity || "-",
          tx.notes || "-"
        ];
      } else {
        const cashTx = tx as CashTransaction;
        return [
          format(new Date(tx.created_at), "yyyy-MM-dd HH:mm"),
          tx.transaction_type,
          "cash",
          "-",
          "-",
          cashTx.amount.toFixed(2),
          "-",
          tx.notes || "-"
        ];
      }
    });

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

  const getTypeBadge = (type: TransactionType) => {
    switch (type) {
      case "show_card_sale":
        return { label: "Premium Sale", className: "bg-[hsl(var(--navy-base))] text-white" };
      case "bulk_sale":
        return { label: "Bulk Sale", className: "bg-green-600 text-white" };
      case "disposition":
        return { label: "Disposition", className: "bg-gray-500 text-white" };
      case "deposit":
        return { label: "Deposit", className: "bg-green-600 text-white" };
      case "withdrawal":
        return { label: "Withdrawal", className: "bg-red-600 text-white" };
      case "adjustment":
        return { label: "Adjustment", className: "bg-yellow-600 text-white" };
      default:
        return { label: type, className: "bg-gray-500 text-white" };
    }
  };

  const getAmountDisplay = (tx: Transaction) => {
    if (tx.source === "sales") {
      const salesTx = tx as SalesTransaction;
      const isDisposition = tx.transaction_type === "disposition";
      return (
        <span className={isDisposition ? "text-gray-500" : "text-green-600 font-semibold"}>
          {isDisposition ? "" : "+"}${salesTx.revenue.toFixed(2)}
        </span>
      );
    } else {
      const cashTx = tx as CashTransaction;
      const isPositive = cashTx.amount >= 0;
      return (
        <span className={isPositive ? "text-green-600 font-semibold" : "text-red-600 font-semibold"}>
          {isPositive ? "+" : ""}${Math.abs(cashTx.amount).toFixed(2)}
        </span>
      );
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
                Complete audit trail of all financial transactions
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

            <Select value={filterCategory} onValueChange={(value) => setFilterCategory(value as FilterCategory)}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Transactions ({counts.all})</SelectItem>
                <SelectItem value="sales">Sales Only ({counts.sales})</SelectItem>
                <SelectItem value="cash">Cash Only ({counts.cash})</SelectItem>
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
              Transactions will appear here as you record sales, cash movements, and dispositions
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
                    <TableHead>Description</TableHead>
                    <TableHead>Show</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedTransactions.map((tx) => {
                    const badge = getTypeBadge(tx.transaction_type);
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-500" />
                            <span className="text-gray-900 font-medium">
                              {format(new Date(tx.source === "sales" ? ((tx as SalesTransaction).transaction_date || tx.created_at) : tx.created_at), "MM/dd/yy")}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500">
                            {format(new Date(tx.source === "sales" ? ((tx as SalesTransaction).transaction_date || tx.created_at) : tx.created_at), "h:mm a")}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={badge.className}>
                            {badge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-gray-900">
                          {tx.source === "sales" ? (
                            tx.transaction_type === "show_card_sale" && (tx as SalesTransaction).show_cards
                              ? `${(tx as SalesTransaction).show_cards!.player_name} (${(tx as SalesTransaction).show_cards!.year || ""})`
                              : (tx as SalesTransaction).lots?.source || "-"
                          ) : (
                            tx.notes || "Manual cash entry"
                          )}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate text-gray-900">
                          {tx.source === "sales" ? (
                            (tx as SalesTransaction).shows?.name || "-"
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <DollarSign className="h-4 w-4 text-gray-500" />
                            {getAmountDisplay(tx)}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-gray-600 text-sm">
                          {tx.notes || "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
