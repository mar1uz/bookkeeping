import { useState } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Textarea } from "@/client/components/ui/textarea";
import { Field } from "@/client/components/Section";
import { errorMessage } from "@/client/lib/format";

export interface ContactValue {
  name: string;
  orgNumber: string;
  email: string;
  address: string;
  isCustomer: boolean;
  isSupplier: boolean;
}

export function ContactForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: ContactValue;
  submitLabel: string;
  onSubmit: (value: ContactValue) => Promise<void>;
}) {
  const [v, setV] = useState<ContactValue>(
    initial ?? { name: "", orgNumber: "", email: "", address: "", isCustomer: true, isSupplier: false },
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (change: Partial<ContactValue>) => setV((old) => ({ ...old, ...change }));
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setBusy(true);
        try {
          await onSubmit(v);
        } catch (cause) {
          setError(errorMessage(cause));
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="contact-name">
          <Input id="contact-name" value={v.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Org. number" htmlFor="contact-org">
          <Input id="contact-org" value={v.orgNumber} onChange={(e) => set({ orgNumber: e.target.value })} />
        </Field>
        <Field label="Email" htmlFor="contact-email">
          <Input id="contact-email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} />
        </Field>
        <Field label="Address" htmlFor="contact-address">
          <Textarea id="contact-address" rows={2} value={v.address} onChange={(e) => set({ address: e.target.value })} />
        </Field>
      </div>
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox checked={v.isCustomer} onCheckedChange={(c) => set({ isCustomer: c === true })} data-testid="is-customer" />
          Customer
        </label>
        <label className="flex items-center gap-2">
          <Checkbox checked={v.isSupplier} onCheckedChange={(c) => set({ isSupplier: c === true })} data-testid="is-supplier" />
          Supplier
        </label>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription data-testid="form-error">{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button type="submit" pending={busy} data-testid="save-contact">
        {submitLabel}
      </Button>
    </form>
  );
}
