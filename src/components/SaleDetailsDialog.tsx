import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney, fmtDate } from "@/lib/format";

export function SaleDetailsDialog({ sale, onClose }: { sale: any; onClose: () => void }) {
  const open = !!sale;
  const items: any[] = Array.isArray(sale?.items) ? sale.items : [];
  const itemsTotal = items.reduce((s, it: any) => {
    const qty = Number(it?.qty ?? it?.quantity ?? 1);
    const price = Number(it?.unitPrice ?? it?.sell_price ?? it?.price ?? it?.unit_price ?? 0);
    const discount = Number(it?.discount ?? 0);
    return s + qty * price - discount;
  }, 0);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Sale Details {sale?.invoice_no ? `— ${sale.invoice_no}` : ""}</DialogTitle>
        </DialogHeader>
        {sale && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div><div className="text-muted-foreground">Date</div><div className="font-medium">{fmtDate(sale.created_at)}</div></div>
              <div><div className="text-muted-foreground">Method</div><div className="font-medium capitalize">{sale.payment_method ?? "-"}</div></div>
              <div><div className="text-muted-foreground">Customer</div><div className="font-medium">{sale.customer_name ?? "Walk-in"}</div></div>
              <div><div className="text-muted-foreground">Cashier</div><div className="font-medium">{sale.cashier_name ?? "-"}</div></div>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Discount</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">No items recorded.</TableCell></TableRow>
                  )}
                  {items.map((it: any, idx: number) => {
                    const qty = Number(it?.qty ?? it?.quantity ?? 1);
                    const price = Number(it?.unitPrice ?? it?.sell_price ?? it?.price ?? it?.unit_price ?? 0);
                    const discount = Number(it?.discount ?? 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{it?.name ?? it?.product_name ?? "-"}</TableCell>
                        <TableCell className="text-muted-foreground">{it?.sku ?? it?.product_code ?? "-"}</TableCell>
                        <TableCell className="text-right">{qty}</TableCell>
                        <TableCell className="text-right">{fmtMoney(price)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(discount)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(qty * price - discount)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm max-w-xs ml-auto">
              <div className="text-muted-foreground">Items subtotal</div><div className="text-right">{fmtMoney(itemsTotal)}</div>
              {sale.discount_amount != null && (<><div className="text-muted-foreground">Discount</div><div className="text-right">-{fmtMoney(sale.discount_amount)}</div></>)}
              {sale.tax_amount != null && (<><div className="text-muted-foreground">Tax</div><div className="text-right">{fmtMoney(sale.tax_amount)}</div></>)}
              <div className="font-semibold">Total</div><div className="text-right font-semibold">{fmtMoney(sale.total_amount)}</div>
              <div className="text-muted-foreground">Paid</div><div className="text-right">{fmtMoney(sale.paid_amount)}</div>
              <div className="text-muted-foreground">Due</div><div className="text-right">{fmtMoney(sale.due_amount)}</div>
            </div>
            {sale.notes && <div className="text-sm"><span className="text-muted-foreground">Notes: </span>{sale.notes}</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}