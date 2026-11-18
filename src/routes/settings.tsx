import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/client/components/ActionDialog";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Field, Section, note, panel } from "@/client/components/Section";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Textarea } from "@/client/components/ui/textarea";
import { errorMessage } from "@/client/lib/format";
import { createAccount, deleteAccount, getSettings, setAccountActive, setLockDate, updateCompany } from "@/serverFunctions/books";

export const Route = createFileRoute("/settings")({
  loader: () => getSettings(),
  head: () => ({ meta: [{ title: "Settings" }] }),
  component: Settings,
});

const TYPE_LABELS: Record<string, string> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  income: "Income",
  expense: "Cost",
};

function Settings() {
  const { company, accounts, isAdmin } = Route.useLoaderData();
  const router = useRouter();
  const [c, setC] = useState({ ...company, dueDays: String(company.dueDays) });
  const [lock, setLock] = useState(company.lockDate ?? "");
  const [account, setAccount] = useState({ number: "", name: "", type: "expense" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(work: () => Promise<unknown>, done?: string) {
    try {
      await work();
      await router.invalidate();
      if (done) toast.success(done);
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }

  return (
    <AppShell>
      <PageHeader title="Settings" description={isAdmin ? undefined : "Only admins can change these."} />
      <Section title="Company">
        <form
          className={`${panel} grid gap-4 p-5 sm:grid-cols-2`}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            setBusy(true);
            try {
              await updateCompany({
                data: {
                  name: c.name,
                  orgNumber: c.orgNumber,
                  address: c.address,
                  bankAccount: c.bankAccount,
                  dueDays: Number(c.dueDays),
                  vatRegistered: c.vatRegistered,
                },
              });
              await router.invalidate();
              toast.success("Company saved");
            } catch (cause) {
              setError(errorMessage(cause));
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={!isAdmin} className="contents">
            <Field label="Company name" htmlFor="company-name">
              <Input id="company-name" value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} />
            </Field>
            <Field label="Org. number" htmlFor="company-org">
              <Input id="company-org" value={c.orgNumber} onChange={(e) => setC({ ...c, orgNumber: e.target.value })} />
            </Field>
            <Field label="Address" htmlFor="company-address">
              <Textarea id="company-address" rows={2} value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} />
            </Field>
            <Field label="Bank account" htmlFor="company-bank">
              <Input id="company-bank" value={c.bankAccount} onChange={(e) => setC({ ...c, bankAccount: e.target.value })} />
            </Field>
            <Field label="Days until invoices are due" htmlFor="company-due">
              <Input id="company-due" type="number" min={0} max={365} value={c.dueDays} onChange={(e) => setC({ ...c, dueDays: e.target.value })} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox checked={c.vatRegistered} disabled={!isAdmin} onCheckedChange={(v) => setC({ ...c, vatRegistered: v === true })} data-testid="vat-registered" />
              VAT registered
            </label>
          </fieldset>
          {error ? (
            <Alert variant="destructive" className="sm:col-span-2">
              <AlertDescription data-testid="form-error">{error}</AlertDescription>
            </Alert>
          ) : null}
          {isAdmin ? (
            <div className="sm:col-span-2">
              <Button type="submit" pending={busy} data-testid="save-company">
                Save company
              </Button>
            </div>
          ) : null}
        </form>
      </Section>

      <Section title="Lock the books">
        <div className={`${panel} flex flex-wrap items-end gap-3 p-5`}>
          <Field label="Locked up to and including" htmlFor="lock-date">
            <Input id="lock-date" type="date" disabled={!isAdmin} value={lock} onChange={(e) => setLock(e.target.value)} />
          </Field>
          {isAdmin ? (
            <>
              <Button data-testid="save-lock" onClick={() => run(() => setLockDate({ data: { lockDate: lock || null } }), lock ? "Books locked" : "Lock removed")}>
                {lock ? "Lock" : "Remove lock"}
              </Button>
            </>
          ) : null}
          <p className={`${note} w-full`} data-testid="lock-status">
            {company.lockDate ? `Nothing dated on or before ${company.lockDate} can be posted or changed.` : "The books are open."}
          </p>
        </div>
      </Section>

      <Section
        title="Chart of accounts"
        actions={
          isAdmin ? (
            <ActionDialog
              trigger="Add account"
              testId="add-account"
              title="Add account"
              submitLabel="Add"
              onSubmit={async () => {
                await createAccount({ data: { ...account, type: account.type as "expense" } });
                setAccount({ number: "", name: "", type: "expense" });
                await router.invalidate();
              }}
            >
              <Field label="Number" htmlFor="account-number">
                <Input id="account-number" inputMode="numeric" maxLength={4} value={account.number} onChange={(e) => setAccount({ ...account, number: e.target.value })} />
              </Field>
              <Field label="Name" htmlFor="account-name">
                <Input id="account-name" value={account.name} onChange={(e) => setAccount({ ...account, name: e.target.value })} />
              </Field>
              <Field label="Type" htmlFor="account-type">
                <NativeSelect id="account-type" className="w-full" value={account.type} onChange={(e) => setAccount({ ...account, type: e.target.value })}>
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <NativeSelectOption key={v} value={v}>
                      {l}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </ActionDialog>
          ) : null
        }
      >
        <div className={panel}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.map((a) => (
                <TableRow key={a.number} data-testid={`account-${a.number}`}>
                  <TableCell className="font-medium">{a.number}</TableCell>
                  <TableCell>
                    {a.name} {!a.active ? <Badge variant="outline">Inactive</Badge> : null}
                  </TableCell>
                  <TableCell>{TYPE_LABELS[a.type]}</TableCell>
                  <TableCell className="text-right">
                    {isAdmin && !a.system ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => run(() => setAccountActive({ data: { number: a.number, active: !a.active } }))}>
                          {a.active ? "Deactivate" : "Activate"}
                        </Button>
                        {a.postings === 0 ? (
                          <Button size="sm" variant="ghost" data-testid={`delete-account-${a.number}`} onClick={() => run(() => deleteAccount({ data: { number: a.number } }))}>
                            Delete
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>
    </AppShell>
  );
}
