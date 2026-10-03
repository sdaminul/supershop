import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, KeyRound } from "lucide-react";
import { supabase, supabaseSignup } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/branches/")({ component: AdminBranches });

function AdminBranches() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: branches, isLoading } = useQuery({
    queryKey: ["branches"],
    queryFn: async () => {
      const { data } = await supabase.from("branches").select("*").order("created_at", { ascending: false });
      return data ?? [];
    },
  });
  const { data: salesByBranch } = useQuery({
    queryKey: ["branch-sales-agg"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("branch_id,total_amount");
      const agg: Record<string, number> = {};
      (data ?? []).forEach((s: any) => { agg[s.branch_id] = (agg[s.branch_id] || 0) + Number(s.total_amount || 0); });
      return agg;
    },
  });
  const rows = (branches ?? []).map((b: any) => ({ ...b, total_sales: salesByBranch?.[b.id] ?? 0 }));

  const toggleStatus = useMutation({
    mutationFn: async (b: any) => {
      const { error } = await supabase.from("branches").update({ status: b.status === "active" ? "inactive" : "active" }).eq("id", b.id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["branches"] }); toast.success("Branch updated"); },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="Branches" description="Manage all branches and their managers" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New Branch</Button></DialogTrigger>
          <NewBranchDialog onDone={() => { setOpen(false); qc.invalidateQueries({ queryKey: ["branches"] }); }} />
        </Dialog>
      } />
      <DataTable
        rows={rows}
        loading={isLoading}
        searchKeys={["name", "code", "address", "phone"]}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate({ to: "/admin/branches/$id", params: { id: r.id } })}
        columns={[
          { key: "name", header: "Name", render: (r) => (
            <Link
              to="/admin/branches/$id"
              params={{ id: r.id }}
              className="font-medium text-primary hover:underline"
              onClick={(e)=>e.stopPropagation()}
            >{r.name}</Link>
          ) },
          { key: "code", header: "Code" },
          { key: "address", header: "Address" },
          { key: "phone", header: "Phone" },
          { key: "status", header: "Status", render: (r) => <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge> },
          { key: "total_sales", header: "Total Sales", render: (r) => `৳${Number(r.total_sales).toLocaleString()}` },
          { key: "actions", header: "", sortable: false, render: (r) => (
            <div className="flex items-center gap-2" onClick={(e)=>e.stopPropagation()}>
              <Switch checked={r.status === "active"} onCheckedChange={() => toggleStatus.mutate(r)} />
            </div>
          ) },
        ]}
      />
    </>
  );
}

function NewBranchDialog({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ name: "", code: "", address: "", phone: "", managerName: "", managerEmail: "", managerPassword: Math.random().toString(36).slice(2, 10) });
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    try {
      const { data: branch, error: e1 } = await supabase.from("branches").insert({
        name: form.name, code: form.code || form.name.slice(0, 3).toUpperCase(),
        address: form.address, phone: form.phone, status: "active",
      }).select().single();
      if (e1) throw e1;
      if (form.managerEmail) {
        const { data: signup, error: e2 } = await supabaseSignup.auth.signUp({
          email: form.managerEmail, password: form.managerPassword,
          options: { data: { name: form.managerName, username: form.managerEmail.split("@")[0] } },
        });
        if (e2) throw e2;
        const uid = signup.user?.id;
        if (uid) {
          await supabase.from("user_roles").insert({ user_id: uid, role: "manager", branch_id: branch.id });
        }
      }
      toast.success(`Branch created. Manager password: ${form.managerPassword}`);
      onDone();
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Create Branch</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Branch Name"><Input value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})}/></Field>
        <Field label="Branch Code"><Input value={form.code} onChange={(e)=>setForm({...form,code:e.target.value})} placeholder="AUTO"/></Field>
        <Field label="Address" className="col-span-2"><Input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})}/></Field>
        <Field label="Phone"><Input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})}/></Field>
        <Field label="Manager Name"><Input value={form.managerName} onChange={(e)=>setForm({...form,managerName:e.target.value})}/></Field>
        <Field label="Manager Email"><Input type="email" value={form.managerEmail} onChange={(e)=>setForm({...form,managerEmail:e.target.value})}/></Field>
        <Field label="Manager Password"><Input value={form.managerPassword} onChange={(e)=>setForm({...form,managerPassword:e.target.value})}/></Field>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy || !form.name}>{busy? "Creating..." : "Create"}</Button></DialogFooter>
    </DialogContent>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className ?? ""}`}><Label>{label}</Label>{children}</div>;
}