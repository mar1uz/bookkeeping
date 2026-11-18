import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { Paperclip } from "lucide-react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { panel } from "@/client/components/Section";
import { buttonVariants } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Amount } from "@/client/lib/format";
import { pickContacts } from "@/serverFunctions/contacts";
import { getPurchases } from "@/serverFunctions/purchases";

const search = z.object({
  status: z.enum(["all", "paid", "unpaid"]).optional(),
  supplier: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const Route = createFileRoute("/purchases/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const [rows, suppliers] = await Promise.all([
      getPurchases({
        data: {
          status: deps.status,
          supplierId: deps.supplier || undefined,
          from: deps.from || undefined,
          to: deps.to || undefined,
        },
      }),
      pickContacts({ data: { role: "supplier" } }),
    ]);
    return { rows, suppliers };
  },
  head: () => ({ meta: [{ title: "Purchases" }] }),
  component: Purchases,
});

function Purchases() {
  const { rows, suppliers } = Route.useLoaderData();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/purchases/" });
  const filtered = Boolean(s.status || s.supplier || s.from || s.to);
  return (
    <AppShell>
      <PageHeader
        title="Purchases"
        actions={
          <Link to="/purchases/new" className={buttonVariants()} data-testid="new-purchase">
            Register purchase
          </Link>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect
          aria-label="Status"
          data-testid="purchase-status-filter"
          value={s.status ?? "all"}
          onChange={(e) => navigate({ search: (o) => ({ ...o, status: e.target.value === "all" ? undefined : (e.target.value as "paid") }) })}
        >
          <NativeSelectOption value="all">Paid and unpaid</NativeSelectOption>
          <NativeSelectOption value="unpaid">Unpaid</NativeSelectOption>
          <NativeSelectOption value="paid">Paid</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Supplier"
          data-testid="purchase-supplier-filter"
          value={s.supplier ?? ""}
          onChange={(e) => navigate({ search: (o) => ({ ...o, supplier: e.target.value || undefined }) })}
        >
          <NativeSelectOption value="">All suppliers</NativeSelectOption>
          {suppliers.map((c) => (
            <NativeSelectOption key={c.id} value={c.id}>
              {c.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <Input
          type="date"
          aria-label="From"
          className="w-auto bg-card"
          value={s.from ?? ""}
          onChange={(e) => navigate({ search: (o) => ({ ...o, from: e.target.value || undefined }) })}
        />
        <span className="text-sm text-muted-foreground">to</span>
        <Input
          type="date"
          aria-label="To"
          className="w-auto bg-card"
          value={s.to ?? ""}
          onChange={(e) => navigate({ search: (o) => ({ ...o, to: e.target.value || undefined }) })}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {filtered ? "No purchases match." : "No purchases yet. Register one with its receipt and it appears here."}
        </p>
      ) : (
        <div className={panel}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id} data-testid="purchase-row">
                  <TableCell>{p.date}</TableCell>
                  <TableCell>{p.supplier}</TableCell>
                  <TableCell>
                    <Link to="/purchases/$id" params={{ id: p.id }} className="inline-flex items-center gap-1 font-medium hover:underline">
                      {p.description}
                      {p.hasReceipt ? <Paperclip className="size-3.5 text-muted-foreground" aria-label="Receipt" /> : null}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right"><Amount ore={p.grossOre} /></TableCell>
                  <TableCell>{p.paidDate ? "Paid" : `Due ${p.dueDate}`}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
