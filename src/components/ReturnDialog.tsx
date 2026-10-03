import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";

interface Props { sale: any; onClose: () => void; onDone?: () => void; }

export function ReturnDialog({ sale, onClose, onDone }: Props) {
  const open = !!sale;
  const items: any[] = Array.isArray(sale?.items) ? sale.items : [];
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setQtys({}); setReason(""); }, [sale?.id]);

  const refund = items.reduce((s, it, idx) => {
    const key = String(it?.productId ?? idx);
    const q = Number(qtys[key] || 0);
    const price = Number(it?.unitPrice ?? it?.price ?? 0);
    const disc = Number(it?.discount ?? 0);
    const orig = Number(it?.qty ?? 1);
    if (!q || orig <= 0) return s;
    return s + (price * q - (disc * q) / orig);
  }, 0);

  async function submit() {
    const returnItems = items
      .map((it, idx) => {
        const key = String(it?.productId ?? idx);
        const q = Number(qtys[key] || 0);
        if (!q) return null;
        return { productId: it?.productId, name: it?.name, qty: q, unitPrice: Number(it?.unitPrice ?? 0) };
      })
      .filter(Boolean);
    if (!returnItems.length) return toast.error("Select at least one item to return");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("process_sale_return", {
        _sale_id: sale.id, _items: returnItems, _reason: reason, _refund_amount: refund,
      });
      if (error) throw error;
      toast.success("Return processed");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to process return");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Return Products {sale?.invoice_no ? `— ${sale.invoice_no}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Sold Qty</TableHead>
                  <TableHead className="text-right">Unit Price</TableHead>
                  <TableHead className="text-right">Return Qty</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">No items in this sale.</TableCell></TableRow>
                )}
                {items.map((it: any, idx: number) => {
                  const key = String(it?.productId ?? idx);
                  const max = Number(it?.qty ?? 1);
                  return (
                    <TableRow key={key}>
                      <TableCell className="font-medium">{it?.name ?? "-"}</TableCell>
                      <TableCell className="text-right">{max}</TableCell>
                      <TableCell className="text-right">{fmtMoney(it?.unitPrice)}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" min={0} max={max} className="w-24 ml-auto"
                          value={qtys[key] ?? 0}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(max, Number(e.target.value) || 0));
                            setQtys((q) => ({ ...q, [key]: v }));
                          }}/>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          <div>
            <Label>Reason (optional)</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Defective, wrong item, etc." />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Refund amount</span>
            <span className="font-semibold">{fmtMoney(refund)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || refund <= 0}>{saving ? "Processing..." : "Process Return"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}