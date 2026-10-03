import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Wallet } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";
import { CollectDueDialog } from "@/components/CollectDueDialog";

export const Route = createFileRoute("/branch/customers")({ component: Customers });

function Customers() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [open,setOpen]=useState(false);
  const [collect, setCollect] = useState<any>(null);
  const { data, isLoading } = useQuery({ queryKey:["customers", branchId], enabled:!!branchId, queryFn: async ()=>(await supabase.from("customers").select("*").eq("branch_id", branchId).order("name")).data ?? [] });
  return (
    <>
      <PageHeader title="Customers" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Add Customer</Button></DialogTrigger>
          <CustDialog onDone={()=>{setOpen(false); qc.invalidateQueries({queryKey:["customers"]});}}/>
        </Dialog>
      }/>
      <DataTable rows={data ?? []} loading={isLoading} rowKey={(r)=>r.id} searchKeys={["name","phone","address"]}
        columns={[
          { key:"name", header:"Name" }, { key:"phone", header:"Phone" }, { key:"address", header:"Address" },
          { key:"due_amount", header:"Due", render:(r)=>fmtMoney(r.due_amount) },
          { key:"actions", header:"", sortable:false, render:(r)=> Number(r.due_amount) > 0 ? (
            <Button size="sm" variant="outline" onClick={(e)=>{e.stopPropagation(); setCollect(r);}}>
              <Wallet className="h-4 w-4 mr-1"/> Collect Due
            </Button>
          ) : null },
        ]}/>
      <CollectDueDialog customer={collect} branchId={branchId} onClose={()=>setCollect(null)} onDone={()=>{
        qc.invalidateQueries({queryKey:["customers"]});
      }}/>
    </>
  );
}
function CustDialog({onDone}:{onDone:()=>void}) {
  const { branchId } = useAuth();
  const [f,setF] = useState({name:"",phone:"",address:""});
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Add Customer</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={f.name} onChange={(e)=>setF({...f,name:e.target.value})}/></div>
        <div><Label>Phone</Label><Input value={f.phone} onChange={(e)=>setF({...f,phone:e.target.value})}/></div>
        <div><Label>Address</Label><Input value={f.address} onChange={(e)=>setF({...f,address:e.target.value})}/></div>
      </div>
      <DialogFooter><Button onClick={async()=>{
        const { error } = await supabase.from("customers").insert({...f, branch_id: branchId});
        if (error) return toast.error(error.message);
        toast.success("Customer added"); onDone();
      }}>Save</Button></DialogFooter>
    </DialogContent>
  );
}