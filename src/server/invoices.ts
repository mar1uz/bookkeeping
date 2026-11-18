import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { GatewayRefusalError, sendEmail } from "@every-app/sdk/server";
import { z } from "zod";
import { env } from "cloudflare:workers";
import { db } from "@/db";
import {
  contacts,
  counters,
  invoiceLines,
  invoiceMessages,
  invoices,
  payments,
  users,
} from "@/db/schema";
import { assertActiveAccount, assertOpen, getCompany, type Actor } from "./books";
import { requireContact } from "./contacts";
import { refuse } from "./errors";
import { statusOf } from "./invoices.status";
import { postVoucher, runBatch, voucherFor, type Statement } from "./ledger";
import {
  DATE,
  VAT_CODES,
  formatOre,
  isVatCode,
  lineAmounts,
  today,
  type VatCode,
} from "./money";

export const lineInput = z.object({
  description: z.string().trim().min(1, "Every line needs a description").max(300),
  quantityMilli: z.number().int().min(1, "Quantity must be above zero").max(1e9),
  unitPriceOre: z.number().int().min(0).max(1e12),
  vatCode: z.string(),
  accountNumber: z.string().regex(/^\d{4}$/),
});
export type LineInput = z.infer<typeof lineInput>;

export const invoiceInput = z.object({
  customerId: z.string().uuid("Pick a customer"),
  issueDate: z.string().regex(DATE, "Pick an invoice date"),
  dueDate: z.string().regex(DATE, "Pick a due date"),
  lines: z.array(lineInput).min(1, "Add at least one line").max(100),
});

export const invoiceUpdate = invoiceInput.extend({ id: z.string().uuid() });
export const invoiceRef = z.object({ id: z.string().uuid() });

/** Checks lines and computes every amount in øre. */
export async function computeLines(lines: LineInput[], vatRegistered: boolean) {
  const computed = [];
  for (const line of lines) {
    if (!isVatCode(line.vatCode)) refuse("Unknown VAT code.");
    if (!vatRegistered && VAT_CODES[line.vatCode].rate > 0) {
      refuse("The company isn't VAT registered, so lines can't carry VAT.");
    }
    await assertActiveAccount(line.accountNumber, ["income"]);
    computed.push({
      ...line,
      vatCode: line.vatCode as VatCode,
      ...lineAmounts(line.quantityMilli, line.unitPriceOre, line.vatCode),
    });
  }
  const netOre = computed.reduce((s, l) => s + l.netOre, 0);
  const vatOre = computed.reduce((s, l) => s + l.vatOre, 0);
  return { lines: computed, netOre, vatOre, grossOre: netOre + vatOre };
}

type Computed = Awaited<ReturnType<typeof computeLines>>;

function lineRows(invoiceId: string, c: Computed) {
  return c.lines.map((l, position) => ({
    id: crypto.randomUUID(),
    invoiceId,
    position,
    description: l.description,
    quantityMilli: l.quantityMilli,
    unitPriceOre: l.unitPriceOre,
    vatCode: l.vatCode,
    accountNumber: l.accountNumber,
    netOre: l.netOre,
    vatOre: l.vatOre,
  }));
}

