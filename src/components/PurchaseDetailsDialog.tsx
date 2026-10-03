import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { fmtMoney, fmtDate } from "@/lib/format";

export function PurchaseDetailsDialog({ purchase, supplierName, onClose }: { purchase: any; supplierName?: string; onClose: () => void }) {
  const open = !!purchase;
  const items: any[] = Array.isArray(purchase?.items) ? purchase.items : [];
  const itemsTotal = items.reduce((s, it: any) => {
    const qty = Number(it?.qty ?? it?.quantity ?? 1);
    const cost = Number(it?.unitCost ?? it?.cost ?? it?.purchase_price ?? it?.unit_price ?? 0);
    return s + qty * cost;
  }, 0);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Purchase Details {purchase?.invoice_no ? `— ${purchase.invoice_no}` : ""}</DialogTitle>
        </DialogHeader>
        {purchase && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div><div className="text-muted-foreground">Date</div><div className="font-medium">{fmtDate(purchase.created_at)}</div></div>
              <div><div className="text-muted-foreground">Supplier</div><div className="font-medium">{supplierName ?? purchase.supplier_name ?? "-"}</div></div>
              <div><div className="text-muted-foreground">Items</div><div className="font-medium">{items.length}</div></div>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Unit Cost</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 && (
                    <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No items recorded.</TableCell></TableRow>
                  )}
                  {items.map((it: any, idx: number) => {
                    const qty = Number(it?.qty ?? it?.quantity ?? 1);
                    const cost = Number(it?.unitCost ?? it?.cost ?? it?.purchase_price ?? it?.unit_price ?? 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="font-medium">{it?.name ?? it?.product_name ?? "-"}</TableCell>
                        <TableCell className="text-right">{qty}</TableCell>
                        <TableCell className="text-right">{fmtMoney(cost)}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(qty * cost)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm max-w-xs ml-auto">
              <div className="text-muted-foreground">Items subtotal</div><div className="text-right">{fmtMoney(itemsTotal)}</div>
              <div className="font-semibold">Total</div><div className="text-right font-semibold">{fmtMoney(purchase.total_amount)}</div>
              <div className="text-muted-foreground">Paid</div><div className="text-right">{fmtMoney(purchase.paid_amount)}</div>
              <div className="text-muted-foreground">Due</div><div className="text-right">{fmtMoney(purchase.due_amount)}</div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}