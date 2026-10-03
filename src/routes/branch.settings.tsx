import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/branch/settings")({ component: BranchSettings });

function BranchSettings() {
  const { branchId, user } = useAuth();
  const { data: branch } = useQuery({ queryKey:["branch-info", branchId], enabled:!!branchId, queryFn: async ()=>(await supabase.from("branches").select("*").eq("id", branchId).maybeSingle()).data });
  const [pw,setPw] = useState(""); const [busy,setBusy]=useState(false);
  async function updatePassword() {
    if (!pw) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Password updated"); setPw(""); }
  }
  return (
    <>
      <PageHeader title="Settings" description="Your branch info and account" />
      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Branch Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Name">{branch?.name ?? "-"}</Row>
            <Row label="Code">{branch?.code ?? "-"}</Row>
            <Row label="Address">{branch?.address ?? "-"}</Row>
            <Row label="Phone">{branch?.phone ?? "-"}</Row>
            <Row label="Status">{branch?.status ?? "-"}</Row>
            <p className="text-xs text-muted-foreground pt-2">Branch info is managed by admin.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Change Password</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm text-muted-foreground">Signed in as {user?.email}</div>
            <div><Label>New Password</Label><Input type="password" value={pw} onChange={(e)=>setPw(e.target.value)}/></div>
            <Button onClick={updatePassword} disabled={busy || !pw}>{busy?"Saving...":"Update"}</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
function Row({label,children}:{label:string;children:React.ReactNode}){return <div className="flex justify-between border-b pb-1"><span className="text-muted-foreground">{label}</span><span className="font-medium">{children}</span></div>;}