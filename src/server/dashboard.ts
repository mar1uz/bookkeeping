import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { contacts, purchases } from "@/db/schema";
import { getCompany } from "./books";
import { openInvoices } from "./invoices";
import { accountBalance, profitAndLoss } from "./ledger";
import { addDays, today, upcomingVatDeadlines } from "./money";

export async function dashboard() {
  const on = today();
  const year = on.slice(0, 4);
  const company = await getCompany();
  const [bank, receivables, payables, pnl, open] = await Promise.all([
    accountBalance("1920", on),
    accountBalance("1500", on),
    accountBalance("2400", on),
    profitAndLoss({ from: `${year}-01-01`, to: `${year}-12-31` }),
    openInvoices(),
  ]);
  const bills = await db
    .select({
      id: purchases.id,
      description: purchases.description,
      supplier: contacts.name,
      dueDate: purchases.dueDate,
      grossOre: purchases.grossOre,
    })
    .from(purchases)
    .innerJoin(contacts, eq(contacts.id, purchases.supplierId))
    .where(and(isNull(purchases.paidDate), eq(purchases.deleted, false)))
    .orderBy(asc(purchases.dueDate));
  const soon = addDays(on, 14);
  return {
    today: on,
    companyName: company.name,
    vatRegistered: company.vatRegistered,
    bank,
    receivables,
    payables,
    result: pnl.result,
    year,
    vatDeadlines: company.vatRegistered ? upcomingVatDeadlines(on, 2) : [],
    overdueInvoices: open.filter((i) => i.status === "overdue"),
    invoicesDueSoon: open.filter((i) => i.status !== "overdue" && i.dueDate <= soon),
    billsDue: bills.filter((b) => b.dueDate <= soon),
  };
}
