import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { panel } from "@/client/components/Section";
import { INTERVAL_LABELS, TEMPLATE_STATUS } from "@/client/components/TemplateForm";
import { Badge } from "@/client/components/ui/badge";
import { buttonVariants } from "@/client/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Amount } from "@/client/lib/format";
import type { Interval } from "@/server/money";
import { getTemplates } from "@/serverFunctions/invoices";

export const Route = createFileRoute("/recurring/")({
  loader: () => getTemplates(),
  head: () => ({ meta: [{ title: "Recurring invoices" }] }),
  component: Recurring,
});


function Recurring() {
  const rows = Route.useLoaderData();
  return (
    <AppShell>
      <PageHeader
        title="Recurring invoices"
        actions={
          <Link to="/recurring/new" className={buttonVariants()} data-testid="new-template">
            New recurring invoice
          </Link>
        }
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No recurring invoices yet. Create one and it issues invoices on its schedule.
        </p>
      ) : (
        <div className={panel}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Repeats</TableHead>
                <TableHead>Next invoice</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => (
                <TableRow key={t.id} data-testid="template-row">
                  <TableCell>
                    <Link to="/recurring/$id" params={{ id: t.id }} className="font-medium hover:underline">
                      {t.customer}
                    </Link>
                  </TableCell>
                  <TableCell>{INTERVAL_LABELS[t.interval as Interval]}</TableCell>
                  <TableCell>{t.status === "ended" ? "" : t.nextDate}</TableCell>
                  <TableCell className="text-right"><Amount ore={t.grossOre} /></TableCell>
                  <TableCell>
                    <Badge variant={t.status === "active" ? "default" : "outline"}>{TEMPLATE_STATUS[t.status]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
