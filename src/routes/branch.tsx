import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, ShoppingCart, Receipt, Package, Truck, Users, UserCircle, Wallet, FileBarChart, UserCog, Settings } from "lucide-react";
import { Shell } from "@/components/layouts/Shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/branch")({ component: BranchLayout });

function BranchLayout() {
  const { loading, user, isAdmin, role } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (isAdmin) navigate({ to: "/admin/dashboard" });
  }, [loading, user, isAdmin, navigate]);
  if (loading || !user || isAdmin) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>;
  const isManager = role === "manager";
  const isCashier = role === "cashier";
  const isStock = role === "stock_keeper";
  const nav = [
    { to: "/branch/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    ...(!isStock ? [{ to: "/branch/pos", label: "POS / Billing", icon: <ShoppingCart className="h-4 w-4" /> }] : []),
    ...(!isStock ? [{ to: "/branch/sales", label: "Sales History", icon: <Receipt className="h-4 w-4" /> }] : []),
    { to: "/branch/inventory", label: "Inventory", icon: <Package className="h-4 w-4" /> },
    ...(!isCashier ? [{ to: "/branch/purchases", label: "Purchases", icon: <Truck className="h-4 w-4" /> }] : []),
    ...(!isCashier ? [{ to: "/branch/suppliers", label: "Suppliers", icon: <Users className="h-4 w-4" /> }] : []),
    { to: "/branch/customers", label: "Customers", icon: <UserCircle className="h-4 w-4" /> },
    ...(isManager ? [{ to: "/branch/expenses", label: "Expenses", icon: <Wallet className="h-4 w-4" /> }] : []),
    ...(isManager ? [{ to: "/branch/reports", label: "Reports", icon: <FileBarChart className="h-4 w-4" /> }] : []),
    ...(isManager ? [{ to: "/branch/staff", label: "Staff", icon: <UserCog className="h-4 w-4" /> }] : []),
    { to: "/branch/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];
  return <Shell title="NIkoBazar Branch" nav={nav}><Outlet /></Shell>;
}