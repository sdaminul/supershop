import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase, supabaseSignup, type Role } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/branch/staff")({ component: Staff });

function Staff() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [open,setOpen]=useState(false);
  const { data: roles, isLoading } = useQuery({ queryKey:["staff", branchId], enabled:!!branchId, queryFn: async ()=>{
    const { data: rs } = await supabase.from("user_roles").select("*").eq("branch_id", branchId);
    const ids = (rs ?? []).map((r:any)=>r.user_id);
    if (!ids.length) return [];
    const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
    return (rs ?? []).map((r:any)=>({...r, ...((profs ?? []).find((p:any)=>p.id===r.user_id) ?? {})}));
  }});
  return (
    <>
      <PageHeader title="Staff" description="Cashiers and stock keepers at your branch" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New Staff</Button></DialogTrigger>
          <NewStaff onDone={()=>{setOpen(false); qc.invalidateQueries({queryKey:["staff"]});}}/>
        </Dialog>
      }/>
      <DataTable rows={roles ?? []} loading={isLoading} rowKey={(r)=>r.id} searchKeys={["name","email","role"]}
        columns={[
          { key:"name", header:"Name" }, { key:"email", header:"Email" },
          { key:"role", header:"Role", render:(r)=><Badge variant="secondary" className="capitalize">{String(r.role).replace("_"," ")}</Badge> },
          { key:"status", header:"Status", render:(r)=><Badge variant={r.status==="active"?"default":"secondary"}>{r.status ?? "-"}</Badge> },
        ]}/>
    </>
  );
}
function NewStaff({onDone}:{onDone:()=>void}) {
  const { branchId } = useAuth();
  const [f,setF] = useState({ name:"", email:"", password: Math.random().toString(36).slice(2,10), role: "cashier" as Role });
  const [busy,setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const { data, error } = await supabaseSignup.auth.signUp({ email: f.email, password: f.password, options: { data: { name: f.name, username: f.email.split("@")[0] } } });
      if (error) throw error;
      const uid = data.user?.id;
      if (uid) {
        const { error: e2 } = await supabase.from("user_roles").insert({ user_id: uid, role: f.role, branch_id: branchId });
        if (e2) throw e2;
      }
      toast.success(`Staff created. Password: ${f.password}`);
      onDone();
    } catch(e:any){toast.error(e.message);} finally{setBusy(false);}
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Staff</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={f.name} onChange={(e)=>setF({...f,name:e.target.value})}/></div>
        <div><Label>Email</Label><Input type="email" value={f.email} onChange={(e)=>setF({...f,email:e.target.value})}/></div>
        <div><Label>Password</Label><Input value={f.password} onChange={(e)=>setF({...f,password:e.target.value})}/></div>
        <div><Label>Role</Label>
          <Select value={f.role} onValueChange={(v)=>setF({...f,role:v as Role})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="cashier">Cashier</SelectItem>
              <SelectItem value="stock_keeper">Stock Keeper</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy || !f.email}>{busy?"Creating...":"Create"}</Button></DialogFooter>
    </DialogContent>
  );
}