import { Link, createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Section, note, panel } from "@/client/components/Section";
import { buttonVariants } from "@/client/components/ui/button";
import { Amount } from "@/client/lib/format";
import { getDashboard } from "@/serverFunctions/books";

export const Route = createFileRoute("/")({
  loader: () => getDashboard(),
  head: () => ({ meta: [{ title: "Bookkeeping" }] }),
  component: Overview,
});

function Overview() {
  const d = Route.useLoaderData();
  const tiles = [
    { label: "Bank", ore: d.bank, id: "bank" },
    { label: "Customers owe", ore: d.receivables, id: "receivables" },
    { label: "We owe suppliers", ore: d.payables, id: "payables" },
    { label: `Result ${d.year}`, ore: d.result, id: "result" },
  ];
  const deadlines = [
    ...d.vatDeadlines.map((t) => ({ key: `vat-${t.year}-${t.term}`, date: t.deadline, text: `VAT return for ${t.label}`, to: null as null | { id: string; kind: "invoice" | "purchase" } })),
    ...d.overdueInvoices.map((i) => ({ key: i.id, date: i.dueDate, text: `Invoice ${i.number} to ${i.customer} is overdue`, to: { id: i.id, kind: "invoice" as const }, ore: i.grossOre - i.paidOre })),
    ...d.invoicesDueSoon.map((i) => ({ key: i.id, date: i.dueDate, text: `Invoice ${i.number} to ${i.customer} is due`, to: { id: i.id, kind: "invoice" as const }, ore: i.grossOre - i.paidOre })),
    ...d.billsDue.map((b) => ({ key: b.id, date: b.dueDate, text: `Pay ${b.supplier}: ${b.description}`, to: { id: b.id, kind: "purchase" as const }, ore: b.grossOre })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  return (
    <AppShell>
      <PageHeader
        title={d.companyName || "Overview"}
        actions={
          <>
            <Link to="/purchases/new" className={buttonVariants({ variant: "outline" })}>
              Register purchase
            </Link>
            <Link to="/invoices/new" className={buttonVariants()}>
              New invoice
            </Link>
          </>
        }
      />
      {!d.companyName ? (
        <p className={`${panel} p-5 text-sm`}>
          Fill in the company profile under{" "}
          <Link to="/settings" className="font-medium underline">
            Settings
          </Link>{" "}
          before issuing invoices.
        </p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.id} className={`${panel} space-y-1 p-4`}>
            <dt className={note}>{t.label}</dt>
            <dd className="text-xl font-semibold" data-testid={`tile-${t.id}`}>
              <Amount ore={t.ore} />
            </dd>
          </div>
        ))}
      </dl>
      <Section title="Coming up">
        {deadlines.length === 0 ? (
          <p className={note}>Nothing due in the next two weeks.</p>
        ) : (
          <ul className={`${panel} divide-y divide-border text-sm`} data-testid="deadlines">
            {deadlines.map((x) => (
              <li key={x.key} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <span>
                  <span className="mr-3 tabular-nums text-muted-foreground">{x.date}</span>
                  {x.to?.kind === "invoice" ? (
                    <Link to="/invoices/$id" params={{ id: x.to.id }} className="hover:underline">{x.text}</Link>
                  ) : x.to?.kind === "purchase" ? (
                    <Link to="/purchases/$id" params={{ id: x.to.id }} className="hover:underline">{x.text}</Link>
                  ) : (
                    <Link to="/reports" search={{ view: "vat" }} className="hover:underline">{x.text}</Link>
                  )}
                </span>
                {"ore" in x && typeof x.ore === "number" ? <Amount ore={x.ore} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </AppShell>
  );
}
