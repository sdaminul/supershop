import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/layouts/Shell";
import { DataTable } from "@/components/DataTable";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/admin/audit-logs")({ component: AuditLogs });

function AuditLogs() {
  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => (await supabase.from("audit_logs").select("*").order("created_at",{ascending:false}).limit(500)).data ?? [],
  });
  return (
    <>
      <PageHeader title="Audit Logs" description="All create / update / delete actions across the system" />
      <DataTable rows={data ?? []} loading={isLoading} searchKeys={["action","target_collection","target_id"]} rowKey={(r)=>r.id}
        columns={[
          { key:"created_at", header:"Timestamp", render:(r)=>fmtDate(r.created_at) },
          { key:"user_id", header:"User" },
          { key:"branch_id", header:"Branch" },
          { key:"action", header:"Action" },
          { key:"target_collection", header:"Target" },
          { key:"target_id", header:"Target ID" },
        ]}/>
    </>
  );
}