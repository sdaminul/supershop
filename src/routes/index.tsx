import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { loading, user, isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/login" });
    else if (isAdmin) navigate({ to: "/admin/dashboard" });
    else navigate({ to: "/branch/dashboard" });
  }, [loading, user, isAdmin, navigate]);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-muted-foreground">
      Loading...
    </div>
  );
}
