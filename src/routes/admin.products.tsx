import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/admin/products")({ component: GlobalProducts });

function GlobalProducts() {
  const [branchFilter, setBranchFilter] = useState("all");
  const { data: branches } = useQuery({ queryKey: ["branches-lite"], queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [] });
  const { data: products, isLoading } = useQuery({
    queryKey: ["all-products", branchFilter],
    queryFn: async () => {
      let q = supabase.from("products").select("*");
      if (branchFilter !== "all") q = q.eq("branch_id", branchFilter);
      return (await q.order("created_at",{ascending:false})).data ?? [];
    },
  });
  const brMap = new Map((branches ?? []).map((b:any)=>[b.id,b.name]));
  const rows = (products ?? []).map((p:any)=>({...p, branch: brMap.get(p.branch_id) ?? "-"}));
  return (
    <>
      <PageHeader title="Global Products" description="Products across all branches" />
      <DataTable rows={rows} loading={isLoading} searchKeys={["product_code","name","sku","barcode"]} rowKey={(r)=>r.id}
        toolbar={
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="w-48 h-9"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All branches</SelectItem>
              {(branches ?? []).map((b:any)=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        }
        columns={[
          { key:"branch", header:"Branch" },
          { key:"product_code", header:"Code" },
          { key:"name", header:"Name" },
          { key:"sku", header:"SKU" },
          { key:"stock_qty", header:"Stock" },
          { key:"purchase_price", header:"Purchase", render:(r)=>fmtMoney(r.purchase_price) },
          { key:"sell_price", header:"Sell", render:(r)=>fmtMoney(r.sell_price) },
          { key:"status", header:"Status" },
        ]}/>
    </>
  );
}