/** Debit receivables, credit income per line and output VAT per rate. */
function salesPosting(c: Computed, reverse: boolean) {
  const lines = [];
  const flip = (amount: number) =>
    reverse ? { debit: amount, credit: 0 } : { debit: 0, credit: amount };
  lines.push({
    account: "1500",
    ...(reverse
      ? { debit: 0, credit: c.grossOre }
      : { debit: c.grossOre, credit: 0 }),
  });
  for (const l of c.lines) {
    lines.push({ account: l.accountNumber, vatCode: l.vatCode, ...flip(l.netOre) });
  }
  const vatByCode = new Map<VatCode, number>();
  for (const l of c.lines) {
    if (l.vatOre) vatByCode.set(l.vatCode, (vatByCode.get(l.vatCode) ?? 0) + l.vatOre);
  }
  for (const [code, amount] of vatByCode) {
    lines.push({ account: VAT_CODES[code].output!, vatCode: code, ...flip(amount) });
  }
  return lines;
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

const nextInvoiceNumber = sql`(select value from counters where name = 'invoice')`;
const bumpInvoiceNumber = () =>
  db
    .update(counters)
    .set({ value: sql`${counters.value} + 1` })
    .where(eq(counters.name, "invoice"));

// Status

export { statusOf };

function canSee(actor: Actor, i: { state: string; createdBy: string }) {
  return i.state !== "draft" || actor.admin || i.createdBy === actor.id;
}

// Drafts

export async function createDraft(actor: Actor, input: z.infer<typeof invoiceInput>) {
  const { vatRegistered } = await getCompany();
  await requireContact(input.customerId, "customer");
  const c = await computeLines(input.lines, vatRegistered);
  const id = crypto.randomUUID();
  await db.batch([
    db.insert(invoices).values({
      id,
      customerId: input.customerId,
      createdBy: actor.id,
      issueDate: input.issueDate,
      dueDate: input.dueDate,
      netOre: c.netOre,
      vatOre: c.vatOre,
      grossOre: c.grossOre,
    }),
    db.insert(invoiceLines).values(lineRows(id, c)),
  ]);
  return { id };
}

async function requireOwnDraft(actor: Actor, id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!row || !canSee(actor, row)) refuse("No such invoice.");
  if (row.state !== "draft") refuse("An issued invoice can't be changed. Credit it instead.");
  return row;
}

export async function updateDraft(actor: Actor, input: z.infer<typeof invoiceUpdate>) {
  await requireOwnDraft(actor, input.id);
  const { vatRegistered } = await getCompany();
  await requireContact(input.customerId, "customer");
  const c = await computeLines(input.lines, vatRegistered);
  await db.batch([
    db
      .update(invoices)
      .set({
        customerId: input.customerId,
        issueDate: input.issueDate,
        dueDate: input.dueDate,
        netOre: c.netOre,
        vatOre: c.vatOre,
        grossOre: c.grossOre,
      })
      .where(and(eq(invoices.id, input.id), eq(invoices.state, "draft"))),
    db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, input.id)),
    db.insert(invoiceLines).values(lineRows(input.id, c)),
  ]);
  return { id: input.id };
}

export async function deleteDraft(actor: Actor, input: { id: string }) {
  await requireOwnDraft(actor, input.id);
  await db.batch([
    db
      .delete(invoices)
      .where(and(eq(invoices.id, input.id), eq(invoices.state, "draft"))),
    db.delete(invoiceLines).where(eq(invoiceLines.invoiceId, input.id)),
  ]);
}

// Reading

export const listInvoicesInput = z.object({
  status: z
    .enum(["all", "draft", "unpaid", "partly_paid", "overdue", "paid", "credited", "credit_note"])
    .optional(),
  search: z.string().trim().max(100).optional(),
});

export async function listInvoices(actor: Actor, input: z.infer<typeof listInvoicesInput>) {
  const rows = await db
    .select({
      id: invoices.id,
      kind: invoices.kind,
      state: invoices.state,
      number: invoices.number,
      customer: contacts.name,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossOre: invoices.grossOre,
      paidOre: invoices.paidOre,
      createdBy: invoices.createdBy,
    })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.customerId))
    .orderBy(desc(invoices.issueDate), desc(invoices.number))
    .limit(1000);
  const on = today();
  const search = input.search?.toLowerCase();
  return rows
    .filter((r) => canSee(actor, r))
    .map(({ createdBy: _c, ...r }) => ({ ...r, status: statusOf(r, on) }))
    .filter((r) => !input.status || input.status === "all" || r.status === input.status)
    .filter(
      (r) =>
        !search ||
        r.customer.toLowerCase().includes(search) ||
        String(r.number ?? "").includes(search),
    );
}

async function loadLines(invoiceId: string) {
  return db
    .select()
    .from(invoiceLines)
    .where(eq(invoiceLines.invoiceId, invoiceId))
    .orderBy(asc(invoiceLines.position));
}

function vatSummary(lines: { vatCode: string; netOre: number; vatOre: number }[]) {
  const map = new Map<string, { code: string; label: string; base: number; vat: number }>();
  for (const l of lines) {
    const code = l.vatCode as VatCode;
    const entry = map.get(code) ?? { code, label: VAT_CODES[code].label, base: 0, vat: 0 };
    entry.base += l.netOre;
    entry.vat += l.vatOre;
    map.set(code, entry);
  }
  return [...map.values()];
}

