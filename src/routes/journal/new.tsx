import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Field, panel } from "@/client/components/Section";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Amount, errorMessage, todayIso } from "@/client/lib/format";
import { parseAmount } from "@/server/money";
import { createManualEntry, getAccounts } from "@/serverFunctions/books";

export const Route = createFileRoute("/journal/new")({
  loader: () => getAccounts(),
  head: () => ({ meta: [{ title: "Manual entry" }] }),
  component: ManualEntry,
});

interface Row {
  account: string;
  debit: string;
  credit: string;
}

function ManualEntry() {
  const accounts = Route.useLoaderData().filter((a) => a.active);
  const navigate = useNavigate();
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { account: "", debit: "", credit: "" },
    { account: "", debit: "", credit: "" },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sum = (key: "debit" | "credit") => rows.reduce((s, r) => s + (parseAmount(r[key]) ?? 0), 0);
  const debit = sum("debit");
  const credit = sum("credit");
  const set = (i: number, change: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...change } : r)));
  return (
    <AppShell>
      <PageHeader title="Manual entry" />
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const lines = rows
            .filter((r) => r.account || r.debit || r.credit)
            .map((r) => ({ account: r.account, debit: parseAmount(r.debit || "0") ?? -1, credit: parseAmount(r.credit || "0") ?? -1 }));
          if (lines.some((l) => l.debit < 0 || l.credit < 0)) return setError("Check the amounts.");
          setBusy(true);
          try {
            await createManualEntry({ data: { date, description, lines } });
            await navigate({ to: "/journal" });
          } catch (cause) {
            setError(errorMessage(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className={`${panel} grid gap-4 p-5 sm:grid-cols-[12rem_1fr]`}>
          <Field label="Date" htmlFor="entry-date">
            <Input id="entry-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="entry-description">
            <Input id="entry-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
        <div className={`${panel} space-y-2 p-5`}>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_7rem_7rem_auto] gap-2">
              <NativeSelect aria-label={`Line ${i + 1} account`} data-testid={`entry-account-${i}`} className="w-full" value={r.account} onChange={(e) => set(i, { account: e.target.value })}>
                <NativeSelectOption value="">Account</NativeSelectOption>
                {accounts.map((a) => (
                  <NativeSelectOption key={a.number} value={a.number}>
                    {a.number} {a.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <Input aria-label={`Line ${i + 1} debit`} data-testid={`entry-debit-${i}`} placeholder="Debit" inputMode="decimal" value={r.debit} onChange={(e) => set(i, { debit: e.target.value })} />
              <Input aria-label={`Line ${i + 1} credit`} data-testid={`entry-credit-${i}`} placeholder="Credit" inputMode="decimal" value={r.credit} onChange={(e) => set(i, { credit: e.target.value })} />
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} disabled={rows.length <= 2} onClick={() => setRows(rows.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, { account: "", debit: "", credit: "" }])}>
              <Plus /> Add line
            </Button>
            <p className="text-sm" data-testid="entry-totals">
              Debit <Amount ore={debit} /> · Credit <Amount ore={credit} />
              {debit !== credit ? <span className="text-destructive"> · Off by <Amount ore={Math.abs(debit - credit)} /></span> : null}
            </p>
          </div>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription data-testid="form-error">{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" pending={busy} data-testid="save-entry">
          Post entry
        </Button>
      </form>
    </AppShell>
  );
}
