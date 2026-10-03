import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtMoney, fmtDate, downloadCSV } from "@/lib/format";

export const Route = createFileRoute("/branch/reports")({ component: BranchReports });

function BranchReports() {
  const { branchId } = useAuth();
  const [type, setType] = useState("sales");
  const [from,setFrom] = useState(""); const [to,setTo] = useState("");
  const { data: rows, isLoading, refetch } = useQuery({
    queryKey:["branch-report", branchId, type, from, to], enabled:!!branchId,
    queryFn: async () => {
      const apply = (q:any) => {
        q = q.eq("branch_id", branchId);
        if (from) q = q.gte("created_at", from);
        if (to) q = q.lte("created_at", to + "T23:59:59");
        return q;
      };
      if (type==="sales") return (await apply(supabase.from("sales").select("*")).order("created_at",{ascending:false})).data ?? [];
      if (type==="purchases") return (await apply(supabase.from("purchases").select("*"))).data ?? [];
      if (type==="expenses") return (await apply(supabase.from("expenses").select("*"))).data ?? [];
      if (type==="inventory") return (await supabase.from("products").select("*").eq("branch_id",branchId)).data ?? [];
      if (type==="due-customers") return (await supabase.from("customers").select("*").eq("branch_id",branchId).gt("due_amount",0)).data ?? [];
      if (type==="due-suppliers") return (await supabase.from("suppliers").select("*").eq("branch_id",branchId).gt("due_amount",0)).data ?? [];
      if (type==="due-collections") return (await apply(supabase.from("customer_payments").select("*, customers(name,phone)")).order("created_at",{ascending:false})).data ?? [];
      if (type==="returns") return (await apply(supabase.from("sale_returns").select("*, sales(invoice_no)")).order("created_at",{ascending:false})).data ?? [];
      if (type==="customer-ledger") {
        // Combined feed: sales, returns, and due collections — with a source column.
        const [s, r, c] = await Promise.all([
          apply(supabase.from("sales").select("id,invoice_no,created_at,total_amount,customer_id,customers(name)")),
          apply(supabase.from("sale_returns").select("id,created_at,refund_amount,sale_id,sales(invoice_no,customer_id,customers(name))")),
          apply(supabase.from("customer_payments").select("id,created_at,amount,method,customer_id,customers(name)")),
        ]);
        const rows: any[] = [];
        (s.data ?? []).forEach((x: any) => rows.push({ id: `s-${x.id}`, created_at: x.created_at, source: "Sale", ref: x.invoice_no, customer: x.customers?.name ?? "Walk-in", amount: x.total_amount, method: "" }));
        (r.data ?? []).forEach((x: any) => rows.push({ id: `r-${x.id}`, created_at: x.created_at, source: "Returned Product", ref: x.sales?.invoice_no ?? "-", customer: x.sales?.customers?.name ?? "-", amount: -Number(x.refund_amount || 0), method: "" }));
        (c.data ?? []).forEach((x: any) => rows.push({ id: `c-${x.id}`, created_at: x.created_at, source: "Due Collected", ref: "-", customer: x.customers?.name ?? "-", amount: x.amount, method: x.method }));
        rows.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
        return rows;
      }
      return [];
    },
  });
  const cols: Record<string,any[]> = {
    sales: [
      { key:"invoice_no", header:"Invoice" },
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"total_amount", header:"Total", render:(r:any)=>fmtMoney(r.total_amount) },
      { key:"paid_amount", header:"Paid", render:(r:any)=>fmtMoney(r.paid_amount) },
      { key:"payment_method", header:"Method" },
    ],
    purchases: [
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"total_amount", header:"Total", render:(r:any)=>fmtMoney(r.total_amount) },
      { key:"paid_amount", header:"Paid", render:(r:any)=>fmtMoney(r.paid_amount) },
      { key:"due_amount", header:"Due", render:(r:any)=>fmtMoney(r.due_amount) },
    ],
    expenses: [
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"category", header:"Category" },
      { key:"amount", header:"Amount", render:(r:any)=>fmtMoney(r.amount) },
      { key:"note", header:"Note" },
    ],
    inventory: [
      { key:"product_code", header:"Code" },
      { key:"name", header:"Name" },
      { key:"stock_qty", header:"Stock" },
      { key:"purchase_price", header:"Cost", render:(r:any)=>fmtMoney(r.purchase_price) },
      { key:"sell_price", header:"Sell", render:(r:any)=>fmtMoney(r.sell_price) },
    ],
    "due-customers": [{ key:"name", header:"Customer" }, { key:"phone", header:"Phone" }, { key:"due_amount", header:"Due", render:(r:any)=>fmtMoney(r.due_amount) }],
    "due-suppliers": [{ key:"name", header:"Supplier" }, { key:"phone", header:"Phone" }, { key:"due_amount", header:"Due", render:(r:any)=>fmtMoney(r.due_amount) }],
    "due-collections": [
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"customer", header:"Customer", render:(r:any)=>r.customers?.name ?? "-" },
      { key:"phone", header:"Phone", render:(r:any)=>r.customers?.phone ?? "-" },
      { key:"amount", header:"Amount", render:(r:any)=>fmtMoney(r.amount) },
      { key:"method", header:"Method" },
      { key:"note", header:"Note" },
    ],
    "returns": [
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"invoice", header:"Invoice", render:(r:any)=>r.sales?.invoice_no ?? "-" },
      { key:"items", header:"Items", render:(r:any)=>Array.isArray(r.items)?r.items.reduce((s:number,it:any)=>s+Number(it?.qty??0),0):0 },
      { key:"refund_amount", header:"Refund", render:(r:any)=>fmtMoney(r.refund_amount) },
      { key:"reason", header:"Reason" },
    ],
    "customer-ledger": [
      { key:"created_at", header:"Date", render:(r:any)=>fmtDate(r.created_at) },
      { key:"source", header:"Type", render:(r:any)=><span className="font-medium">{r.source}</span> },
      { key:"ref", header:"Invoice / Ref" },
      { key:"customer", header:"Customer" },
      { key:"method", header:"Method" },
      { key:"amount", header:"Amount", render:(r:any)=><span className={Number(r.amount)<0?"text-destructive":""}>{fmtMoney(r.amount)}</span> },
    ],
  };
  return (
    <>
      <PageHeader title="Reports" description="Branch-scoped reports and exports" />
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Filters</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-3">
          <div><Label>Report</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="sales">Sales</SelectItem>
                <SelectItem value="purchases">Purchases</SelectItem>
                <SelectItem value="expenses">Expenses</SelectItem>
                <SelectItem value="inventory">Inventory</SelectItem>
                <SelectItem value="due-customers">Customer Dues</SelectItem>
                <SelectItem value="due-suppliers">Supplier Dues</SelectItem>
                <SelectItem value="due-collections">Due Collections</SelectItem>
                <SelectItem value="returns">Product Returns</SelectItem>
                <SelectItem value="customer-ledger">Customer Ledger (Sales / Returns / Collections)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>From</Label><Input type="date" value={from} onChange={(e)=>setFrom(e.target.value)}/></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e)=>setTo(e.target.value)}/></div>
          <div className="flex items-end gap-2">
            <Button onClick={()=>refetch()}>Run</Button>
            <Button variant="outline" onClick={()=>downloadCSV(`${type}.csv`, rows ?? [])}><Download className="h-4 w-4 mr-2"/>CSV</Button>
          </div>
        </CardContent>
      </Card>
      <DataTable rows={rows ?? []} loading={isLoading} columns={cols[type]} rowKey={(r:any)=>String(r.id ?? Math.random())}/>
    </>
  );
}