/** What the printed and public views show: no internal ids beyond the invoice's. */
async function documentOf(row: typeof invoices.$inferSelect) {
  const [customer] = await db.select().from(contacts).where(eq(contacts.id, row.customerId));
  const lines = await loadLines(row.id);
  const company = await getCompany();
  let related: { id: string; number: number | null } | null = null;
  if (row.relatedId) {
    const [r] = await db
      .select({ id: invoices.id, number: invoices.number })
      .from(invoices)
      .where(eq(invoices.id, row.relatedId));
    related = r ?? null;
  }
  return {
    id: row.id,
    kind: row.kind,
    number: row.number,
    issueDate: row.issueDate,
    dueDate: row.dueDate,
    netOre: row.netOre,
    vatOre: row.vatOre,
    grossOre: row.grossOre,
    paidOre: row.paidOre,
    status: statusOf(row),
    related,
    customer: {
      name: customer?.name ?? "",
      orgNumber: customer?.orgNumber ?? "",
      address: customer?.address ?? "",
      email: customer?.email ?? "",
    },
    company: {
      name: company.name,
      orgNumber: company.orgNumber,
      address: company.address,
      bankAccount: company.bankAccount,
      vatRegistered: company.vatRegistered,
    },
    lines: lines.map((l) => ({
      description: l.description,
      quantityMilli: l.quantityMilli,
      unitPriceOre: l.unitPriceOre,
      vatCode: l.vatCode,
      accountNumber: l.accountNumber,
      netOre: l.netOre,
      vatOre: l.vatOre,
    })),
    vat: vatSummary(lines),
  };
}

export async function getInvoice(actor: Actor, id: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!row || !canSee(actor, row)) return null;
  const doc = await documentOf(row);
  const paymentRows = await db
    .select()
    .from(payments)
    .where(eq(payments.invoiceId, id))
    .orderBy(asc(payments.date));
  const messages = await db
    .select({
      id: invoiceMessages.id,
      kind: invoiceMessages.kind,
      recipient: invoiceMessages.recipient,
      sent: invoiceMessages.sent,
      detail: invoiceMessages.detail,
      createdAt: invoiceMessages.createdAt,
      by: users.email,
    })
    .from(invoiceMessages)
    .leftJoin(users, eq(users.id, invoiceMessages.createdBy))
    .where(eq(invoiceMessages.invoiceId, id))
    .orderBy(asc(invoiceMessages.createdAt));
  const voucher = row.state === "draft"
    ? null
    : await voucherFor(row.kind === "credit_note" ? "credit_note" : "invoice", id);
  return {
    ...doc,
    customerId: row.customerId,
    state: row.state,
    publicToken: row.publicToken,
    voucherNumber: voucher?.number ?? null,
    payments: paymentRows.map((p) => ({ id: p.id, date: p.date, amountOre: p.amountOre })),
    messages,
    canEdit: row.state === "draft",
  };
}

export async function publicInvoice(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db.select().from(invoices).where(eq(invoices.publicToken, token));
  if (!row || row.state === "draft") return null;
  const { id: _id, related, ...doc } = await documentOf(row);
  // Only the number of a related document; never its link.
  return { ...doc, related: related ? { number: related.number } : null };
}

// Issuing

/** The statements that post an issued invoice; the row must exist or be inserted before them. */
function issuePosting(id: string, date: string, actor: string, c: Computed): Statement[] {
  return postVoucher({
    date,
    description: "Invoice",
    sourceType: "invoice",
    sourceId: id,
    createdBy: actor,
    lines: salesPosting(c, false),
  });
}

export const issueInput = z.object({ id: z.string().uuid(), email: z.boolean() });

export async function issueInvoice(
  actor: Actor,
  input: z.infer<typeof issueInput>,
  origin: string,
) {
  const row = await requireOwnDraft(actor, input.id);
  await assertOpen(row.issueDate);
  const company = await getCompany();
  if (!company.name) refuse("Fill in the company profile under Settings first.");
  await requireContact(row.customerId, "customer");
  const lines = await loadLines(row.id);
  const c = await computeLines(lines, company.vatRegistered);
  const token = newToken();
  await runBatch([
    bumpInvoiceNumber(),
    db
      .update(invoices)
      .set({ state: "issued", number: nextInvoiceNumber, publicToken: token })
      .where(and(eq(invoices.id, row.id), eq(invoices.state, "draft"))),
    ...issuePosting(row.id, row.issueDate, actor.id, c),
  ]);
  if (input.email) {
    await emailInvoice(row.id, "invoice", origin, actor.id);
  }
  return { id: row.id };
}

