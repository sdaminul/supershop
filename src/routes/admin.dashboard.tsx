import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Building2, DollarSign, Package, AlertTriangle, TrendingUp, PiggyBank, Trophy, Receipt } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtMoney } from "@/lib/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

export const Route = createFileRoute("/admin/dashboard")({ component: AdminDashboard });

function AdminDashboard() {
  const { data } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const [branches, salesAll, salesToday, salesMonth, products, lowStockRows, customers, suppliers, salesTrend, costProducts, expensesAll] = await Promise.all([
        supabase.from("branches").select("id,name,status"),
        supabase.from("sales").select("total_amount,due_amount,branch_id,items,created_at"),
        supabase.from("sales").select("total_amount").gte("created_at", today.toISOString()),
        supabase.from("sales").select("total_amount").gte("created_at", monthStart.toISOString()),
        supabase.from("products").select("id,stock_qty,low_stock_threshold"),
        supabase.from("products").select("id"),
        supabase.from("customers").select("due_amount"),
        supabase.from("suppliers").select("due_amount"),
        supabase.from("sales").select("total_amount,created_at,branch_id").gte("created_at", new Date(Date.now()-30*86400000).toISOString()),
        supabase.from("products").select("id,purchase_price"),
        supabase.from("expenses").select("amount"),
      ]);
      const totalExpenses = (expensesAll.data ?? []).reduce((a:number,e:any)=>a+Number(e.amount||0),0);
      const brs = branches.data ?? [];
      const active = brs.filter((b:any)=>b.status==="active").length;
      const rev = (salesAll.data ?? []).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0);
      const due = (salesAll.data ?? []).reduce((a:number,s:any)=>a+Number(s.due_amount||0),0);
      const revToday = (salesToday.data ?? []).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0);
      const revMonth = (salesMonth.data ?? []).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0);
      const productCount = (products.data ?? []).length;
      const low = (products.data ?? []).filter((p:any)=>Number(p.stock_qty)<=Number(p.low_stock_threshold||0)).length;
      // Cost lookup by product id (sales.items doesn't store cost at time of sale).
      const costMap = new Map<string, number>();
      (costProducts.data ?? []).forEach((p: any) => costMap.set(p.id, Number(p.purchase_price || 0)));
      // Profit = sum over items of (sell - cost) * qty. Handles multiple field name variants.
      const calcProfit = (items: any) => {
        if (!Array.isArray(items)) return 0;
        return items.reduce((sum, it: any) => {
          const qty = Number(it?.qty ?? it?.quantity ?? 1);
          const sell = Number(it?.unitPrice ?? it?.sell_price ?? it?.price ?? it?.unit_price ?? 0);
          const discount = Number(it?.discount ?? 0);
          const pid = it?.productId ?? it?.product_id ?? it?.id;
          const cost = Number(
            it?.purchase_price ?? it?.cost ?? it?.cost_price ?? (pid ? costMap.get(pid) : 0) ?? 0
          );
          return sum + (sell * qty - discount) - cost * qty;
        }, 0);
      };
      let profitAll = 0, profitMonth = 0;
      (salesAll.data ?? []).forEach((s:any) => {
        const p = calcProfit(s.items);
        profitAll += p;
        if (s.created_at && new Date(s.created_at) >= monthStart) profitMonth += p;
      });
      const branchRev: Record<string,number> = {};
      (salesAll.data ?? []).forEach((s:any)=>{ branchRev[s.branch_id] = (branchRev[s.branch_id]||0)+Number(s.total_amount||0); });
      const topBranches = brs.map((b:any)=>({name:b.name, revenue: branchRev[b.id]||0})).sort((a,b)=>b.revenue-a.revenue).slice(0,5);
      const daily: Record<string,number> = {};
      (salesTrend.data ?? []).forEach((s:any)=>{ const d = s.created_at.slice(0,10); daily[d] = (daily[d]||0)+Number(s.total_amount||0); });
      const trend = Object.entries(daily).sort().map(([date,v])=>({date, revenue:v}));
      return { branches: brs.length, active, rev, due, revToday, revMonth, productCount, low, topBranches, trend, profitAll, profitMonth, totalExpenses,
        custDue: (customers.data??[]).reduce((a:number,c:any)=>a+Number(c.due_amount||0),0),
        supDue: (suppliers.data??[]).reduce((a:number,s:any)=>a+Number(s.due_amount||0),0),
      };
    },
  });
  return (
    <>
      <PageHeader title="Admin Dashboard" description="Company-wide overview across all branches" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Branches" value={`${data?.active ?? 0} / ${data?.branches ?? 0}`} icon={<Building2 className="h-4 w-4"/>} hint="active / total" />
        <StatCard title="Today's Sales" value={fmtMoney(data?.revToday)} icon={<DollarSign className="h-4 w-4"/>} />
        <StatCard title="This Month" value={fmtMoney(data?.revMonth)} icon={<TrendingUp className="h-4 w-4"/>} />
        <StatCard title="All-time Revenue" value={fmtMoney(data?.rev)} icon={<DollarSign className="h-4 w-4"/>} />
        <StatCard title="Profit This Month" value={fmtMoney(data?.profitMonth)} icon={<PiggyBank className="h-4 w-4"/>} />
        <StatCard title="Profit All Time" value={fmtMoney(data?.profitAll)} icon={<PiggyBank className="h-4 w-4"/>} />
        <StatCard title="Total Expenses" value={fmtMoney(data?.totalExpenses)} icon={<Receipt className="h-4 w-4"/>} />
        <StatCard title="Total Due (Customers)" value={fmtMoney(data?.custDue)} />
        <StatCard title="Total Due (Suppliers)" value={fmtMoney(data?.supDue)} />
        <StatCard title="Products" value={data?.productCount ?? 0} icon={<Package className="h-4 w-4"/>} />
        <StatCard title="Low Stock Items" value={data?.low ?? 0} icon={<AlertTriangle className="h-4 w-4"/>} />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4"/>Top 5 Performing Branches</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-2">
              {(data?.topBranches ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">No sales data yet.</li>
              )}
              {(data?.topBranches ?? []).map((b: any, i: number) => (
                <li key={b.name} className="flex items-center justify-between border-b last:border-0 pb-2">
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-semibold flex items-center justify-center">{i+1}</span>
                    <span className="font-medium">{b.name}</span>
                  </div>
                  <span className="text-sm font-semibold">{fmtMoney(b.revenue)}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Top 5 Branches by Revenue</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer>
              <BarChart data={data?.topBranches ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" fontSize={12}/><YAxis fontSize={12}/><Tooltip/>
                <Bar dataKey="revenue" fill="hsl(var(--primary))" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Sales Trend (Last 30 days)</CardTitle></CardHeader>
          <CardContent style={{ height: 260 }}>
            <ResponsiveContainer>
              <LineChart data={data?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" fontSize={12}/><YAxis fontSize={12}/><Tooltip/>
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2}/>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </>
  );
}