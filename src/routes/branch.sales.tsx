import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Eye, Undo2, RotateCcw, Package } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { StatCard } from "@/components/StatCard";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";
import { ReturnDialog } from "@/components/ReturnDialog";

export const Route = createFileRoute("/branch/sales")({ component: BranchSales });

function BranchSales() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any>(null);
  const [returning, setReturning] = useState<any>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["branch-sales-list", branchId], enabled: !!branchId,
    queryFn: async () => (await supabase.from("sales").select("*").eq("branch_id", branchId).order("created_at",{ascending:false}).limit(500)).data ?? [],
  });
  const { data: returns } = useQuery({
    queryKey: ["branch-returns", branchId], enabled: !!branchId,
    queryFn: async () => (await supabase.from("sale_returns").select("*").eq("branch_id", branchId)).data ?? [],
  });
  const returnStats = useMemo(() => {
    const list = returns ?? [];
    const items = list.reduce((s: number, r: any) => s + ((Array.isArray(r.items) ? r.items : []).reduce((a: number, it: any) => a + Number(it?.qty ?? 0), 0)), 0);
    const refund = list.reduce((s: number, r: any) => s + Number(r.refund_amount || 0), 0);
    return { count: list.length, items, refund };
  }, [returns]);
  return (
    <>
      <PageHeader title="Sales History" description="All sales at your branch" />
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <StatCard title="Total Returns" value={returnStats.count} icon={<RotateCcw className="h-4 w-4"/>} />
        <StatCard title="Returned Products" value={returnStats.items} icon={<Package className="h-4 w-4"/>} />
        <StatCard title="Refund Amount" value={fmtMoney(returnStats.refund)} />
      </div>
      <DataTable rows={data ?? []} loading={isLoading} searchKeys={["invoice_no","payment_method"]} rowKey={(r)=>r.id}
        columns={[
          { key:"invoice_no", header:"Invoice" },
          { key:"created_at", header:"Date", render:(r)=>fmtDate(r.created_at) },
          { key:"items", header:"Items", render:(r)=>Array.isArray(r.items)?r.items.length:0 },
          { key:"total_amount", header:"Total", render:(r)=>fmtMoney(r.total_amount) },
          { key:"paid_amount", header:"Paid", render:(r)=>fmtMoney(r.paid_amount) },
          { key:"due_amount", header:"Due", render:(r)=><Badge variant={Number(r.due_amount)>0?"destructive":"secondary"}>{fmtMoney(r.due_amount)}</Badge> },
          { key:"payment_method", header:"Method", render:(r)=><span className="capitalize">{r.payment_method}</span> },
          { key:"actions", header:"", sortable:false, render:(r)=>(
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={(e)=>{e.stopPropagation(); setSelected(r);}} aria-label="View sale details">
                <Eye className="h-4 w-4"/>
              </Button>
              <Button variant="ghost" size="icon" onClick={(e)=>{e.stopPropagation(); setReturning(r);}} aria-label="Return products">
                <Undo2 className="h-4 w-4"/>
              </Button>
            </div>
          )},
        ]}/>
      <SaleDetailsDialog sale={selected} onClose={()=>setSelected(null)} />
      <ReturnDialog sale={returning} onClose={()=>setReturning(null)} onDone={()=>{
        qc.invalidateQueries({ queryKey: ["branch-returns"] });
        qc.invalidateQueries({ queryKey: ["branch-sales-list"] });
        qc.invalidateQueries({ queryKey: ["customers"] });
        qc.invalidateQueries({ queryKey: ["pos-products"] });
      }} />
    </>
  );
}