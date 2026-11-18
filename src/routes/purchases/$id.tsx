import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { ActionDialog } from "@/client/components/ActionDialog";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Field, Section, note, panel } from "@/client/components/Section";
import { Badge } from "@/client/components/ui/badge";
import { Input } from "@/client/components/ui/input";
import { Amount, errorMessage, todayIso } from "@/client/lib/format";
import { uploadReceipt } from "@/client/lib/receipt";
import { VAT_CODES, type VatCode } from "@/server/money";
import { deletePurchase, getPurchase, payPurchase } from "@/serverFunctions/purchases";

export const Route = createFileRoute("/purchases/$id")({
  loader: ({ params }) => getPurchase({ data: { id: params.id } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.description ?? "Purchase" }] }),
  component: PurchasePage,
});

function PurchasePage() {
  const p = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [payDate, setPayDate] = useState(todayIso());
  const [uploading, setUploading] = useState(false);
  if (!p) {
    return (
      <AppShell>
        <PageHeader title="Purchase not found" />
      </AppShell>
    );
  }
  const receiptUrl = `/api/purchases/${p.id}/receipt`;
  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/purchases" className="text-sm text-muted-foreground hover:text-foreground">
            ‹ Purchases
          </Link>
        }
        title={p.description}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={p.paidDate ? "default" : "secondary"} data-testid="purchase-status">
              {p.paidDate ? "Paid" : "Unpaid"}
            </Badge>
            <span>{p.supplier}</span>
            {p.locked ? <Badge variant="outline">Locked period</Badge> : null}
          </span>
        }
        actions={
          <>
            {!p.paidDate && !p.locked ? (
              <ActionDialog
                trigger="Register paid"
                triggerVariant="default"
                testId="pay-purchase"
                title="Register payment"
                description={<>Pays <Amount ore={p.grossOre} /> from the bank account.</>}
                submitLabel="Register"
                onSubmit={async () => {
                  await payPurchase({ data: { id: p.id, date: payDate } });
                  await router.invalidate();
                }}
              >
                <Field label="Payment date" htmlFor="pay-date">
                  <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </Field>
              </ActionDialog>
            ) : null}
            {p.canDelete ? (
              <ActionDialog
                trigger="Delete"
                triggerVariant="ghost"
                testId="delete-purchase"
                title="Delete this purchase?"
                description="Its entries are reversed in the books."
                submitLabel="Delete"
                destructive
                onSubmit={async () => {
                  await deletePurchase({ data: { id: p.id } });
                  await navigate({ to: "/purchases" });
                }}
              />
            ) : null}
          </>
        }
      />
      <dl className={`${panel} grid gap-x-6 gap-y-3 p-5 text-sm sm:grid-cols-[auto_1fr]`}>
        <dt className="text-muted-foreground">Date</dt>
        <dd>{p.date}</dd>
        <dt className="text-muted-foreground">Account</dt>
        <dd>{p.accountNumber}</dd>
        <dt className="text-muted-foreground">VAT</dt>
        <dd>{VAT_CODES[p.vatCode as VatCode]?.label}: <Amount ore={p.vatOre} /></dd>
        <dt className="text-muted-foreground">Amount incl. VAT</dt>
        <dd className="font-medium" data-testid="purchase-amount"><Amount ore={p.grossOre} /></dd>
        <dt className="text-muted-foreground">{p.paidDate ? "Paid" : "Due"}</dt>
        <dd>{p.paidDate ?? p.dueDate}</dd>
        <dt className="text-muted-foreground">Vouchers</dt>
        <dd>
          {[p.voucherNumber, p.paymentVoucherNumber].filter(Boolean).join(", ")}
        </dd>
        {p.createdBy ? (
          <>
            <dt className="text-muted-foreground">Registered by</dt>
            <dd>{p.createdBy}</dd>
          </>
        ) : null}
      </dl>
      <Section title="Receipt">
        {p.hasReceipt ? (
          <div className="space-y-3">
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="text-sm font-medium underline" data-testid="receipt-link">
              {p.receiptName}
            </a>
            {p.receiptType?.startsWith("image/") ? (
              <img src={receiptUrl} alt={p.receiptName ?? "Receipt"} className="max-h-96 rounded-lg border border-border" />
            ) : null}
          </div>
        ) : (
          <p className={note}>No receipt attached.</p>
        )}
        {!p.locked ? (
          <Input
            type="file"
            aria-label={p.hasReceipt ? "Replace receipt" : "Attach receipt"}
            data-testid="receipt-input"
            accept="image/*,application/pdf"
            disabled={uploading}
            className="max-w-sm"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setUploading(true);
              try {
                await uploadReceipt(p.id, file);
                await router.invalidate();
              } catch (cause) {
                toast.error(errorMessage(cause));
              } finally {
                setUploading(false);
              }
            }}
          />
        ) : null}
      </Section>
    </AppShell>
  );
}
