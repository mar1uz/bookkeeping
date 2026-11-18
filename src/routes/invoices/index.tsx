import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { panel } from "@/client/components/Section";
import { buttonVariants } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Amount, STATUS_LABELS, StatusBadge } from "@/client/lib/format";
import { getInvoices } from "@/serverFunctions/invoices";

const search = z.object({
  status: z.string().optional(),
  q: z.coerce.string().optional(),
});

export const Route = createFileRoute("/invoices/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getInvoices({
      data: {
        status: (deps.status as "all") ?? "all",
        search: deps.q || undefined,
      },
    }),
  head: () => ({ meta: [{ title: "Invoices" }] }),
  component: Invoices,
});

function Invoices() {
  const rows = Route.useLoaderData();
  const { status = "all", q = "" } = Route.useSearch();
  const navigate = useNavigate({ from: "/invoices/" });
  return (
    <AppShell>
      <PageHeader
        title="Invoices"
        actions={
          <Link to="/invoices/new" className={buttonVariants()} data-testid="new-invoice">
            New invoice
          </Link>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search invoices"
          placeholder="Customer or number"
          className="max-w-xs bg-card"
          defaultValue={q}
          onChange={(e) => navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true })}
        />
        <NativeSelect
          aria-label="Status"
          data-testid="status-filter"
          value={status}
          onChange={(e) => navigate({ search: (s) => ({ ...s, status: e.target.value === "all" ? undefined : e.target.value }) })}
        >
          <NativeSelectOption value="all">All statuses</NativeSelectOption>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <NativeSelectOption key={value} value={value}>
              {label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {status === "all" && !q ? "No invoices yet. Create one and it appears here." : "No invoices match."}
        </p>
      ) : (
        <div className={panel}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Due</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} data-testid="invoice-row">
                  <TableCell>
                    <Link to="/invoices/$id" params={{ id: r.id }} className="font-medium hover:underline">
                      {r.number ?? "Draft"}
                    </Link>
                  </TableCell>
                  <TableCell>{r.customer}</TableCell>
                  <TableCell>{r.issueDate}</TableCell>
                  <TableCell>{r.kind === "invoice" ? r.dueDate : ""}</TableCell>
                  <TableCell className="text-right"><Amount ore={r.grossOre} /></TableCell>
                  <TableCell><StatusBadge status={r.status} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
