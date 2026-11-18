import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/client/components/ActionDialog";
import { AppShell } from "@/client/components/AppShell";
import { InvoiceDocument } from "@/client/components/InvoiceDocument";
import { InvoiceForm } from "@/client/components/InvoiceForm";
import { PageHeader } from "@/client/components/PageHeader";
import { Field, Section, note, panel } from "@/client/components/Section";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { Checkbox } from "@/client/components/ui/checkbox";
import { Input } from "@/client/components/ui/input";
import { Amount, StatusBadge, errorMessage, todayIso } from "@/client/lib/format";
import { parseAmount, plainOre } from "@/server/money";
import { getSettings } from "@/serverFunctions/books";
import { pickContacts } from "@/serverFunctions/contacts";
import {
  creditInvoice,
  deleteDraft,
  getInvoice,
  issueInvoice,
  registerPayment,
  resendInvoice,
  sendReminder,
  updateDraft,
} from "@/serverFunctions/invoices";

export const Route = createFileRoute("/invoices/$id")({
  loader: async ({ params }) => {
    const [invoice, settings, customers] = await Promise.all([
      getInvoice({ data: { id: params.id } }),
      getSettings(),
      pickContacts({ data: { role: "customer" } }),
    ]);
    return { invoice, settings, customers };
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.invoice?.number ? `Invoice ${loaderData.invoice.number}` : "Invoice" }],
  }),
  component: InvoicePage,
});

function InvoicePage() {
  const { invoice, settings, customers } = Route.useLoaderData();
  if (!invoice) {
    return (
      <AppShell>
        <div data-testid="not-found">
          <PageHeader title="Invoice not found" />
        </div>
      </AppShell>
    );
  }
  return invoice.state === "draft" ? (
    <Draft invoice={invoice} settings={settings} customers={customers} />
  ) : (
    <Issued invoice={invoice} />
  );
}

type Invoice = NonNullable<Awaited<ReturnType<typeof getInvoice>>>;
type Data = {
  settings: Awaited<ReturnType<typeof getSettings>>;
  customers: Awaited<ReturnType<typeof pickContacts>>;
};

