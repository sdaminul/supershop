import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Store } from "lucide-react";
import logoImage from "@/assets/images/logo.png";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in - NikoBazar" },
      { name: "description", content: "Sign in to your NikoBazar account to manage your branches, inventory, and sales." },
      { property: "og:title", content: "Sign in - NikoBazar" },
      { property: "og:description", content: "Sign in to your NikoBazar account." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { user, loading, isAdmin } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (loading || !user) return;
    navigate({ to: isAdmin ? "/admin/dashboard" : "/branch/dashboard" });
  }, [user, loading, isAdmin, navigate]);

  return (
    <div className="min-h-screen grid place-items-center bg-gradient-to-br from-primary/5 to-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src={logoImage} 
            alt="NikoBazar Logo" 
            className="h-8 mx-auto mb-3"
          />
          <p className="text-sm text-muted-foreground">Store/Shop/Showroom/Branch Management</p>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="branch">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="branch">Branch Login</TabsTrigger>
              <TabsTrigger value="admin">Owner Login</TabsTrigger>
            </TabsList>
            <TabsContent value="branch"><LoginForm hint="Branch manager or staff login" /></TabsContent>
            <TabsContent value="admin"><LoginForm hint="Super admin / owner login" /></TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

function LoginForm({ hint }: { hint: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back!");
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-muted-foreground text-center">{hint}</p>
      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
      </div>
      <div className="space-y-1.5">
        <Label>Password</Label>
        <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Signing in..." : "Sign in"}</Button>
      <p className="text-xs text-muted-foreground text-center">Forgot password? Contact owner.</p>
    </form>
  );
}