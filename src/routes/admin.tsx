import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { LayoutDashboard, Building2, Users, Package, FileBarChart, ScrollText, Settings, UserCircle } from "lucide-react";
import { Shell } from "@/components/layouts/Shell";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const { loading, user, isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (!isAdmin) navigate({ to: "/branch/dashboard" });
  }, [loading, user, isAdmin, navigate]);
  if (loading || !user || !isAdmin) return <div className="min-h-screen grid place-items-center text-muted-foreground">Loading...</div>;
  const nav = [
    { to: "/admin/dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    { to: "/admin/branches", label: "Branches", icon: <Building2 className="h-4 w-4" /> },
    { to: "/admin/users", label: "Users & Staff", icon: <Users className="h-4 w-4" /> },
    { to: "/admin/products", label: "Products (Global)", icon: <Package className="h-4 w-4" /> },
    { to: "/admin/customers", label: "Customers", icon: <UserCircle className="h-4 w-4" /> },
    { to: "/admin/reports", label: "Reports", icon: <FileBarChart className="h-4 w-4" /> },
    { to: "/admin/audit-logs", label: "Audit Logs", icon: <ScrollText className="h-4 w-4" /> },
    { to: "/admin/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];
  return <Shell title="NIkoBazar Admin" nav={nav}><Outlet /></Shell>;
}