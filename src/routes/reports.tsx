import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { PeriodPicker, yearEnd, yearStart } from "@/client/components/PeriodPicker";
import { Section, panel } from "@/client/components/Section";
import { buttonVariants } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/client/components/ui/tabs";
import { Amount } from "@/client/lib/format";
import { termOf, vatTerm } from "@/server/money";
import { getBalanceSheet, getProfitAndLoss, getVatReport } from "@/serverFunctions/books";

const search = z.object({
  view: z.enum(["profit", "balance", "vat"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  year: z.number().optional(),
  term: z.number().optional(),
});

export const Route = createFileRoute("/reports")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    const view = deps.view ?? "profit";
    const from = deps.from ?? yearStart();
    const to = deps.to ?? yearEnd();
    const now = termOf(new Date().toISOString().slice(0, 10));
    const year = deps.year ?? now.year;
    const term = deps.term ?? now.term;
    if (view === "balance") return { view, balance: await getBalanceSheet({ data: { to } }) } as const;
    if (view === "vat") return { view, vat: await getVatReport({ data: { year, term } }) } as const;
    return { view, profit: await getProfitAndLoss({ data: { from, to } }) } as const;
  },
  head: () => ({ meta: [{ title: "Reports" }] }),
  component: Reports,
});

type Row = { number: string; name: string; amount: number };

function Rows({ rows, total, totalLabel, testId }: { rows: Row[]; total: number; totalLabel: string; testId?: string }) {
  return (
    <table className={`${panel} w-full text-sm`}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.number} className="border-b border-border">
            <td className="px-5 py-2">{r.number} {r.name}</td>
            <td className="px-5 py-2 text-right"><Amount ore={r.amount} /></td>
          </tr>
        ))}
        <tr>
          <td className="px-5 py-2 font-medium">{totalLabel}</td>
          <td className="px-5 py-2 text-right font-medium" data-testid={testId}><Amount ore={total} /></td>
        </tr>
      </tbody>
    </table>
  );
}

function Reports() {
  const data = Route.useLoaderData();
  const s = Route.useSearch();
  const navigate = useNavigate({ from: "/reports" });
  const from = s.from ?? yearStart();
  const to = s.to ?? yearEnd();
  let exportHref = "";
  if (data.view === "profit") exportHref = `/export/profit-and-loss?from=${from}&to=${to}`;
  if (data.view === "balance") exportHref = `/export/balance-sheet?to=${to}`;
  if (data.view === "vat") exportHref = `/export/vat?year=${data.vat.year}&term=${data.vat.term}`;
  return (
    <AppShell>
      <PageHeader
        title="Reports"
        actions={
          <a href={exportHref} className={buttonVariants({ variant: "outline" })} data-testid="export-report">
            Export CSV
          </a>
        }
      />
      <Tabs value={data.view} onValueChange={(v) => navigate({ search: (o) => ({ ...o, view: v as "profit" }) })}>
        <TabsList>
          <TabsTrigger value="profit">Profit and loss</TabsTrigger>
          <TabsTrigger value="balance">Balance sheet</TabsTrigger>
          <TabsTrigger value="vat" data-testid="tab-vat">VAT</TabsTrigger>
        </TabsList>
      </Tabs>

      {data.view === "profit" ? (
        <>
          <PeriodPicker from={from} to={to} onChange={(p) => navigate({ search: (o) => ({ ...o, ...p }) })} />
          <Section title="Income">
            <Rows rows={data.profit.income} total={data.profit.totalIncome} totalLabel="Total income" testId="total-income" />
          </Section>
          <Section title="Costs">
            <Rows rows={data.profit.expenses} total={data.profit.totalExpenses} totalLabel="Total costs" testId="total-costs" />
          </Section>
          <div className={`${panel} flex justify-between px-5 py-4 font-semibold`}>
            <span>Result</span>
            <span data-testid="result"><Amount ore={data.profit.result} /></span>
          </div>
        </>
      ) : null}

      {data.view === "balance" ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">As of</span>
            <Input type="date" aria-label="As of" className="w-auto bg-card" value={to} onChange={(e) => e.target.value && navigate({ search: (o) => ({ ...o, to: e.target.value }) })} />
          </div>
          <Section title="Assets">
            <Rows rows={data.balance.assets} total={data.balance.totalAssets} totalLabel="Total assets" testId="total-assets" />
          </Section>
          <Section title="Equity">
            <Rows
              rows={[...data.balance.equity, { number: "", name: "Result not yet closed", amount: data.balance.result }]}
              total={data.balance.totalEquity}
              totalLabel="Total equity"
            />
          </Section>
          <Section title="Liabilities">
            <Rows rows={data.balance.liabilities} total={data.balance.totalLiabilities} totalLabel="Total liabilities" />
          </Section>
          <div className={`${panel} flex justify-between px-5 py-4 font-semibold`}>
            <span>Equity and liabilities</span>
            <span data-testid="total-equity-liabilities"><Amount ore={data.balance.totalEquity + data.balance.totalLiabilities} /></span>
          </div>
        </>
      ) : null}

      {data.view === "vat" ? (
        <>
          <div className="flex flex-wrap gap-2">
            <NativeSelect aria-label="Term" data-testid="vat-term" value={String(data.vat.term)} onChange={(e) => navigate({ search: (o) => ({ ...o, year: data.vat.year, term: Number(e.target.value) }) })}>
              {[1, 2, 3, 4, 5, 6].map((t) => (
                <NativeSelectOption key={t} value={String(t)}>
                  {vatTerm(data.vat.year, t).label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input type="number" aria-label="Year" className="w-28 bg-card" value={data.vat.year} onChange={(e) => Number(e.target.value) > 1999 && navigate({ search: (o) => ({ ...o, year: Number(e.target.value), term: data.vat.term }) })} />
          </div>
          <p className="text-sm" data-testid="vat-deadline">
            {data.vat.label} · Filing deadline {data.vat.deadline}
          </p>
          <Section title="Sales">
            <VatTable rows={data.vat.sales} />
          </Section>
          <Section title="Purchases">
            <VatTable rows={data.vat.purchases} />
          </Section>
          <dl className={`${panel} grid grid-cols-[1fr_auto] gap-y-2 px-5 py-4 text-sm`}>
            <dt>Output VAT</dt>
            <dd className="text-right" data-testid="output-vat"><Amount ore={data.vat.outputVat} /></dd>
            <dt>Input VAT</dt>
            <dd className="text-right" data-testid="input-vat"><Amount ore={data.vat.inputVat} /></dd>
            <dt className="font-semibold">{data.vat.payable >= 0 ? "To pay" : "To get back"}</dt>
            <dd className="text-right font-semibold" data-testid="vat-payable"><Amount ore={Math.abs(data.vat.payable)} /></dd>
          </dl>
        </>
      ) : null}
    </AppShell>
  );
}

function VatTable({ rows }: { rows: { code: string; label: string; base: number; vat: number }[] }) {
  return (
    <table className={`${panel} w-full text-sm`}>
      <thead>
        <tr className="border-b border-border text-muted-foreground">
          <th className="px-5 py-2 text-left font-medium">Rate</th>
          <th className="px-5 py-2 text-right font-medium">Base</th>
          <th className="px-5 py-2 text-right font-medium">VAT</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.code} className="border-b border-border last:border-0">
            <td className="px-5 py-2">{r.label}</td>
            <td className="px-5 py-2 text-right"><Amount ore={r.base} /></td>
            <td className="px-5 py-2 text-right"><Amount ore={r.vat} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
