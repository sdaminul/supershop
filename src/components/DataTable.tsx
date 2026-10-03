import { useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (row: T) => ReactNode;
  accessor?: (row: T) => any;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  searchKeys?: (keyof T | string)[];
  emptyMessage?: string;
  toolbar?: ReactNode;
  onRowClick?: (row: T) => void;
  rowKey?: (row: T) => string;
  initialPageSize?: number;
  loading?: boolean;
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, searchKeys, emptyMessage = "No records", toolbar, onRowClick, rowKey, initialPageSize = 10, loading,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const filtered = useMemo(() => {
    let out = rows;
    if (search.trim() && searchKeys?.length) {
      const q = search.toLowerCase();
      out = out.filter((r) =>
        searchKeys.some((k) => String((r as any)[k] ?? "").toLowerCase().includes(q))
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      const get = col?.accessor ?? ((r: T) => (r as any)[sortKey]);
      out = [...out].sort((a, b) => {
        const va = get(a); const vb = get(b);
        if (va == null) return 1; if (vb == null) return -1;
        if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
        return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
      });
    }
    return out;
  }, [rows, search, sortKey, sortDir, columns, searchKeys]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  function toggleSort(k: string) {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search..." className="pl-8" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <div className="flex items-center gap-2">{toolbar}</div>
      </div>
      <div className="rounded-md border overflow-x-auto bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={c.className}>
                  {c.sortable !== false ? (
                    <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort(c.key)}>
                      {c.header}
                      {sortKey === c.key ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
                    </button>
                  ) : c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">Loading...</TableCell></TableRow>
            ) : paged.length === 0 ? (
              <TableRow><TableCell colSpan={columns.length} className="text-center text-muted-foreground py-8">{emptyMessage}</TableCell></TableRow>
            ) : paged.map((r, i) => (
              <TableRow key={rowKey ? rowKey(r) : i} className={onRowClick ? "cursor-pointer" : ""} onClick={() => onRowClick?.(r)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={c.className}>
                    {c.render ? c.render(r) : (c.accessor ? c.accessor(r) : (r as any)[c.key]) ?? "-"}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <div>Showing {total === 0 ? 0 : (currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, total)} of {total}</div>
        <div className="flex items-center gap-2">
          <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
            <SelectTrigger className="w-28 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{[10, 25, 50, 100].map((n) => <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Prev</Button>
          <span>Page {currentPage} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}