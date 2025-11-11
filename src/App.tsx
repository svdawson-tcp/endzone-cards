import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TransactionEntry from "./pages/TransactionEntry";
import CreateShowCard from "./pages/CreateShowCard";
import CreateShow from "./pages/CreateShow";
import CreateLot from "./pages/CreateLot";
import Shows from "./pages/Shows";
import Lots from "./pages/Lots";
import ShowCards from "./pages/ShowCards";
import NotFound from "./pages/NotFound";
import ProtectedRoute from "./components/ProtectedRoute";
import AuthenticatedLayout from "./components/Layout/AuthenticatedLayout";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<ProtectedRoute><AuthenticatedLayout><Dashboard /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/transactions/new" element={<ProtectedRoute><AuthenticatedLayout><TransactionEntry /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/show-cards/new" element={<ProtectedRoute><AuthenticatedLayout><CreateShowCard /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/show-cards" element={<ProtectedRoute><AuthenticatedLayout><ShowCards /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/shows/new" element={<ProtectedRoute><AuthenticatedLayout><CreateShow /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/shows" element={<ProtectedRoute><AuthenticatedLayout><Shows /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/lots" element={<ProtectedRoute><AuthenticatedLayout><Lots /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/lots/new" element={<ProtectedRoute><AuthenticatedLayout><CreateLot /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/shows/:id/edit" element={<ProtectedRoute><AuthenticatedLayout><CreateShow /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/lots/:id/edit" element={<ProtectedRoute><AuthenticatedLayout><CreateLot /></AuthenticatedLayout></ProtectedRoute>} />
          <Route path="/show-cards/:id/edit" element={<ProtectedRoute><AuthenticatedLayout><CreateShowCard /></AuthenticatedLayout></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
