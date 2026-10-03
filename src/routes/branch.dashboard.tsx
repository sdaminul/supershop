import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { StatCard } from "@/components/StatCard";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, Package, AlertTriangle, Users, Receipt, PiggyBank } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid, Tooltip } from "recharts";

export const Route = createFileRoute("/branch/dashboard")({ component: BranchDashboard });

function BranchDashboard() {
  const { branchId } = useAuth();
  const { data } = useQuery({
    queryKey: ["branch-dash", branchId],
    enabled: !!branchId,
    queryFn: async () => {
      const today = new Date(); today.setHours(0,0,0,0);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [today_, month, all, prods, cust, sup, recent, trend, monthProfitSrc, expensesAll] = await Promise.all([
        supabase.from("sales").select("items,total_amount").eq("branch_id", branchId).gte("created_at", today.toISOString()),
        supabase.from("sales").select("total_amount").eq("branch_id", branchId).gte("created_at", monthStart.toISOString()),
        supabase.from("sales").select("total_amount").eq("branch_id", branchId),
        supabase.from("products").select("id,stock_qty,low_stock_threshold,expiry_date,purchase_price,sell_price").eq("branch_id", branchId),
        supabase.from("customers").select("due_amount").eq("branch_id", branchId),
        supabase.from("suppliers").select("due_amount").eq("branch_id", branchId),
        supabase.from("sales").select("*").eq("branch_id", branchId).gte("created_at", dayAgo.toISOString()).order("created_at",{ascending:false}).limit(20),
        supabase.from("sales").select("total_amount,created_at").eq("branch_id", branchId).gte("created_at", new Date(Date.now()-30*86400000).toISOString()),
        supabase.from("sales").select("items").eq("branch_id", branchId).gte("created_at", monthStart.toISOString()),
        supabase.from("expenses").select("amount").eq("branch_id", branchId),
      ]);
      const todaySales = (today_.data??[]).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0);
      const costMap = new Map<string, number>();
      (prods.data ?? []).forEach((p: any) => costMap.set(p.id, Number(p.purchase_price || 0)));
      const calcProfit = (items: any) => {
        if (!Array.isArray(items)) return 0;
        return items.reduce((sum: number, it: any) => {
          const qty = Number(it?.qty ?? it?.quantity ?? 1);
          const sell = Number(it?.unitPrice ?? it?.sell_price ?? it?.price ?? it?.unit_price ?? 0);
          const discount = Number(it?.discount ?? 0);
          const pid = it?.productId ?? it?.product_id ?? it?.id;
          const cost = Number(it?.purchase_price ?? it?.cost ?? it?.cost_price ?? (pid ? costMap.get(pid) : 0) ?? 0);
          return sum + (sell * qty - discount) - cost * qty;
        }, 0);
      };
      const profitToday = (today_.data ?? []).reduce((a: number, s: any) => a + calcProfit(s.items), 0);
      const profitMonth = (monthProfitSrc.data ?? []).reduce((a: number, s: any) => a + calcProfit(s.items), 0);
      const daily: Record<string,number> = {};
      (trend.data??[]).forEach((s:any)=>{ const d = s.created_at.slice(0,10); daily[d] = (daily[d]||0)+Number(s.total_amount||0); });
      return {
        todaySales,
        monthSales: (month.data??[]).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0),
        allSales: (all.data??[]).reduce((a:number,s:any)=>a+Number(s.total_amount||0),0),
        profitToday,
        profitMonth,
        totalExpenses: (expensesAll.data??[]).reduce((a:number,e:any)=>a+Number(e.amount||0),0),
        products: (prods.data??[]).length,
        lowStock: (prods.data??[]).filter((p:any)=>Number(p.stock_qty)<=Number(p.low_stock_threshold||0)).length,
        expiring: (prods.data??[]).filter((p:any)=>p.expiry_date && new Date(p.expiry_date) < new Date(Date.now()+30*86400000)).length,
        custDue: (cust.data??[]).reduce((a:number,c:any)=>a+Number(c.due_amount||0),0),
        supDue: (sup.data??[]).reduce((a:number,s:any)=>a+Number(s.due_amount||0),0),
        recent: recent.data ?? [],
        trend: Object.entries(daily).sort().map(([date,v])=>({date,revenue:v})),
      };
    },
  });
  return (
    <>
      <PageHeader title="Branch Dashboard" description="Overview of your branch performance" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Today's Sales" value={fmtMoney(data?.todaySales)} icon={<DollarSign className="h-4 w-4"/>}/>
        <StatCard title="This Month" value={fmtMoney(data?.monthSales)} icon={<DollarSign className="h-4 w-4"/>}/>
        <StatCard title="Total Sales" value={fmtMoney(data?.allSales)} icon={<DollarSign className="h-4 w-4"/>}/>
        <StatCard title="Total Expenses" value={fmtMoney(data?.totalExpenses)} icon={<Receipt className="h-4 w-4"/>}/>
        <StatCard title="Today's Profit" value={fmtMoney(data?.profitToday)} />
        <StatCard title="Profit This Month" value={fmtMoney(data?.profitMonth)} icon={<PiggyBank className="h-4 w-4"/>}/>
        <StatCard title="Total Products" value={data?.products ?? 0} icon={<Package className="h-4 w-4"/>}/>
        <StatCard title="Low Stock" value={data?.lowStock ?? 0} icon={<AlertTriangle className="h-4 w-4"/>}/>
        <StatCard title="Expiring Soon" value={data?.expiring ?? 0} />
        <StatCard title="Customer Due" value={fmtMoney(data?.custDue)} icon={<Users className="h-4 w-4"/>}/>
        <StatCard title="Supplier Due" value={fmtMoney(data?.supDue)} />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Sales Trend (30d)</CardTitle></CardHeader>
          <CardContent style={{height:260}}>
            <ResponsiveContainer>
              <LineChart data={data?.trend ?? []}>
                <CartesianGrid strokeDasharray="3 3"/>
                <XAxis dataKey="date" fontSize={12}/><YAxis fontSize={12}/><Tooltip/>
                <Line type="monotone" dataKey="revenue" stroke="hsl(var(--primary))" strokeWidth={2}/>
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Recent Transactions (last 24 hours)</CardTitle></CardHeader>
          <CardContent>
            <div className="divide-y">
              {(data?.recent ?? []).map((s:any)=>(
                <div key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <div><div className="font-medium">{s.invoice_no}</div><div className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</div></div>
                  <div className="font-medium">{fmtMoney(s.total_amount)}</div>
                </div>
              ))}
              {(data?.recent ?? []).length === 0 && <div className="text-sm text-muted-foreground py-6 text-center">No transactions in the last 24 hours</div>}
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}