/** Issues an invoice straight from a recurring template's run. */
export async function issueFromTemplate(t: {
  templateId: string;
  runDate: string;
  customerId: string;
  createdBy: string;
  lines: LineInput[];
}) {
  const company = await getCompany();
  const c = await computeLines(t.lines, company.vatRegistered);
  const date =
    company.lockDate && t.runDate <= company.lockDate ? today() : t.runDate;
  const id = crypto.randomUUID();
  await runBatch([
    bumpInvoiceNumber(),
    db.insert(invoices).values({
      id,
      state: "issued",
      number: nextInvoiceNumber,
      customerId: t.customerId,
      createdBy: t.createdBy,
      issueDate: date,
      dueDate: addDueDays(date, company.dueDays),
      netOre: c.netOre,
      vatOre: c.vatOre,
      grossOre: c.grossOre,
      publicToken: newToken(),
      templateId: t.templateId,
      templateDate: t.runDate,
    }),
    db.insert(invoiceLines).values(lineRows(id, c)),
    ...issuePosting(id, date, t.createdBy, c),
  ]);
  return { id };
}

function addDueDays(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Payments and credit notes

export const paymentInput = z.object({
  invoiceId: z.string().uuid(),
  date: z.string().regex(DATE, "Pick a date"),
  amountOre: z.number().int().min(1, "Enter an amount above zero"),
});

export async function registerPayment(actor: Actor, input: z.infer<typeof paymentInput>) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, input.invoiceId));
  if (!row || !canSee(actor, row)) refuse("No such invoice.");
  if (row.kind !== "invoice" || row.state !== "issued") {
    refuse("Payments go on issued invoices that aren't credited.");
  }
  const balance = row.grossOre - row.paidOre;
  if (input.amountOre > balance) {
    refuse(`That is more than the ${formatOre(balance)} still owed.`);
  }
  await assertOpen(input.date);
  const id = crypto.randomUUID();
  await runBatch([
    db.insert(payments).values({
      id,
      invoiceId: row.id,
      date: input.date,
      amountOre: input.amountOre,
      createdBy: actor.id,
    }),
    db
      .update(invoices)
      .set({ paidOre: sql`${invoices.paidOre} + ${input.amountOre}` })
      .where(and(eq(invoices.id, row.id), eq(invoices.state, "issued"))),
    ...postVoucher({
      date: input.date,
      description: `Payment of invoice ${row.number}`,
      sourceType: "payment",
      sourceId: id,
      createdBy: actor.id,
      lines: [
        { account: "1920", debit: input.amountOre, credit: 0 },
        { account: "1500", debit: 0, credit: input.amountOre },
      ],
    }),
  ]);
  return { id };
}

export const creditInput = z.object({
  id: z.string().uuid(),
  date: z.string().regex(DATE, "Pick a date"),
});

export async function creditInvoice(actor: Actor, input: z.infer<typeof creditInput>) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, input.id));
  if (!row || !canSee(actor, row)) refuse("No such invoice.");
  if (row.kind !== "invoice" || row.state !== "issued") {
    refuse("Only an issued invoice that isn't credited can be credited.");
  }
  await assertOpen(input.date);
  const lines = await loadLines(row.id);
  const c = {
    lines: lines.map((l) => ({ ...l, vatCode: l.vatCode as VatCode })),
    netOre: row.netOre,
    vatOre: row.vatOre,
    grossOre: row.grossOre,
  };
  const creditId = crypto.randomUUID();
  await runBatch([
    bumpInvoiceNumber(),
    db.insert(invoices).values({
      id: creditId,
      kind: "credit_note",
      state: "issued",
      number: nextInvoiceNumber,
      customerId: row.customerId,
      createdBy: actor.id,
      issueDate: input.date,
      dueDate: input.date,
      netOre: row.netOre,
      vatOre: row.vatOre,
      grossOre: row.grossOre,
      paidOre: row.grossOre,
      publicToken: newToken(),
      relatedId: row.id,
    }),
    db.insert(invoiceLines).values(
      lines.map((l) => ({ ...l, id: crypto.randomUUID(), invoiceId: creditId })),
    ),
    db
      .update(invoices)
      .set({ state: "credited", relatedId: creditId })
      .where(and(eq(invoices.id, row.id), eq(invoices.state, "issued"))),
    ...postVoucher({
      date: input.date,
      description: `Credit note for invoice ${row.number}`,
      sourceType: "credit_note",
      sourceId: creditId,
      createdBy: actor.id,
      lines: salesPosting(c, true),
    }),
  ]);
  return { id: creditId };
}

