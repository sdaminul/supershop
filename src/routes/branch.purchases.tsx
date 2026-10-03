import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Eye } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { PurchaseDetailsDialog } from "@/components/PurchaseDetailsDialog";

export const Route = createFileRoute("/branch/purchases")({ component: Purchases });

function Purchases() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [open,setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["purchases", branchId], enabled:!!branchId,
    queryFn: async () => (await supabase.from("purchases").select("*").eq("branch_id", branchId).order("created_at",{ascending:false})).data ?? [],
  });
  const { data: suppliers } = useQuery({
    queryKey: ["suppliers-map", branchId], enabled: !!branchId,
    queryFn: async () => (await supabase.from("suppliers").select("id,name").eq("branch_id", branchId)).data ?? [],
  });
  const supMap = new Map<string,string>((suppliers ?? []).map((s:any)=>[s.id, s.name]));
  return (
    <>
      <PageHeader title="Purchases" description="Stock purchases from suppliers" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>New Purchase</Button></DialogTrigger>
          <NewPurchaseDialog onDone={()=>{setOpen(false); qc.invalidateQueries({queryKey:["purchases"]}); qc.invalidateQueries({queryKey:["products"]});}}/>
        </Dialog>
      }/>
      <DataTable rows={data ?? []} loading={isLoading} rowKey={(r)=>r.id} searchKeys={["supplier_id"]}
        columns={[
          { key:"created_at", header:"Date", render:(r)=>fmtDate(r.created_at) },
          { key:"supplier", header:"Supplier", render:(r)=>supMap.get(r.supplier_id) ?? r.supplier_name ?? "-" },
          { key:"items", header:"Items", render:(r)=>Array.isArray(r.items)?r.items.length:0 },
          { key:"total_amount", header:"Total", render:(r)=>fmtMoney(r.total_amount) },
          { key:"paid_amount", header:"Paid", render:(r)=>fmtMoney(r.paid_amount) },
          { key:"due_amount", header:"Due", render:(r)=>fmtMoney(r.due_amount) },
          { key:"actions", header:"", sortable:false, render:(r)=>(
            <Button variant="ghost" size="icon" onClick={(e)=>{e.stopPropagation(); setSelected(r);}} aria-label="View purchase details">
              <Eye className="h-4 w-4"/>
            </Button>
          )},
        ]}/>
      <PurchaseDetailsDialog purchase={selected} supplierName={selected ? (supMap.get(selected.supplier_id) ?? selected.supplier_name) : undefined} onClose={()=>setSelected(null)} />
    </>
  );
}

function NewPurchaseDialog({onDone}:{onDone:()=>void}) {
  const { branchId } = useAuth();
  const [supplierId,setSupplierId] = useState("");
  const [items,setItems] = useState<any[]>([]);
  const [paid,setPaid] = useState(0);
  const [busy,setBusy] = useState(false);
  const { data: suppliers } = useQuery({ queryKey:["suppliers-lite2", branchId], enabled:!!branchId, queryFn: async () => (await supabase.from("suppliers").select("id,name").eq("branch_id", branchId)).data ?? [] });
  const { data: products } = useQuery({ queryKey:["products-lite", branchId], enabled:!!branchId, queryFn: async () => (await supabase.from("products").select("id,name,purchase_price").eq("branch_id", branchId)).data ?? [] });
  const total = items.reduce((s,i)=>s + i.qty*i.unitCost, 0);
  async function submit() {
    setBusy(true);
    try {
      const { error } = await supabase.rpc("complete_purchase", { _branch_id: branchId, _supplier_id: supplierId || null, _items: items, _total: total, _paid: paid });
      if (error) throw error;
      toast.success("Purchase recorded");
      onDone();
    } catch(e:any){toast.error(e.message);} finally{setBusy(false);}
  }
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>New Purchase</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Supplier</Label>
          <Select value={supplierId} onValueChange={setSupplierId}>
            <SelectTrigger><SelectValue placeholder="Select supplier"/></SelectTrigger>
            <SelectContent>{(suppliers??[]).map((s:any)=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="border rounded-md p-3 space-y-2">
          {items.map((it,idx)=>(
            <div key={idx} className="grid grid-cols-12 gap-2 items-center">
              <Select value={it.productId} onValueChange={(v)=>{ const p=(products??[]).find((x:any)=>x.id===v); setItems(items.map((x,i)=>i===idx?{...x,productId:v,name:p?.name,unitCost:Number(p?.purchase_price||0)}:x)); }}>
                <SelectTrigger className="col-span-6"><SelectValue placeholder="Product"/></SelectTrigger>
                <SelectContent>{(products??[]).map((p:any)=><SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input className="col-span-2" type="number" placeholder="Qty" value={it.qty} onChange={(e)=>setItems(items.map((x,i)=>i===idx?{...x,qty:Number(e.target.value)}:x))}/>
              <Input className="col-span-3" type="number" placeholder="Cost" value={it.unitCost} onChange={(e)=>setItems(items.map((x,i)=>i===idx?{...x,unitCost:Number(e.target.value)}:x))}/>
              <button className="col-span-1 text-destructive" onClick={()=>setItems(items.filter((_,i)=>i!==idx))}><Trash2 className="h-4 w-4"/></button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={()=>setItems([...items,{productId:"",qty:1,unitCost:0}])}><Plus className="h-4 w-4 mr-2"/>Add line</Button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Total</Label><Input readOnly value={total}/></div>
          <div><Label>Paid</Label><Input type="number" value={paid} onChange={(e)=>setPaid(Number(e.target.value)||0)}/></div>
        </div>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy||!items.length}>{busy?"Saving...":"Save"}</Button></DialogFooter>
    </DialogContent>
  );
}