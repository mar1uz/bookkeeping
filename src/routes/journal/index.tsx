import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { PeriodPicker, yearEnd, yearStart } from "@/client/components/PeriodPicker";
import { panel } from "@/client/components/Section";
import { SourceLink } from "@/client/components/SourceLink";
import { buttonVariants } from "@/client/components/ui/button";
import { Amount } from "@/client/lib/format";
import { getJournal } from "@/serverFunctions/books";

const search = z.object({ from: z.string().optional(), to: z.string().optional() });

export const Route = createFileRoute("/journal/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => getJournal({ data: { from: deps.from ?? yearStart(), to: deps.to ?? yearEnd() } }),
  head: () => ({ meta: [{ title: "Journal" }] }),
  component: Journal,
});

function Journal() {
  const vouchers = Route.useLoaderData();
  const s = Route.useSearch();
  const from = s.from ?? yearStart();
  const to = s.to ?? yearEnd();
  const navigate = useNavigate({ from: "/journal/" });
  return (
    <AppShell>
      <PageHeader
        title="Journal"
        actions={
          <>
            <Link to="/journal/ledger" className={buttonVariants({ variant: "outline" })}>
              Account ledger
            </Link>
            <a href={`/export/journal?from=${from}&to=${to}`} className={buttonVariants({ variant: "outline" })} data-testid="export-journal">
              Export CSV
            </a>
            <Link to="/journal/new" className={buttonVariants()} data-testid="new-entry">
              Manual entry
            </Link>
          </>
        }
      />
      <PeriodPicker from={from} to={to} onChange={(p) => navigate({ search: p })} />
      {vouchers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No entries in this period.</p>
      ) : (
        <div className="space-y-3">
          {vouchers.map((v) => (
            <div key={v.id} className={panel} data-testid="voucher">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border px-5 py-3 text-sm">
                <span className="font-medium">
                  Voucher {v.number} · {v.date} · {v.description}
                </span>
                <span className="text-muted-foreground">
                  <SourceLink v={v} />
                  {v.createdBy ? ` · ${v.createdBy}` : ""}
                </span>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {v.lines.map((l, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="px-5 py-1.5">
                        {l.account} {l.accountName}
                      </td>
                      <td className="w-32 px-5 py-1.5 text-right">{l.debit ? <Amount ore={l.debit} /> : ""}</td>
                      <td className="w-32 px-5 py-1.5 text-right">{l.credit ? <Amount ore={l.credit} /> : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
