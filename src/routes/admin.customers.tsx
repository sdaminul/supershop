import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { fmtMoney, fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/admin/customers")({ component: AdminCustomers });

function AdminCustomers() {
  const { data: branches } = useQuery({
    queryKey: ["all-branches"],
    queryFn: async () => (await supabase.from("branches").select("id,name")).data ?? [],
  });
  const { data, isLoading } = useQuery({
    queryKey: ["admin-customers"],
    queryFn: async () => (await supabase.from("customers").select("*").order("name")).data ?? [],
  });
  const branchMap = useMemo(() => {
    const m = new Map<string, string>();
    (branches ?? []).forEach((b: any) => m.set(b.id, b.name));
    return m;
  }, [branches]);
  const rows = useMemo(
    () => (data ?? []).map((c: any) => ({ ...c, branch_name: branchMap.get(c.branch_id) ?? "-" })),
    [data, branchMap]
  );
  return (
    <>
      <PageHeader title="Customers" description="All customers across every branch" />
      <DataTable rows={rows} loading={isLoading} rowKey={(r) => r.id}
        searchKeys={["name","phone","address","branch_name"]}
        columns={[
          { key: "name", header: "Name" },
          { key: "phone", header: "Phone" },
          { key: "address", header: "Address" },
          { key: "branch_name", header: "Branch", render: (r) => <Badge variant="outline">{r.branch_name}</Badge> },
          { key: "due_amount", header: "Due", render: (r) => fmtMoney(r.due_amount) },
          { key: "created_at", header: "Joined", render: (r) => fmtDate(r.created_at) },
        ]}/>
    </>
  );
}