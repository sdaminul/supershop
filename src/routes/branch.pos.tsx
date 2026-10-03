import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layouts/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Trash2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";

export const Route = createFileRoute("/branch/pos")({ component: POS });

interface CartItem { productId: string; name: string; qty: number; unitPrice: number; discount: number; stock: number; }

function POS() {
  const { branchId } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerId, setCustomerId] = useState<string>("");
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paid, setPaid] = useState(0);
  const [method, setMethod] = useState("cash");
  const [addCustOpen, setAddCustOpen] = useState(false);

  const { data: products } = useQuery({
    queryKey: ["pos-products", branchId],
    enabled: !!branchId,
    queryFn: async () => (await supabase.from("products").select("*").eq("branch_id", branchId).eq("status","active").order("name")).data ?? [],
  });
  const { data: customers } = useQuery({
    queryKey: ["pos-customers", branchId],
    enabled: !!branchId,
    queryFn: async () => (await supabase.from("customers").select("*").eq("branch_id", branchId).order("name")).data ?? [],
  });

  const matches = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return (products ?? []).filter((p:any) =>
      p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q) ||
      (p.barcode ?? "").toLowerCase().includes(q) || (p.product_code ?? "").includes(q)
    ).slice(0, 8);
  }, [products, search]);

  // Recent sales → compute top-selling product ids to order the browse list.
  const { data: recentSales } = useQuery({
    queryKey: ["pos-recent-sales", branchId], enabled: !!branchId,
    queryFn: async () => (await supabase.from("sales").select("items").eq("branch_id", branchId)
      .order("created_at",{ascending:false}).limit(200)).data ?? [],
  });
  const soldQty = useMemo(() => {
    const m = new Map<string, number>();
    (recentSales ?? []).forEach((s: any) => {
      (Array.isArray(s.items) ? s.items : []).forEach((it: any) => {
        const id = it?.productId ?? it?.product_id ?? it?.id;
        if (!id) return;
        m.set(id, (m.get(id) || 0) + Number(it?.qty ?? it?.quantity ?? 0));
      });
    });
    return m;
  }, [recentSales]);
  const browse = useMemo(() => {
    const list = (products ?? []).slice();
    list.sort((a: any, b: any) => (soldQty.get(b.id) || 0) - (soldQty.get(a.id) || 0));
    return list;
  }, [products, soldQty]);

  function addToCart(p: any) {
    setCart((c) => {
      const existing = c.find((x) => x.productId === p.id);
      if (existing) return c.map((x) => x.productId === p.id ? { ...x, qty: x.qty + 1 } : x);
      return [...c, { productId: p.id, name: p.name, qty: 1, unitPrice: Number(p.sell_price), discount: 0, stock: Number(p.stock_qty) }];
    });
    setSearch("");
  }

  const subtotal = cart.reduce((s, i) => s + i.qty * i.unitPrice - i.discount, 0);
  const total = Math.max(0, subtotal - discount + tax);
  const due = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);

  const submit = useMutation({
    mutationFn: async () => {
      if (!cart.length) throw new Error("Cart is empty");
      const { data, error } = await supabase.rpc("complete_sale", {
        _branch_id: branchId,
        _items: cart.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, unitPrice: i.unitPrice, discount: i.discount })),
        _subtotal: subtotal, _discount: discount, _tax: tax, _total: total, _paid: paid,
        _payment_method: method, _customer_id: customerId || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (sale: any) => {
      toast.success(`Sale ${sale?.invoice_no ?? ""} completed`);
      setCart([]); setDiscount(0); setTax(0); setPaid(0); setCustomerId(""); setMethod("cash");
      qc.invalidateQueries({ queryKey:["pos-products"] });
      qc.invalidateQueries({ queryKey:["branch-dash"] });
      printInvoice(sale);
    },
    onError: (e:any) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader title="POS / Billing" description="Fast checkout with barcode / product code search" />
      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"/>
              <Input className="pl-8" placeholder="Scan barcode or search product name / code / SKU..." value={search} onChange={(e)=>setSearch(e.target.value)} autoFocus/>
              {matches.length > 0 && (
                <div className="absolute z-10 bg-popover border rounded-md mt-1 w-full shadow-lg max-h-72 overflow-auto">
                  {matches.map((p:any) => (
                    <button key={p.id} onClick={()=>addToCart(p)} className="w-full text-left px-3 py-2 hover:bg-accent flex justify-between text-sm">
                      <div><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">#{p.product_code} • Stock: {p.stock_qty}</div></div>
                      <div className="font-medium">{fmtMoney(p.sell_price)}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md divide-y">
              {cart.length === 0 && (
                <div className="p-3">
                  <div className="text-xs text-muted-foreground mb-2">Cart is empty — showing products at your branch, top sellers first.</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[420px] overflow-auto">
                    {browse.length === 0 && <div className="text-sm text-muted-foreground col-span-full p-6 text-center">No products available.</div>}
                    {browse.map((p: any) => (
                      <button key={p.id} onClick={() => addToCart(p)}
                        className="text-left border rounded-md p-2 hover:bg-accent transition disabled:opacity-50"
                        disabled={Number(p.stock_qty) <= 0}>
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground">#{p.product_code} • Stock: {p.stock_qty}</div>
                        <div className="text-sm font-semibold mt-1">{fmtMoney(p.sell_price)}</div>
                        {(soldQty.get(p.id) || 0) > 0 && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">Sold {soldQty.get(p.id)}×</div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cart.length === 0 ? null : (
                <>
                  <div className="p-3 grid grid-cols-12 gap-2 text-sm">
                    <div className="col-span-4 font-medium truncate">Product</div>
                    <div className="col-span-2 font-medium truncate">Price</div>
                    <div className="col-span-2 font-medium truncate">Qty</div>
                    <div className="col-span-2 font-medium truncate">Discount</div>
                    <div className="col-span-2 font-medium truncate ps-2">Total</div>
                  </div>
                  {cart.map((i) => (
                    <div key={i.productId} className="p-3 grid grid-cols-12 items-center gap-2 text-sm">
                      <div className="col-span-4 font-medium truncate">{i.name}</div>
                      <Input className="col-span-2" type="number" value={i.unitPrice}
                        onChange={(e)=>setCart(cart.map(x=>x.productId===i.productId?{...x,unitPrice:Number(e.target.value)}:x))}/>
                      <Input className="col-span-2" type="number" value={i.qty} min={1} max={i.stock}
                        onChange={(e)=>setCart(cart.map(x=>x.productId===i.productId?{...x,qty:Math.min(Math.max(1,Number(e.target.value)),i.stock)}:x))}/>
                      <Input className="col-span-2" type="number" value={i.discount} placeholder="Disc"
                        onChange={(e)=>setCart(cart.map(x=>x.productId===i.productId?{...x,discount:Number(e.target.value)}:x))}/>
                      <div className="col-span-1 ps-2 font-medium">{fmtMoney(i.qty*i.unitPrice - i.discount)}</div>
                      <button className="col-span-1 text-destructive justify-self-end" onClick={()=>setCart(cart.filter(x=>x.productId!==i.productId))}><Trash2 className="h-4 w-4"/></button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Checkout</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Customer</Label>
              <div className="flex gap-2">
                <Select value={customerId} onValueChange={setCustomerId}>
                  <SelectTrigger><SelectValue placeholder="Walk-in"/></SelectTrigger>
                  <SelectContent>{(customers ?? []).map((c:any)=><SelectItem key={c.id} value={c.id}>{c.name} — {c.phone}</SelectItem>)}</SelectContent>
                </Select>
                <Dialog open={addCustOpen} onOpenChange={setAddCustOpen}>
                  <DialogTrigger asChild><Button variant="outline" size="icon"><Plus className="h-4 w-4"/></Button></DialogTrigger>
                  <QuickCustomer onDone={(id)=>{ setAddCustOpen(false); setCustomerId(id); qc.invalidateQueries({queryKey:["pos-customers"]}); }}/>
                </Dialog>
              </div>
            </div>
            <Row label="Subtotal">{fmtMoney(subtotal)}</Row>
            <div className="space-y-1.5"><Label>Overall Discount</Label><Input type="number" value={discount} onChange={(e)=>setDiscount(Number(e.target.value)||0)}/></div>
            <div className="space-y-1.5"><Label>Tax</Label><Input type="number" value={tax} onChange={(e)=>setTax(Number(e.target.value)||0)}/></div>
            <Row label="Total"><span className="font-semibold">{fmtMoney(total)}</span></Row>
            <div className="space-y-1.5"><Label>Payment Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card</SelectItem>
                  <SelectItem value="bkash">bKash</SelectItem><SelectItem value="nagad">Nagad</SelectItem>
                  <SelectItem value="due">Due</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Paid</Label><Input type="number" value={paid} onChange={(e)=>setPaid(Number(e.target.value)||0)}/></div>
            <Row label="Due">{fmtMoney(due)}</Row>
            <Row label="Change">{fmtMoney(change)}</Row>
            <Button className="w-full" size="lg" disabled={submit.isPending || !cart.length} onClick={()=>submit.mutate()}>{submit.isPending?"Processing...":"Complete Sale"}</Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({label,children}:{label:string;children:React.ReactNode}){return <div className="flex justify-between text-sm"><span className="text-muted-foreground">{label}</span><span>{children}</span></div>;}

function QuickCustomer({onDone}:{onDone:(id:string)=>void}) {
  const { branchId } = useAuth();
  const [name,setName]=useState(""); const [phone,setPhone]=useState(""); const [address,setAddress]=useState("");
  return (
    <DialogContent>
      <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
      <div className="space-y-3">
        <div><Label>Name</Label><Input value={name} onChange={(e)=>setName(e.target.value)}/></div>
        <div><Label>Phone</Label><Input value={phone} onChange={(e)=>setPhone(e.target.value)}/></div>
        <div><Label>Address</Label><Input value={address} onChange={(e)=>setAddress(e.target.value)}/></div>
      </div>
      <DialogFooter>
        <Button onClick={async()=>{
          const { data, error } = await supabase.from("customers").insert({ name, phone, address, branch_id: branchId }).select().single();
          if (error) return toast.error(error.message);
          onDone(data.id);
        }}>Save</Button>
      </DialogFooter>
    </DialogContent>
  );
}

function printInvoice(sale: any) {
  if (!sale) return;
  const items = (sale.items ?? []) as any[];
  const w = window.open("", "_blank", "width=400,height=600");
  if (!w) return;
  w.document.write(`<html><head><title>${sale.invoice_no}</title><style>body{font-family:sans-serif;padding:16px;font-size:12px}h2{margin:0 0 6px}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:4px;border-bottom:1px solid #eee;text-align:left}</style></head><body>
    <h2>Invoice ${sale.invoice_no}</h2>
    <div>${new Date(sale.created_at).toLocaleString()}</div>
    <table><thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>
    ${items.map((i:any)=>`<tr><td>${i.name}</td><td>${i.qty}</td><td>${Number(i.unitPrice).toFixed(2)}</td><td>${(i.qty*i.unitPrice - (i.discount||0)).toFixed(2)}</td></tr>`).join("")}
    </tbody></table>
    <div style="margin-top:10px">Subtotal: ${Number(sale.subtotal).toFixed(2)}<br/>Discount: ${Number(sale.discount).toFixed(2)}<br/>Tax: ${Number(sale.tax).toFixed(2)}<br/><b>Total: ${Number(sale.total_amount).toFixed(2)}</b><br/>Paid: ${Number(sale.paid_amount).toFixed(2)}<br/>Due: ${Number(sale.due_amount).toFixed(2)}</div>
    <script>window.print()</script></body></html>`);
  w.document.close();
}