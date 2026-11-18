import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { PeriodPicker, yearEnd, yearStart } from "@/client/components/PeriodPicker";
import { panel } from "@/client/components/Section";
import { SourceLink } from "@/client/components/SourceLink";
import { buttonVariants } from "@/client/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Amount } from "@/client/lib/format";
import { getAccounts, getGeneralLedger } from "@/serverFunctions/books";

const search = z.object({ account: z.coerce.string().optional(), from: z.string().optional(), to: z.string().optional() });

export const Route = createFileRoute("/journal/ledger")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const account = deps.account ?? "1920";
    const [accounts, ledger] = await Promise.all([
      getAccounts(),
      getGeneralLedger({ data: { account, from: deps.from ?? yearStart(), to: deps.to ?? yearEnd() } }),
    ]);
    return { accounts, ledger };
  },
  head: () => ({ meta: [{ title: "Account ledger" }] }),
  component: Ledger,
});

function Ledger() {
  const { accounts, ledger } = Route.useLoaderData();
  const s = Route.useSearch();
  const from = s.from ?? yearStart();
  const to = s.to ?? yearEnd();
  const navigate = useNavigate({ from: "/journal/ledger" });
  return (
    <AppShell>
      <PageHeader
        title="Account ledger"
        actions={
          <a href={`/export/ledger?account=${ledger.account.number}&from=${from}&to=${to}`} className={buttonVariants({ variant: "outline" })}>
            Export CSV
          </a>
        }
      />
      <div className="flex flex-wrap gap-2">
        <NativeSelect aria-label="Account" data-testid="ledger-account" value={ledger.account.number} onChange={(e) => navigate({ search: (o) => ({ ...o, account: e.target.value }) })}>
          {accounts.map((a) => (
            <NativeSelectOption key={a.number} value={a.number}>
              {a.number} {a.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <PeriodPicker from={from} to={to} onChange={(p) => navigate({ search: (o) => ({ ...o, ...p }) })} />
      </div>
      <div className={panel}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Voucher</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
              <TableHead className="text-right">Balance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>{from}</TableCell>
              <TableCell />
              <TableCell className="text-muted-foreground">Opening balance</TableCell>
              <TableCell />
              <TableCell />
              <TableCell className="text-right"><Amount ore={ledger.openingBalance} /></TableCell>
            </TableRow>
            {ledger.lines.map((l, i) => (
              <TableRow key={i} data-testid="ledger-line">
                <TableCell>{l.date}</TableCell>
                <TableCell>{l.number}</TableCell>
                <TableCell>
                  {l.description} · <SourceLink v={l} />
                </TableCell>
                <TableCell className="text-right">{l.debit ? <Amount ore={l.debit} /> : ""}</TableCell>
                <TableCell className="text-right">{l.credit ? <Amount ore={l.credit} /> : ""}</TableCell>
                <TableCell className="text-right"><Amount ore={l.balance} /></TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell colSpan={5} className="font-medium">Closing balance</TableCell>
              <TableCell className="text-right font-medium" data-testid="closing-balance"><Amount ore={ledger.closingBalance} /></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