function Draft({
  invoice,
  settings,
  customers,
}: {
  invoice: Invoice;
  settings: Data["settings"];
  customers: Data["customers"];
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const [email, setEmail] = useState(Boolean(invoice.customer.email));
  const pickable = customers.some((c) => c.id === invoice.customerId)
    ? customers
    : [{ id: invoice.customerId, name: invoice.customer.name, email: invoice.customer.email }, ...customers];
  return (
    <AppShell>
      <PageHeader
        title="Draft invoice"
        description={<StatusBadge status="draft" />}
        actions={
          <ActionDialog
            trigger="Delete draft"
            triggerVariant="ghost"
            title="Delete this draft?"
            submitLabel="Delete"
            destructive
            onSubmit={async () => {
              await deleteDraft({ data: { id: invoice.id } });
              await navigate({ to: "/invoices" });
            }}
          />
        }
      />
      <InvoiceForm
        key={invoice.id}
        initial={{
          customerId: invoice.customerId,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          lines: invoice.lines,
        }}
        customers={pickable}
        accounts={settings.accounts}
        company={settings.company}
        submitLabel="Save draft"
        onSubmit={async (value) => {
          await updateDraft({ data: { id: invoice.id, ...value } });
          await router.invalidate();
          toast.success("Draft saved");
        }}
      />
      <Section title="Issue">
        <div className={`${panel} flex flex-wrap items-center justify-between gap-4 p-5`}>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={email}
              disabled={!invoice.customer.email}
              onCheckedChange={(v) => setEmail(v === true)}
              data-testid="issue-email"
            />
            {invoice.customer.email
              ? `Email it to ${invoice.customer.email}`
              : "The customer has no email address"}
          </label>
          <ActionDialog
            trigger="Issue invoice"
            triggerVariant="default"
            testId="issue"
            title="Issue this invoice?"
            description="It gets the next invoice number and is posted to the books. After that it can only be cancelled with a credit note."
            submitLabel="Issue"
            onSubmit={async () => {
              await issueInvoice({ data: { id: invoice.id, email } });
              await router.invalidate();
            }}
          />
        </div>
      </Section>
    </AppShell>
  );
}

function Issued({ invoice }: { invoice: Invoice }) {
  const router = useRouter();
  const balance = invoice.grossOre - invoice.paidOre;
  const [amount, setAmount] = useState(plainOre(balance));
  const [date, setDate] = useState(todayIso());
  const [creditDate, setCreditDate] = useState(todayIso());
  const isInvoice = invoice.kind === "invoice";
  const open = isInvoice && invoice.state === "issued" && balance > 0;
  const publicUrl = invoice.publicUrl;

  async function email(kind: "reminder" | "invoice") {
    try {
      const result =
        kind === "reminder"
          ? await sendReminder({ data: { id: invoice.id } })
          : await resendInvoice({ data: { id: invoice.id } });
      if (result.sent) toast.success(kind === "reminder" ? "Reminder sent" : "Invoice sent");
      else toast.error(result.detail);
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
    await router.invalidate();
  }

  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/invoices" className="text-sm text-muted-foreground hover:text-foreground">
            ‹ Invoices
          </Link>
        }
        title={`${isInvoice ? "Invoice" : "Credit note"} ${invoice.number}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={invoice.status} />
            <span>{invoice.customer.name}</span>
            {invoice.voucherNumber ? <span>· Voucher {invoice.voucherNumber}</span> : null}
          </span>
        }
        actions={
          <>
            <Link to="/print/$id" params={{ id: invoice.id }} className={buttonVariants({ variant: "outline" })}>
              Print
            </Link>
            {open ? (
              <ActionDialog
                trigger="Register payment"
                triggerVariant="default"
                testId="register-payment"
                title="Register payment"
                submitLabel="Register"
                onSubmit={async () => {
                  const ore = parseAmount(amount);
                  if (!ore || ore <= 0) throw new Error("Enter an amount above zero.");
                  await registerPayment({ data: { invoiceId: invoice.id, date, amountOre: ore } });
                  await router.invalidate();
                }}
              >
                <Field label="Date" htmlFor="payment-date">
                  <Input id="payment-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Amount (NOK)" htmlFor="payment-amount">
                  <Input
                    id="payment-amount"
                    data-testid="payment-amount"
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </Field>
              </ActionDialog>
            ) : null}
            {invoice.status === "overdue" ? (
              <Button variant="outline" data-testid="send-reminder" onClick={() => email("reminder")}>
                Send reminder
              </Button>
            ) : null}
            {isInvoice && invoice.state === "issued" ? (
              <ActionDialog
                trigger="Credit"
                testId="credit"
                title="Cancel with a credit note?"
                description="The credit note reverses the whole invoice in the books and closes it."
                submitLabel="Create credit note"
                destructive
                onSubmit={async () => {
                  await creditInvoice({ data: { id: invoice.id, date: creditDate } });
                  await router.invalidate();
                }}
              >
                <Field label="Credit note date" htmlFor="credit-date">
                  <Input id="credit-date" type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
          </>
        }
      />

      {invoice.related ? (
        <p className="text-sm">
          {isInvoice ? "Cancelled by " : "Cancels "}
          <Link to="/invoices/$id" params={{ id: invoice.related.id }} className="font-medium underline" data-testid="related-link">
            {isInvoice ? "credit note" : "invoice"} {invoice.related.number}
          </Link>
        </p>
      ) : null}

      <Section title="Customer link">
        <div className="flex flex-wrap gap-2">
          <Input readOnly value={publicUrl} data-testid="public-link" className="max-w-xl bg-card" aria-label="Customer link" />
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(publicUrl);
              toast.success("Link copied");
            }}
          >
            Copy
          </Button>
          <Button variant="outline" onClick={() => email("invoice")} disabled={!invoice.customer.email}>
            Email to customer
          </Button>
        </div>
      </Section>

      <InvoiceDocument doc={invoice} />

      {isInvoice ? (
        <Section title="Payments">
          {invoice.payments.length === 0 ? (
            <p className={note}>No payments yet.</p>
          ) : (
            <ul className={`${panel} divide-y divide-border text-sm`} data-testid="payments">
              {invoice.payments.map((p) => (
                <li key={p.id} className="flex justify-between px-5 py-3">
                  <span>{p.date}</span>
                  <Amount ore={p.amountOre} />
                </li>
              ))}
              <li className="flex justify-between px-5 py-3 font-medium">
                <span>Balance</span>
                <Amount ore={balance} />
              </li>
            </ul>
          )}
        </Section>
      ) : null}

      {invoice.messages.length ? (
        <Section title="Emails">
          <ul className={`${panel} divide-y divide-border text-sm`} data-testid="messages">
            {invoice.messages.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 px-5 py-3">
                <span>
                  {m.kind === "reminder" ? "Reminder" : "Invoice"} to {m.recipient || "no address"}
                  {m.by ? ` by ${m.by}` : ""}
                </span>
                <span className={m.sent ? "" : "text-destructive"}>
                  {m.sent ? "Sent" : `Not sent: ${m.detail}`} · {m.createdAt.slice(0, 16)}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </AppShell>
  );
}