// Email

/** Sends the invoice or a reminder, and logs the attempt on the invoice. */
export async function emailInvoice(
  id: string,
  kind: "invoice" | "reminder",
  origin: string | null,
  actorId: string | null,
): Promise<{ sent: boolean; detail: string }> {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
  if (!row || row.state === "draft") refuse("No such invoice.");
  const [customer] = await db.select().from(contacts).where(eq(contacts.id, row.customerId));
  const company = await getCompany();
  const to = customer?.email ?? "";
  let sent = false;
  let detail = "";
  if (!to) {
    detail = "The customer has no email address.";
  } else {
    const link = origin && row.publicToken ? `${origin}/p/${row.publicToken}` : null;
    const balance = row.grossOre - row.paidOre;
    const title =
      row.kind === "credit_note"
        ? `Credit note ${row.number} from ${company.name}`
        : kind === "reminder"
          ? `Reminder: invoice ${row.number} from ${company.name} is overdue`
          : `Invoice ${row.number} from ${company.name}`;
    const text = [
      title,
      "",
      kind === "reminder"
        ? `NOK ${formatOre(balance)} was due on ${row.dueDate} and is still unpaid.`
        : `Amount: NOK ${formatOre(row.grossOre)}, due ${row.dueDate}.`,
      company.bankAccount ? `Bank account: ${company.bankAccount}` : "",
      `Reference: invoice ${row.number}`,
      link ? `\nView the invoice: ${link}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");
    try {
      await sendEmail({
        env,
        ...(actorId ? {} : { for: { background: true } as const }),
        message: { to, subject: title, text },
      });
      sent = true;
    } catch (error) {
      if (error instanceof GatewayRefusalError) {
        detail =
          error.code === "integration_not_configured"
            ? "Email isn't set up for this app."
            : error.message;
      } else {
        throw error;
      }
    }
  }
  await db.insert(invoiceMessages).values({
    id: crypto.randomUUID(),
    invoiceId: id,
    kind,
    recipient: to,
    sent,
    detail,
    createdBy: actorId,
  });
  return { sent, detail };
}

export async function sendReminder(actor: Actor, input: { id: string }, origin: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, input.id));
  if (!row || !canSee(actor, row)) refuse("No such invoice.");
  if (statusOf(row) !== "overdue") refuse("Only overdue invoices get reminders.");
  return emailInvoice(row.id, "reminder", origin, actor.id);
}

export async function resendInvoice(actor: Actor, input: { id: string }, origin: string) {
  const [row] = await db.select().from(invoices).where(eq(invoices.id, input.id));
  if (!row || !canSee(actor, row) || row.state === "draft") refuse("No such invoice.");
  return emailInvoice(row.id, "invoice", origin, actor.id);
}

/** Open invoices for the dashboard. */
export async function openInvoices() {
  const rows = await db
    .select({
      id: invoices.id,
      kind: invoices.kind,
      state: invoices.state,
      number: invoices.number,
      dueDate: invoices.dueDate,
      grossOre: invoices.grossOre,
      paidOre: invoices.paidOre,
      customer: contacts.name,
    })
    .from(invoices)
    .innerJoin(contacts, eq(contacts.id, invoices.customerId))
    .where(and(eq(invoices.kind, "invoice"), inArray(invoices.state, ["issued"])))
    .orderBy(asc(invoices.dueDate));
  return rows
    .filter((r) => r.grossOre > r.paidOre)
    .map((r) => ({ ...r, status: statusOf(r) }));
}
