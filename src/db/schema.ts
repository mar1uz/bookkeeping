import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// One set of books per install. Amounts are integer øre; dates are
// YYYY-MM-DD text.

const createdAt = () =>
  text("created_at")
    .notNull()
    .default(sql`(current_timestamp)`);

/** People the Gateway signed in, keyed by the Gateway's user id. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  createdAt: createdAt(),
});

/** The single company profile (id 1), seeded by a migration. */
export const company = sqliteTable("company", {
  id: integer("id").primaryKey(),
  name: text("name").notNull().default(""),
  orgNumber: text("org_number").notNull().default(""),
  address: text("address").notNull().default(""),
  bankAccount: text("bank_account").notNull().default(""),
  dueDays: integer("due_days").notNull().default(14),
  vatRegistered: integer("vat_registered", { mode: "boolean" })
    .notNull()
    .default(true),
  lockDate: text("lock_date"),
  // Where members last opened the app: links in emails the daily job sends.
  appOrigin: text("app_origin"),
});

/** Sequences for gapless numbers: "invoice" and "voucher". */
export const counters = sqliteTable("counters", {
  name: text("name").primaryKey(),
  value: integer("value").notNull().default(0),
});

export const accounts = sqliteTable("accounts", {
  number: text("number").primaryKey(),
  name: text("name").notNull(),
  // asset | liability | equity | income | expense
  type: text("type").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  // Accounts the app posts to on its own; never deactivated or deleted.
  system: integer("system", { mode: "boolean" }).notNull().default(false),
});

export const contacts = sqliteTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    orgNumber: text("org_number").notNull().default(""),
    email: text("email").notNull().default(""),
    address: text("address").notNull().default(""),
    isCustomer: integer("is_customer", { mode: "boolean" }).notNull(),
    isSupplier: integer("is_supplier", { mode: "boolean" }).notNull(),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("contacts_name").on(t.name)],
);

/** Invoices and credit notes. A draft has no number and no voucher. */
export const invoices = sqliteTable(
  "invoices",
  {
    id: text("id").primaryKey(),
    // invoice | credit_note
    kind: text("kind").notNull().default("invoice"),
    // draft | issued | credited
    state: text("state").notNull().default("draft"),
    number: integer("number"),
    customerId: text("customer_id").notNull(),
    createdBy: text("created_by").notNull(),
    issueDate: text("issue_date").notNull(),
    dueDate: text("due_date").notNull(),
    netOre: integer("net_ore").notNull().default(0),
    vatOre: integer("vat_ore").notNull().default(0),
    grossOre: integer("gross_ore").notNull().default(0),
    paidOre: integer("paid_ore").notNull().default(0),
    publicToken: text("public_token"),
    // On a credit note, the invoice it cancels; on an invoice, its credit note.
    relatedId: text("related_id"),
    templateId: text("template_id"),
    templateDate: text("template_date"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("invoices_number").on(t.number),
    uniqueIndex("invoices_token").on(t.publicToken),
    // A recurring template issues once per date.
    uniqueIndex("invoices_template_run").on(t.templateId, t.templateDate),
    // An invoice is cancelled by one credit note at most.
    uniqueIndex("invoices_one_credit")
      .on(t.relatedId)
      .where(sql`kind = 'credit_note'`),
    index("invoices_customer").on(t.customerId),
    check("invoices_not_overpaid", sql`paid_ore <= gross_ore`),
  ],
);

export const invoiceLines = sqliteTable(
  "invoice_lines",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    position: integer("position").notNull(),
    description: text("description").notNull(),
    // Thousandths: 1.5 is 1500.
    quantityMilli: integer("quantity_milli").notNull(),
    unitPriceOre: integer("unit_price_ore").notNull(),
    vatCode: text("vat_code").notNull(),
    accountNumber: text("account_number").notNull(),
    netOre: integer("net_ore").notNull(),
    vatOre: integer("vat_ore").notNull(),
  },
  (t) => [index("invoice_lines_invoice").on(t.invoiceId)],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    date: text("date").notNull(),
    amountOre: integer("amount_ore").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("payments_invoice").on(t.invoiceId)],
);

/** Invoice and reminder emails, sent or not. */
export const invoiceMessages = sqliteTable(
  "invoice_messages",
  {
    id: text("id").primaryKey(),
    invoiceId: text("invoice_id").notNull(),
    // invoice | reminder
    kind: text("kind").notNull(),
    recipient: text("recipient").notNull(),
    sent: integer("sent", { mode: "boolean" }).notNull(),
    detail: text("detail").notNull().default(""),
    createdBy: text("created_by"),
    createdAt: createdAt(),
  },
  (t) => [index("invoice_messages_invoice").on(t.invoiceId)],
);

export const recurringTemplates = sqliteTable("recurring_templates", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  createdBy: text("created_by").notNull(),
  // weekly | monthly | quarterly | yearly
  interval: text("interval").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date"),
  nextDate: text("next_date").notNull(),
  autoEmail: integer("auto_email", { mode: "boolean" }).notNull(),
  // active | paused | ended
  status: text("status").notNull().default("active"),
  // JSON array of { description, quantityMilli, unitPriceOre, vatCode, accountNumber }
  lines: text("lines").notNull(),
  createdAt: createdAt(),
});

export const purchases = sqliteTable(
  "purchases",
  {
    id: text("id").primaryKey(),
    supplierId: text("supplier_id").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    accountNumber: text("account_number").notNull(),
    vatCode: text("vat_code").notNull(),
    grossOre: integer("gross_ore").notNull(),
    netOre: integer("net_ore").notNull(),
    vatOre: integer("vat_ore").notNull(),
    dueDate: text("due_date").notNull(),
    paidDate: text("paid_date"),
    receiptKey: text("receipt_key"),
    receiptName: text("receipt_name"),
    receiptType: text("receipt_type"),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("purchases_supplier").on(t.supplierId)],
);

/** A journal entry. One per source event: the unique index stops double posting. */
export const vouchers = sqliteTable(
  "vouchers",
  {
    id: text("id").primaryKey(),
    number: integer("number").notNull(),
    date: text("date").notNull(),
    description: text("description").notNull(),
    // invoice | credit_note | payment | purchase | purchase_payment | purchase_reversal | manual
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("vouchers_number").on(t.number),
    uniqueIndex("vouchers_source").on(t.sourceType, t.sourceId),
    index("vouchers_date").on(t.date),
  ],
);

export const entries = sqliteTable(
  "entries",
  {
    id: text("id").primaryKey(),
    voucherId: text("voucher_id").notNull(),
    accountNumber: text("account_number").notNull(),
    debitOre: integer("debit_ore").notNull().default(0),
    creditOre: integer("credit_ore").notNull().default(0),
    // On sales and cost lines, the VAT code of the base; on VAT lines, the code.
    vatCode: text("vat_code"),
    description: text("description").notNull().default(""),
  },
  (t) => [
    index("entries_voucher").on(t.voucherId),
    index("entries_account").on(t.accountNumber),
  ],
);
