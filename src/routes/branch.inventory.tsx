import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/branch/inventory")({ component: BranchInventory });

function BranchInventory() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: products, isLoading } = useQuery({
    queryKey: ["products", branchId], enabled: !!branchId,
    queryFn: async () => (await supabase.from("products").select("*").eq("branch_id", branchId).order("created_at",{ascending:false})).data ?? [],
  });
  return (
    <>
      <PageHeader title="Inventory" description="Manage products and stock" actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-2"/>Add Product</Button></DialogTrigger>
          <NewProductDialog onDone={()=>{setOpen(false); qc.invalidateQueries({queryKey:["products"]});}}/>
        </Dialog>
      } />
      <DataTable rows={products ?? []} loading={isLoading} searchKeys={["product_code","name","sku","barcode"]} rowKey={(r)=>r.id}
        columns={[
          { key:"product_code", header:"Code", render:(r)=><span className="font-mono">{r.product_code}</span> },
          { key:"name", header:"Name", render:(r)=><span className="font-medium">{r.name}</span> },
          { key:"sku", header:"SKU" },
          { key:"unit", header:"Unit" },
          { key:"stock_qty", header:"Stock", render:(r)=>{
            const low = Number(r.stock_qty) <= Number(r.low_stock_threshold||0);
            return <Badge variant={low?"destructive":"secondary"}>{r.stock_qty}</Badge>;
          }},
          { key:"purchase_price", header:"Cost", render:(r)=>fmtMoney(r.purchase_price) },
          { key:"sell_price", header:"Sell", render:(r)=>fmtMoney(r.sell_price) },
          { key:"expiry_date", header:"Expiry" },
          { key:"status", header:"Status" },
        ]}/>
    </>
  );
}

function NewProductDialog({onDone}:{onDone:()=>void}) {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [f,setF] = useState<any>({ name:"", sku:"", barcode:"", unit:"pcs", purchase_price:0, sell_price:0, stock_qty:0, low_stock_threshold:0, expiry_date:"", supplier_id:"", category_id:"" });
  const [busy,setBusy] = useState(false);
  const { data: categories } = useQuery({ queryKey:["categories", branchId], enabled:!!branchId, queryFn: async () => (await supabase.from("categories").select("*").or(`branch_id.eq.${branchId},branch_id.is.null`)).data ?? [] });
  const { data: suppliers } = useQuery({ queryKey:["suppliers-lite", branchId], enabled:!!branchId, queryFn: async () => (await supabase.from("suppliers").select("id,name").eq("branch_id", branchId)).data ?? [] });
  async function addCategory() {
    const name = prompt("New category name?");
    if (!name) return;
    const { data, error } = await supabase.from("categories").insert({ name, branch_id: branchId }).select().single();
    if (error) return toast.error(error.message);
    // Update local list optimistically AND invalidate so dropdown shows the new option immediately.
    qc.setQueryData(["categories", branchId], (old: any[] | undefined) => [...(old ?? []), data]);
    await qc.invalidateQueries({ queryKey: ["categories", branchId] });
    setF((prev: any) => ({ ...prev, category_id: data.id }));
    toast.success("Category added");
  }
  async function submit() {
    setBusy(true);
    try {
      const payload: any = { ...f, branch_id: branchId };
      if (!payload.expiry_date) delete payload.expiry_date;
      if (!payload.supplier_id) delete payload.supplier_id;
      if (!payload.category_id) delete payload.category_id;
      const { error } = await supabase.from("products").insert(payload);
      if (error) throw error;
      toast.success("Product added");
      onDone();
    } catch (e:any) { toast.error(e.message); } finally { setBusy(false); }
  }
  return (
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
      <div className="grid grid-cols-2 gap-3">
        <F label="Name"><Input value={f.name} onChange={(e)=>setF({...f,name:e.target.value})}/></F>
        <F label="SKU"><Input value={f.sku} onChange={(e)=>setF({...f,sku:e.target.value})}/></F>
        <F label="Barcode"><Input value={f.barcode} onChange={(e)=>setF({...f,barcode:e.target.value})}/></F>
        <F label="Category">
          <div className="flex gap-2">
            <Select value={f.category_id} onValueChange={(v)=>setF({...f,category_id:v})}>
              <SelectTrigger><SelectValue placeholder="None"/></SelectTrigger>
              <SelectContent>{(categories??[]).map((c:any)=><SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Button variant="outline" size="icon" type="button" onClick={addCategory}><Plus className="h-4 w-4"/></Button>
          </div>
        </F>
        <F label="Unit">
          <Select value={f.unit} onValueChange={(v)=>setF({...f,unit:v})}>
            <SelectTrigger><SelectValue/></SelectTrigger>
            <SelectContent>{["pcs","kg","liter","box","pack","gram"].map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Supplier">
          <Select value={f.supplier_id} onValueChange={(v)=>setF({...f,supplier_id:v})}>
            <SelectTrigger><SelectValue placeholder="None"/></SelectTrigger>
            <SelectContent>{(suppliers??[]).map((s:any)=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
        </F>
        <F label="Purchase Price"><Input type="number" value={f.purchase_price} onChange={(e)=>setF({...f,purchase_price:Number(e.target.value)})}/></F>
        <F label="Sell Price"><Input type="number" value={f.sell_price} onChange={(e)=>setF({...f,sell_price:Number(e.target.value)})}/></F>
        <F label="Opening Stock"><Input type="number" value={f.stock_qty} onChange={(e)=>setF({...f,stock_qty:Number(e.target.value)})}/></F>
        <F label="Low Stock Alert"><Input type="number" value={f.low_stock_threshold} onChange={(e)=>setF({...f,low_stock_threshold:Number(e.target.value)})}/></F>
        <F label="Expiry Date"><Input type="date" value={f.expiry_date} onChange={(e)=>setF({...f,expiry_date:e.target.value})}/></F>
      </div>
      <DialogFooter><Button onClick={submit} disabled={busy||!f.name}>{busy?"Saving...":"Save"}</Button></DialogFooter>
    </DialogContent>
  );
}
function F({label,children}:{label:string;children:React.ReactNode}){return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;}