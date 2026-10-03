import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DataTable } from "@/components/DataTable";
import { fmtMoney, fmtDate, downloadCSV } from "@/lib/format";
import { Download, Eye } from "lucide-react";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";

export const Route = createFileRoute("/admin/reports")({ component: AdminReports });

function AdminReports() {
  const [reportType, setReportType] = useState("sales");
  const [branchId, setBranchId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedSale, setSelectedSale] = useState<any>(null);

  const { data: branches } = useQuery({ queryKey:["branches-lite"], queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [] });

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["report", reportType, branchId, from, to],
    queryFn: async () => {
      const applyDate = (q: any) => {
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to + "T23:59:59");
        if (branchId !== "all") q = q.eq("branch_id", branchId);
        return q;
      };
      if (reportType === "sales") return applyDate(supabase.from("sales").select("*").order("created_at",{ascending:false})).then((r:any)=>r.data ?? []);
      if (reportType === "purchases") return applyDate(supabase.from("purchases").select("*")).then((r:any)=>r.data ?? []);
      if (reportType === "expenses") return applyDate(supabase.from("expenses").select("*")).then((r:any)=>r.data ?? []);
      if (reportType === "inventory") {
        let q = supabase.from("products").select("*");
        if (branchId !== "all") q = q.eq("branch_id", branchId);
        return (await q).data ?? [];
      }
      if (reportType === "due-customers") {
        let q = supabase.from("customers").select("*").gt("due_amount", 0);
        if (branchId !== "all") q = q.eq("branch_id", branchId);
        return (await q).data ?? [];
      }
      if (reportType === "due-suppliers") {
        let q = supabase.from("suppliers").select("*").gt("due_amount", 0);
        if (branchId !== "all") q = q.eq("branch_id", branchId);
        return (await q).data ?? [];
      }
      return [];
    },
  });

  const brMap = new Map((branches ?? []).map((b:any)=>[b.id, b.name]));
  const enriched = (rows ?? []).map((r:any) => ({ ...r, branch: brMap.get(r.branch_id) ?? "-" }));

  const columnsMap: Record<string, any[]> = {
    sales: [
      { key:"invoice_no", header:"Invoice" },
      { key:"branch", header:"Branch" },
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"total_amount", header:"Total", render:(r:any)=>fmtMoney(r.total_amount) },
      { key:"paid_amount", header:"Paid", render:(r:any)=>fmtMoney(r.paid_amount) },
      { key:"payment_method", header:"Method" },
      { key:"actions", header:"", sortable:false, render:(r:any)=>(
        <Button variant="ghost" size="icon" onClick={(e)=>{e.stopPropagation(); setSelectedSale(r);}} aria-label="View sale details">
          <Eye className="h-4 w-4"/>
        </Button>
      )},
    ],
    purchases: [
      { key:"branch", header:"Branch" },
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"total_amount", header:"Total", render:(r:any)=>fmtMoney(r.total_amount) },
      { key:"paid_amount", header:"Paid", render:(r:any)=>fmtMoney(r.paid_amount) },
      { key:"due_amount", header:"Due", render:(r:any)=>fmtMoney(r.due_amount) },
    ],
    expenses: [
      { key:"branch", header:"Branch" },
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"category", header:"Category" },
      { key:"amount", header:"Amount", render:(r:any)=>fmtMoney(r.amount) },
      { key:"note", header:"Note" },
    ],
    inventory: [
      { key:"branch", header:"Branch" },
      { key:"product_code", header:"Code" },
      { key:"name", header:"Name" },
      { key:"stock_qty", header:"Stock" },
      { key:"purchase_price", header:"Cost", render:(r:any)=>fmtMoney(r.purchase_price) },
      { key:"sell_price", header:"Sell", render:(r:any)=>fmtMoney(r.sell_price) },
      { key:"value", header:"Stock Value", accessor:(r:any)=>Number(r.stock_qty)*Number(r.purchase_price), render:(r:any)=>fmtMoney(Number(r.stock_qty)*Number(r.purchase_price)) },
    ],
    "due-customers": [
      { key:"branch", header:"Branch" }, { key:"name", header:"Customer" }, { key:"phone", header:"Phone" },
      { key:"due_amount", header:"Due", render:(r:any)=>fmtMoney(r.due_amount) },
    ],
    "due-suppliers": [
      { key:"branch", header:"Branch" }, { key:"name", header:"Supplier" }, { key:"phone", header:"Phone" },
      { key:"due_amount", header:"Due", render:(r:any)=>fmtMoney(r.due_amount) },
    ],
  };

  return (
    <>
      <PageHeader title="Reports" description="Sales, revenue, inventory, dues, and more" />
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-5 gap-3">
          <div><Label>Report</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="purchases">Purchases</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
                <SelectItem value="inventory">Inventory Valuation</SelectItem>
                <SelectItem value="due-customers">Customer Dues</SelectItem>
                <SelectItem value="due-suppliers">Supplier Dues</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Branch</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All branches</SelectItem>
                {(branches ?? []).map((b:any)=><SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div><Label>From</Label><Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></div>
          <div className="flex items-end gap-2">
            <Button onClick={()=>refetch()}>Run</Button>
            <Button variant="outline" onClick={()=>downloadCSV(`${reportType}-report.csv`, enriched)}><Download className="h-4 w-4 mr-2"/>CSV</Button>
          </div>
        </CardContent>
      </Card>
      <DataTable rows={enriched} loading={isLoading} columns={columnsMap[reportType]} searchKeys={["branch","invoice_no","name","category","product_code"]} rowKey={(r:any)=>String(r.id ?? `${r.branch_id ?? ""}-${r.created_at ?? Math.random()}`)}/>
      <SaleDetailsDialog sale={selectedSale} onClose={()=>setSelectedSale(null)} />
    </>
  );
}