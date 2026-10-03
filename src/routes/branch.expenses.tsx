import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { fmtMoney, fmtDate } from "@/lib/format";

export const Route = createFileRoute("/branch/expenses")({ component: Expenses });

function Expenses() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [open,setOpen]=useState(false);
  const { data, isLoading } = useQuery({ queryKey:["expenses", branchId], enabled:!!branchId, queryFn: async ()=>(await supabase.from("expenses").select("*").eq("branch_id", branchId).order("created_at",{ascending:false})).data ?? [] });
  return (
    <>
      <PageHeader title="Expenses" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Add Expense</Button></DialogTrigger>
          <ExDialog onDone={()=>{setOpen(false); qc.invalidateQueries({queryKey:["expenses"]});}}/>
        </Dialog>
      }/>
      <DataTable rows={data ?? []} loading={isLoading} rowKey={(r)=>r.id} searchKeys={["category","note"]}
        columns={[
          { key:"created_at", header:"Date", render:(r)=>fmtDate(r.created_at) },
          { key:"category", header:"Category", render:(r)=><span className="capitalize">{r.category}</span> },
          { key:"amount", header:"Amount", render:(r)=>fmtMoney(r.amount) },
          { key:"note", header:"Note" },
        ]}/>
    </>
  );
}
function ExDialog({onDone}:{onDone:()=>void}) {
  const { branchId } = useAuth();
  const [f,setF] = useState({category:"rent", amount:0, note:""});
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Category</Label>
          <Select value={f.category} onValueChange={(v)=>setF({...f,category:v})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{["rent","utility","salary","transport","supplies","misc"].map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Amount</Label><Input type="number" value={f.amount} onChange={(e)=>setF({...f,amount:Number(e.target.value)})}/></div>
        <div><Label>Note</Label><Input value={f.note} onChange={(e)=>setF({...f,note:e.target.value})}/></div>
      </div>
      <DialogFooter><Button onClick={async()=>{
        const { error } = await supabase.from("expenses").insert({...f, branch_id: branchId});
        if (error) return toast.error(error.message);
        toast.success("Expense recorded"); onDone();
      }}>Save</Button></DialogFooter>
    </DialogContent>
  );
}