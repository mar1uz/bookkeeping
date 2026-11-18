import { useState } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Field, panel } from "@/client/components/Section";
import { LinesEditor, emptyLine, parseLines, toDrafts, type LineDraft, type LineValue } from "@/client/components/LinesEditor";
import { errorMessage, todayIso } from "@/client/lib/format";
import { INTERVALS, type Interval } from "@/server/money";

export interface TemplateValue {
  customerId: string;
  interval: Interval;
  startDate: string;
  endDate: string | null;
  autoEmail: boolean;
  lines: LineValue[];
}

export const INTERVAL_LABELS: Record<Interval, string> = {
  weekly: "Every week",
  monthly: "Every month",
  quarterly: "Every quarter",
  yearly: "Every year",
};

export const TEMPLATE_STATUS: Record<string, string> = { active: "Active", paused: "Paused", ended: "Ended" };

export function TemplateForm({
  initial,
  customers,
  accounts,
  vatRegistered,
  submitLabel,
  onSubmit,
}: {
  initial?: TemplateValue;
  customers: { id: string; name: string }[];
  accounts: { number: string; name: string; type: string; active: boolean }[];
  vatRegistered: boolean;
  submitLabel: string;
  onSubmit: (v: TemplateValue) => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState(initial?.customerId ?? "");
  const [interval, setInterval] = useState<Interval>(initial?.interval ?? "monthly");
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayIso());
  const [endDate, setEndDate] = useState(initial?.endDate ?? "");
  const [autoEmail, setAutoEmail] = useState(initial?.autoEmail ?? true);
  const [lines, setLines] = useState<LineDraft[]>(initial ? toDrafts(initial.lines) : [emptyLine(vatRegistered)]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
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
          await onSubmit({ customerId, interval, startDate, endDate: endDate || null, autoEmail, lines: parsed });
        } catch (cause) {
          setError(errorMessage(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className={`${panel} grid gap-4 p-5 sm:grid-cols-2`}>
        <Field label="Customer" htmlFor="template-customer">
          <NativeSelect id="template-customer" data-testid="customer" className="w-full" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <NativeSelectOption value="">Pick a customer</NativeSelectOption>
            {customers.map((c) => (
              <NativeSelectOption key={c.id} value={c.id}>
                {c.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Repeats" htmlFor="template-interval">
          <NativeSelect id="template-interval" data-testid="interval" className="w-full" value={interval} onChange={(e) => setInterval(e.target.value as Interval)}>
            {INTERVALS.map((i) => (
              <NativeSelectOption key={i} value={i}>
                {INTERVAL_LABELS[i]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
        <Field label="First invoice" htmlFor="template-start">
          <Input id="template-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="Last date (optional)" htmlFor="template-end">
          <Input id="template-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <Checkbox checked={autoEmail} onCheckedChange={(v) => setAutoEmail(v === true)} />
          Email each invoice to the customer
        </label>
      </div>
      <div className={`${panel} p-5`}>
        <LinesEditor
          lines={lines}
          onChange={setLines}
          incomeAccounts={accounts.filter((a) => a.type === "income" && a.active)}
          vatRegistered={vatRegistered}
        />
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription data-testid="form-error">{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" pending={busy} data-testid="save-template">
        {submitLabel}
      </Button>
    </form>
  );
}
