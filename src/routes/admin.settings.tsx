import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({ component: AdminSettings });

function AdminSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: async () => (await supabase.from("settings").select("*").eq("id",1).maybeSingle()).data });
  const [form, setForm] = useState<any>({});
  useEffect(() => { if (data) setForm(data); }, [data]);
  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("settings").update({ ...form, updated_at: new Date().toISOString() }).eq("id",1);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey:["settings"] }); },
    onError: (e:any)=> toast.error(e.message),
  });
  return (
    <>
      <PageHeader title="Settings" description="Company info, currency, tax, and invoice format" />
      <Card>
        <CardHeader><CardTitle className="text-base">Company Info</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-3">
          <F label="Company Name"><Input value={form.company_name ?? ""} onChange={(e)=>setForm({...form,company_name:e.target.value})}/></F>
          <F label="Phone"><Input value={form.company_phone ?? ""} onChange={(e)=>setForm({...form,company_phone:e.target.value})}/></F>
          <F label="Address" className="md:col-span-2"><Input value={form.company_address ?? ""} onChange={(e)=>setForm({...form,company_address:e.target.value})}/></F>
          <F label="Currency Symbol"><Input value={form.currency ?? ""} onChange={(e)=>setForm({...form,currency:e.target.value})}/></F>
          <F label="Default Tax Rate (%)"><Input type="number" value={form.default_tax_rate ?? 0} onChange={(e)=>setForm({...form,default_tax_rate:Number(e.target.value)})}/></F>
          <F label="Invoice Prefix"><Input value={form.invoice_prefix ?? ""} onChange={(e)=>setForm({...form,invoice_prefix:e.target.value})}/></F>
          <F label="Logo URL"><Input value={form.logo_url ?? ""} onChange={(e)=>setForm({...form,logo_url:e.target.value})}/></F>
        </CardContent>
      </Card>
      <div className="mt-4"><Button onClick={()=>save.mutate()} disabled={save.isPending}>{save.isPending?"Saving...":"Save"}</Button></div>
    </>
  );
}
function F({label,children,className}:{label:string;children:React.ReactNode;className?:string}){return <div className={`space-y-1.5 ${className??""}`}><Label>{label}</Label>{children}</div>;}