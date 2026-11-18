import { useState } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Field, panel } from "@/client/components/Section";
import {
  LinesEditor,
  emptyLine,
  parseLines,
  toDrafts,
  type LineDraft,
  type LineValue,
} from "@/client/components/LinesEditor";
import { addDaysIso, errorMessage, todayIso } from "@/client/lib/format";

export interface InvoiceFormValue {
  customerId: string;
  issueDate: string;
  dueDate: string;
  lines: LineValue[];
}

export function InvoiceForm({
  initial,
  customers,
  accounts,
  company,
  submitLabel,
  onSubmit,
}: {
  initial?: InvoiceFormValue;
  customers: { id: string; name: string }[];
  accounts: { number: string; name: string; type: string; active: boolean }[];
  company: { dueDays: number; vatRegistered: boolean };
  submitLabel: string;
  onSubmit: (value: InvoiceFormValue) => Promise<void>;
}) {
  const start = todayIso();
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [issueDate, setIssueDate] = useState(initial?.issueDate ?? start);
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? addDaysIso(start, company.dueDays));
  const [lines, setLines] = useState<LineDraft[]>(
    initial ? toDrafts(initial.lines) : [emptyLine(company.vatRegistered)],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const income = accounts.filter((a) => a.type === "income" && a.active);

  return (
    <form
      className="space-y-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const parsed = parseLines(lines);
        if (typeof parsed === "string") return setError(parsed);
        if (!customerId) return setError("Pick a customer.");
        setBusy(true);
        try {
          await onSubmit({ customerId, issueDate, dueDate, lines: parsed });
        } catch (cause) {
          setError(errorMessage(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={`${panel} grid gap-4 p-5 sm:grid-cols-3`}>
        <Field label="Customer" htmlFor="customer">
          <NativeSelect
            id="customer"
            data-testid="customer"
            className="w-full"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            <NativeSelectOption value="">Pick a customer</NativeSelectOption>
            {customers.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Invoice date" htmlFor="issue-date">
          <Input
            id="issue-date"
            type="date"
            value={issueDate}
            onChange={(e) => {
              setIssueDate(e.target.value);
              if (e.target.value) setDueDate(addDaysIso(e.target.value, company.dueDays));
            }}
          />
        </Field>
        <Field label="Due date" htmlFor="due-date">
          <Input
            id="due-date"
            type="date"
            data-testid="due-date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
          />
        </Field>
      </div>
      <div className={`${panel} p-5`}>
        <LinesEditor
          lines={lines}
          onChange={setLines}
          incomeAccounts={income}
          vatRegistered={company.vatRegistered}
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription data-testid="form-error">{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" pending={busy} data-testid="save-invoice">
        {submitLabel}
      </Button>
    </form>
  );
}
