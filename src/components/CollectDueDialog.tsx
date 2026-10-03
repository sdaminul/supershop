import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { fmtMoney } from "@/lib/format";

export function CollectDueDialog({ customer, branchId, onClose, onDone }:
  { customer: any; branchId: string | null; onClose: () => void; onDone?: () => void }) {
  const open = !!customer;
  const due = Number(customer?.due_amount ?? 0);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("cash");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { setAmount(due); setMethod("cash"); setNote(""); }, [customer?.id, due]);

  async function submit() {
    if (!amount || amount <= 0) return toast.error("Enter an amount greater than 0");
    if (amount > due) return toast.error("Amount exceeds outstanding due");
    setSaving(true);
    try {
      const { error } = await supabase.rpc("collect_customer_due", {
        _branch_id: branchId, _customer_id: customer.id, _amount: amount, _method: method, _note: note,
      });
      if (error) throw error;
      toast.success("Payment recorded");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e.message ?? "Failed to record payment");
    } finally { setSaving(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Collect Due — {customer?.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Outstanding due</span>
            <span className="font-semibold">{fmtMoney(due)}</span>
          </div>
          <div><Label>Amount</Label>
            <Input type="number" min={0} max={due} value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)} />
          </div>
          <div><Label>Method</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="bkash">bKash</SelectItem>
                <SelectItem value="nagad">Nagad</SelectItem>
                <SelectItem value="bank">Bank Transfer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>Note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? "Saving..." : "Record Payment"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}