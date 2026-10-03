import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase, supabaseSignup, type Role } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

function AdminUsers() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: users, isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, { data: branches }] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("*"),
        supabase.from("branches").select("id,name"),
      ]);
      const brMap = new Map((branches ?? []).map((b: any) => [b.id, b.name]));
      return (profiles ?? []).map((p: any) => {
        const r = (roles ?? []).find((x: any) => x.user_id === p.id);
        return { ...p, role: r?.role ?? "-", branch: r?.branch_id ? brMap.get(r.branch_id) : "-" };
      });
    },
  });
  return (
    <>
      <PageHeader title="Users & Staff" description="All users across the system" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New User</Button></DialogTrigger>
          <NewUserDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["all-users"] }); }} />
        </Dialog>
      } />
      <DataTable rows={users ?? []} loading={isLoading} searchKeys={["name","username","email","role"]} rowKey={(r)=>r.id}
        columns={[
          { key: "name", header: "Name" },
          { key: "username", header: "Username" },
          { key: "email", header: "Email" },
          { key: "role", header: "Role", render:(r)=><Badge variant="secondary" className="capitalize">{String(r.role).replace("_"," ")}</Badge> },
          { key: "branch", header: "Branch" },
          { key: "status", header: "Status", render:(r)=><Badge variant={r.status==="active"?"default":"secondary"}>{r.status}</Badge> },
        ]}/>
    </>
  );
}

function NewUserDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", email: "", password: Math.random().toString(36).slice(2,10), role: "cashier" as Role, branchId: "" });
  const [busy, setBusy] = useState(false);
  const { data: branches } = useQuery({ queryKey:["branches-lite"], queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [] });
  async function submit() {
    setBusy(true);
    try {
      const { data, error } = await supabaseSignup.auth.signUp({ email: form.email, password: form.password, options: { data: { name: form.name, username: form.email.split("@")[0] } } });
      if (error) throw error;
      const uid = data.user?.id!;
      const { error: e2 } = await supabase.from("user_roles").insert({ user_id: uid, role: form.role, branch_id: form.role === "admin" ? null : form.branchId || null });
      if (e2) throw e2;
      toast.success(`User created. Password: ${form.password}`);
      onDone();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Create User</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <F label="Name"><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></F>
        <F label="Email"><Input type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})}/></F>
        <F label="Password"><Input value={form.password} onChange={(e)=>setForm({...form,password:e.target.value})}/></F>
        <F label="Role">
          <Select value={form.role} onValueChange={(v)=>setForm({...form,role:v as Role})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="manager">Branch Manager</SelectItem>
              <SelectItem value="cashier">Cashier</SelectItem>
              <SelectItem value="stock_keeper">Stock Keeper</SelectItem>
            </SelectContent>
          </Select>
        </F>
        {form.role !== "admin" && (
          <F label="Branch">
            <Select value={form.branchId} onValueChange={(v)=>setForm({...form,branchId:v})}>
              <SelectTrigger><SelectValue placeholder="Select branch"/></SelectTrigger>
              <SelectContent>{(branches ?? []).map((b:any)=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </F>
        )}
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy || !form.email}>{busy?"Creating...":"Create"}</Button></DialogFooter>
    </DialogContent>
  );
}
function F({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;}