import { Link } from "@tanstack/react-router";
import { SOURCE_LABELS } from "@/client/lib/format";

/** The document a voucher came from. */
export function SourceLink({ v }: { v: { sourceType: string; sourceId: string; paymentInvoiceId?: string | null } }) {
  const label = SOURCE_LABELS[v.sourceType] ?? v.sourceType;
  const cls = "underline-offset-2 hover:underline";
  if (v.sourceType === "invoice" || v.sourceType === "credit_note") {
    return <Link to="/invoices/$id" params={{ id: v.sourceId }} className={cls}>{label}</Link>;
  }
  if (v.sourceType === "payment" && v.paymentInvoiceId) {
    return <Link to="/invoices/$id" params={{ id: v.paymentInvoiceId }} className={cls}>{label}</Link>;
  }
  if (v.sourceType === "purchase" || v.sourceType === "purchase_payment") {
    return <Link to="/purchases/$id" params={{ id: v.sourceId }} className={cls}>{label}</Link>;
  }
  return <span>{label}</span>;
}
