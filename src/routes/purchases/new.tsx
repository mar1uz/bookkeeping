import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Field, panel } from "@/client/components/Section";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { addDaysIso, errorMessage, todayIso } from "@/client/lib/format";
import { uploadReceipt } from "@/client/lib/receipt";
import { VAT_CODES, VAT_CODE_LIST, parseAmount } from "@/server/money";
import { getSettings } from "@/serverFunctions/books";
import { pickContacts } from "@/serverFunctions/contacts";
import { createPurchase } from "@/serverFunctions/purchases";

export const Route = createFileRoute("/purchases/new")({
  loader: async () => {
    const [settings, suppliers] = await Promise.all([
      getSettings(),
      pickContacts({ data: { role: "supplier" } }),
    ]);
    return { settings, suppliers };
  },
  head: () => ({ meta: [{ title: "Register purchase" }] }),
  component: NewPurchase,
});

function NewPurchase() {
  const { settings, suppliers } = Route.useLoaderData();
  const navigate = useNavigate();
  const costAccounts = settings.accounts.filter((a) => a.active && (a.type === "expense" || a.type === "asset") && !a.system);
  const vatRegistered = settings.company.vatRegistered;
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [account, setAccount] = useState(costAccounts.find((a) => a.number === "6800")?.number ?? costAccounts[0]?.number ?? "");
  const [vatCode, setVatCode] = useState(vatRegistered ? "25" : "exempt");
  const [amount, setAmount] = useState("");
  const [paid, setPaid] = useState("now");
  const [dueDate, setDueDate] = useState(addDaysIso(todayIso(), 14));
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <AppShell>
      <PageHeader title="Register purchase" />
      <form
        className="space-y-6"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const grossOre = parseAmount(amount);
          if (!supplierId) return setError("Pick a supplier.");
          if (!grossOre || grossOre <= 0) return setError("Enter the amount including VAT.");
          setBusy(true);
          try {
            const { id } = await createPurchase({
              data: {
                supplierId,
                date,
                description,
                accountNumber: account,
                vatCode,
                grossOre,
                dueDate: paid === "now" ? date : dueDate,
                paidNow: paid === "now",
              },
            });
            if (file) await uploadReceipt(id, file);
            await navigate({ to: "/purchases/$id", params: { id } });
          } catch (cause) {
            setError(errorMessage(cause));
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className={`${panel} grid gap-4 p-5 sm:grid-cols-2`}>
          <Field label="Supplier" htmlFor="supplier">
            <NativeSelect id="supplier" data-testid="supplier" className="w-full" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <NativeSelectOption value="">Pick a supplier</NativeSelectOption>
              {suppliers.map((c) => (
                <NativeSelectOption key={c.id} value={c.id}>
                  {c.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Date" htmlFor="purchase-date">
            <Input id="purchase-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Description" htmlFor="purchase-description" className="sm:col-span-2">
            <Input id="purchase-description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Account" htmlFor="purchase-account">
            <NativeSelect id="purchase-account" data-testid="purchase-account" className="w-full" value={account} onChange={(e) => setAccount(e.target.value)}>
              {costAccounts.map((a) => (
                <NativeSelectOption key={a.number} value={a.number}>
                  {a.number} {a.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="VAT" htmlFor="purchase-vat">
            <NativeSelect id="purchase-vat" data-testid="purchase-vat" className="w-full" value={vatCode} onChange={(e) => setVatCode(e.target.value)}>
              {(vatRegistered ? VAT_CODE_LIST : (["exempt"] as const)).map((c) => (
                <NativeSelectOption key={c} value={c}>
                  {VAT_CODES[c].label}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Amount incl. VAT (NOK)" htmlFor="purchase-amount">
            <Input id="purchase-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Payment" htmlFor="purchase-paid">
            <NativeSelect id="purchase-paid" data-testid="purchase-paid" className="w-full" value={paid} onChange={(e) => setPaid(e.target.value)}>
              <NativeSelectOption value="now">Paid from the bank account</NativeSelectOption>
              <NativeSelectOption value="later">Not paid yet</NativeSelectOption>
            </NativeSelect>
          </Field>
          {paid === "later" ? (
            <Field label="Due date" htmlFor="purchase-due">
              <Input id="purchase-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>
          ) : null}
          <Field label="Receipt (photo or PDF)" htmlFor="purchase-receipt" className="sm:col-span-2">
            <Input
              id="purchase-receipt"
              type="file"
              accept="image/*,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription data-testid="form-error">{error}</AlertDescription>
          </Alert>
        ) : null}
        <Button type="submit" pending={busy} data-testid="save-purchase">
          Save purchase
        </Button>
      </form>
    </AppShell>
  );
}
