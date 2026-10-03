import { Card, CardContent } from "@/components/ui/card";
import type { ReactNode } from "react";

export function StatCard({ title, value, icon, hint }: { title: string; value: ReactNode; icon?: ReactNode; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{title}</div>
          {icon && <div className="text-muted-foreground">{icon}</div>}
        </div>
        <div className="text-2xl font-semibold mt-2">{value}</div>
        {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
      </CardContent>
    </Card>
  );
}