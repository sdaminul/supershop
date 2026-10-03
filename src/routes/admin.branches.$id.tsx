import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye } from "lucide-react";
import { SaleDetailsDialog } from "@/components/SaleDetailsDialog";
import { PurchaseDetailsDialog } from "@/components/PurchaseDetailsDialog";

export const Route = createFileRoute("/admin/branches/$id")({ component: BranchDetail });

function BranchDetail() {
  const { id } = Route.useParams();
  const [selectedSale, setSelectedSale] = useState<any>(null);
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null);
  const { data: branch } = useQuery({
    queryKey: ["branch", id],
    queryFn: async () => (await supabase.from("branches").select("*").eq("id", id).single()).data,
  });
  const { data: stats } = useQuery({
    queryKey: ["branch-stats", id],
    queryFn: async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const [today_, month, all, prods, cust, sup, todayProfitSrc, monthProfitSrc, costProducts, expensesAll] = await Promise.all([
        supabase.from("sales").select("total_amount").eq("branch_id", id).gte("created_at", today.toISOString()),
        supabase.from("sales").select("total_amount").eq("branch_id", id).gte("created_at", monthStart.toISOString()),
        supabase.from("sales").select("total_amount,due_amount").eq("branch_id", id),
        supabase.from("products").select("id,stock_qty,low_stock_threshold,expiry_date").eq("branch_id", id),
        supabase.from("customers").select("due_amount").eq("branch_id", id),
        supabase.from("suppliers").select("due_amount").eq("branch_id", id),
        supabase.from("sales").select("items").eq("branch_id", id).gte("created_at", today.toISOString()),
        supabase.from("sales").select("items").eq("branch_id", id).gte("created_at", monthStart.toISOString()),
        supabase.from("products").select("id,purchase_price").eq("branch_id", id),
        supabase.from("expenses").select("amount").eq("branch_id", id),
      ]);
      const costMap = new Map<string, number>();
      (costProducts.data ?? []).forEach((p: any) => costMap.set(p.id, Number(p.purchase_price || 0)));
      const calcProfit = (items: any) => {
        if (!Array.isArray(items)) return 0;
        return items.reduce((s, it: any) => {
          const qty = Number(it?.qty ?? it?.quantity ?? 1);
          const sell = Number(it?.unitPrice ?? it?.sell_price ?? it?.price ?? it?.unit_price ?? 0);
          const discount = Number(it?.discount ?? 0);
          const pid = it?.productId ?? it?.product_id ?? it?.id;
          const cost = Number(it?.purchase_price ?? it?.cost ?? it?.cost_price ?? (pid ? costMap.get(pid) : 0) ?? 0);
          return s + (sell * qty - discount) - cost * qty;
        }, 0);
      };
      const profitToday = (todayProfitSrc.data ?? []).reduce((a: number, s: any) => a + calcProfit(s.items), 0);
      const profitMonth = (monthProfitSrc.data ?? []).reduce((a: number, s: any) => a + calcProfit(s.items), 0);
      return {
        today: (today_.data??[]).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0),
        month: (month.data??[]).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0),
        all: (all.data??[]).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0),
        profitToday,
        profitMonth,
        totalExpenses: (expensesAll.data??[]).reduce((a:number,e:any)=>a+Number(e.amount||0),0),
        products: (prods.data??[]).length,
        lowStock: (prods.data??[]).filter((p:any)=>Number(p.stock_qty)<=Number(p.low_stock_threshold||0)).length,
        expiring: (prods.data??[]).filter((p:any)=>p.expiry_date && new Date(p.expiry_date) < new Date(Date.now()+30*86400000)).length,
        custDue: (cust.data??[]).reduce((a:number,c:any)=>a+Number(c.due_amount||0),0),
        supDue: (sup.data??[]).reduce((a:number,s:any)=>a+Number(s.due_amount||0),0),
      };
    },
  });
  const { data: sales } = useQuery({
    queryKey: ["branch-sales", id],
    queryFn: async () => (await supabase.from("sales").select("*").eq("branch_id", id).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: products } = useQuery({
    queryKey: ["branch-products", id],
    queryFn: async () => (await supabase.from("products").select("*").eq("branch_id", id).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: purchases } = useQuery({
    queryKey: ["branch-purchases", id],
    queryFn: async () => (await supabase.from("purchases").select("*").eq("branch_id", id).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const { data: suppliers } = useQuery({
    queryKey: ["branch-suppliers-map", id],
    queryFn: async () => (await supabase.from("suppliers").select("id,name").eq("branch_id", id)).data ?? [],
  });
  const supMap = new Map<string,string>((suppliers ?? []).map((s:any)=>[s.id, s.name]));
  const { data: customers } = useQuery({
    queryKey: ["branch-customers", id],
    queryFn: async () => (await supabase.from("customers").select("*").eq("branch_id", id).order("created_at", { ascending: false }).limit(200)).data ?? [],
  });
  const { data: expenses } = useQuery({
    queryKey: ["branch-expenses", id],
    queryFn: async () => (await supabase.from("expenses").select("*").eq("branch_id", id).order("created_at", { ascending: false }).limit(100)).data ?? [],
  });

  return (
    <>
      <PageHeader title={branch?.name ?? "Branch"} description={`Code: ${branch?.code ?? ""} — Admin drill-down (read-only view)`}
        actions={<Link to="/admin/branches"><Button variant="outline" size="sm"><ArrowLeft className="h-4 w-4 mr-2"/>All Branches</Button></Link>} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Sales Today" value={fmtMoney(stats?.today)} />
        <StatCard title="Sales This Month" value={fmtMoney(stats?.month)} />
        <StatCard title="Total Sales" value={fmtMoney(stats?.all)} />
        <StatCard title="Total Expenses" value={fmtMoney(stats?.totalExpenses)} />
        <StatCard title="Profit This Month" value={fmtMoney(stats?.profitMonth)} />
        <StatCard title="Profit Today" value={fmtMoney(stats?.profitToday)} />
        <StatCard title="Total Products" value={stats?.products ?? 0} />
        <StatCard title="Low Stock" value={stats?.lowStock ?? 0} />
        <StatCard title="Expiring Soon" value={stats?.expiring ?? 0} />
        <StatCard title="Customer Due" value={fmtMoney(stats?.custDue)} />
        <StatCard title="Supplier Due" value={fmtMoney(stats?.supDue)} />
      </div>
      <Tabs defaultValue="sales" className="mt-6">
        <TabsList>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="inventory">Inventory</TabsTrigger>
          <TabsTrigger value="purchases">Purchases</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
        </TabsList>
        <TabsContent value="sales">
          <DataTable rows={sales ?? []} searchKeys={["invoice_no","payment_method"]} rowKey={(r)=>r.id}
            columns={[
              { key: "invoice_no", header: "Invoice" },
              { key: "created_at", header: "Date", render:(r)=>fmtDate(r.created_at) },
              { key: "total_amount", header: "Total", render:(r)=>fmtMoney(r.total_amount) },
              { key: "paid_amount", header: "Paid", render:(r)=>fmtMoney(r.paid_amount) },
              { key: "due_amount", header: "Due", render:(r)=>fmtMoney(r.due_amount) },
              { key: "payment_method", header: "Method" },
              { key: "actions", header: "", sortable: false, render:(r)=>(
                <Button variant="ghost" size="icon" onClick={(e)=>{e.stopPropagation(); setSelectedSale(r);}} aria-label="View sale details">
                  <Eye className="h-4 w-4"/>
                </Button>
              )},
            ]}/>
        </TabsContent>
        <TabsContent value="inventory">
          <DataTable rows={products ?? []} searchKeys={["product_code","name","sku","barcode"]} rowKey={(r)=>r.id}
            columns={[
              { key: "product_code", header: "Code" },
              { key: "name", header: "Name" },
              { key: "sku", header: "SKU" },
              { key: "stock_qty", header: "Stock" },
              { key: "purchase_price", header: "Purchase Price", render:(r)=>fmtMoney(r.purchase_price) },
              { key: "sell_price", header: "Sell Price", render:(r)=>fmtMoney(r.sell_price) },
              { key: "expiry_date", header: "Expiry" },
            ]}/>
        </TabsContent>
        <TabsContent value="purchases">
          <DataTable rows={purchases ?? []} searchKeys={["supplier_name"]} rowKey={(r)=>r.id}
            columns={[
              { key: "created_at", header: "Date", render:(r)=>fmtDate(r.created_at) },
              { key: "supplier", header: "Supplier", render:(r)=>supMap.get(r.supplier_id) ?? r.supplier_name ?? "-" },
              { key: "items", header: "Items", render:(r)=>Array.isArray(r.items)?r.items.length:0 },
              { key: "total_amount", header: "Total", render:(r)=>fmtMoney(r.total_amount) },
              { key: "paid_amount", header: "Paid", render:(r)=>fmtMoney(r.paid_amount) },
              { key: "due_amount", header: "Due", render:(r)=>fmtMoney(r.due_amount) },
              { key: "actions", header: "", sortable:false, render:(r)=>(
                <Button variant="ghost" size="icon" onClick={(e)=>{e.stopPropagation(); setSelectedPurchase(r);}} aria-label="View purchase details">
                  <Eye className="h-4 w-4"/>
                </Button>
              )},
            ]}/>
        </TabsContent>
        <TabsContent value="customers">
          <DataTable rows={customers ?? []} searchKeys={["name","phone","email"]} rowKey={(r)=>r.id}
            columns={[
              { key: "name", header: "Name" },
              { key: "phone", header: "Phone" },
              { key: "email", header: "Email" },
              { key: "due_amount", header: "Due", render:(r)=>fmtMoney(r.due_amount) },
              { key: "created_at", header: "Joined", render:(r)=>fmtDate(r.created_at) },
            ]}/>
        </TabsContent>
        <TabsContent value="expenses">
          <DataTable rows={expenses ?? []} searchKeys={["category","note"]} rowKey={(r)=>r.id}
            columns={[
              { key: "created_at", header: "Date", render:(r)=>fmtDate(r.created_at) },
              { key: "category", header: "Category" },
              { key: "note", header: "Note", render:(r)=>r.note ?? "-" },
              { key: "amount", header: "Amount", render:(r)=>fmtMoney(r.amount) },
            ]}/>
        </TabsContent>
      </Tabs>
      <SaleDetailsDialog sale={selectedSale} onClose={()=>setSelectedSale(null)} />
      <PurchaseDetailsDialog purchase={selectedPurchase} supplierName={selectedPurchase ? (supMap.get(selectedPurchase.supplier_id) ?? selectedPurchase.supplier_name) : undefined} onClose={()=>setSelectedPurchase(null)} />
    </>
  );
}
