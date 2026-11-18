import { and, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, purchases, users } from "@/db/schema";
import { assertActiveAccount, assertOpen, getCompany, type Actor } from "./books";
import { requireContact } from "./contacts";
import { refuse } from "./errors";
import { postVoucher, runBatch, voucherFor, type PostingLine } from "./ledger";
import { DATE, VAT_CODES, isVatCode, splitGross, type VatCode } from "./money";

export const purchaseInput = z.object({
  supplierId: z.string().uuid("Pick a supplier"),
  date: z.string().regex(DATE, "Pick a date"),
  description: z.string().trim().min(1, "Enter a description").max(300),
  accountNumber: z.string().regex(/^\d{4}$/, "Pick an account"),
  vatCode: z.string(),
  grossOre: z.number().int().min(1, "Enter an amount above zero").max(1e12),
  dueDate: z.string().regex(DATE, "Pick a due date"),
  paidNow: z.boolean(),
});

export const purchaseRef = z.object({ id: z.string().uuid() });
export const payPurchaseInput = z.object({
  id: z.string().uuid(),
  date: z.string().regex(DATE, "Pick a date"),
});

export const listPurchasesInput = z.object({
  status: z.enum(["all", "paid", "unpaid"]).optional(),
  supplierId: z.string().uuid().optional(),
  from: z.string().regex(DATE).optional(),
  to: z.string().regex(DATE).optional(),
});

export async function listPurchases(input: z.infer<typeof listPurchasesInput>) {
  const filters = [eq(purchases.deleted, false)];
  if (input.status === "paid") filters.push(isNotNull(purchases.paidDate));
  if (input.status === "unpaid") filters.push(isNull(purchases.paidDate));
  if (input.supplierId) filters.push(eq(purchases.supplierId, input.supplierId));
  if (input.from) filters.push(gte(purchases.date, input.from));
  if (input.to) filters.push(lte(purchases.date, input.to));
  return db
    .select({
      id: purchases.id,
      date: purchases.date,
      supplier: contacts.name,
      description: purchases.description,
      grossOre: purchases.grossOre,
      dueDate: purchases.dueDate,
      paidDate: purchases.paidDate,
      hasReceipt: sql<boolean>`${purchases.receiptKey} is not null`.mapWith(Boolean),
    })
    .from(purchases)
    .innerJoin(contacts, eq(contacts.id, purchases.supplierId))
    .where(and(...filters))
    .orderBy(desc(purchases.date))
    .limit(1000);
}

function costPosting(p: {
  accountNumber: string;
  vatCode: VatCode;
  netOre: number;
  vatOre: number;
  grossOre: number;
}): PostingLine[] {
  const lines: PostingLine[] = [
    { account: p.accountNumber, debit: p.netOre, credit: 0, vatCode: p.vatCode },
  ];
  if (p.vatOre) {
    lines.push({
      account: VAT_CODES[p.vatCode].input!,
      debit: p.vatOre,
      credit: 0,
      vatCode: p.vatCode,
    });
  }
  return lines;
}

export async function createPurchase(actor: Actor, input: z.infer<typeof purchaseInput>) {
  if (!isVatCode(input.vatCode)) refuse("Unknown VAT code.");
  await assertOpen(input.date);
  await requireContact(input.supplierId, "supplier");
  await assertActiveAccount(input.accountNumber, ["expense", "asset"]);
  const { vatRegistered } = await getCompany();
  // Without VAT registration, VAT isn't deducted: the whole amount is cost.
  const { netOre, vatOre } = vatRegistered
    ? splitGross(input.grossOre, input.vatCode)
    : { netOre: input.grossOre, vatOre: 0 };
  const id = crypto.randomUUID();
  const paidDate = input.paidNow ? input.date : null;
  await runBatch([
    db.insert(purchases).values({
      id,
      supplierId: input.supplierId,
      date: input.date,
      description: input.description,
      accountNumber: input.accountNumber,
      vatCode: input.vatCode,
      grossOre: input.grossOre,
      netOre,
      vatOre,
      dueDate: input.paidNow ? input.date : input.dueDate,
      paidDate,
      createdBy: actor.id,
    }),
    ...postVoucher({
      date: input.date,
      description: input.description,
      sourceType: "purchase",
      sourceId: id,
      createdBy: actor.id,
      lines: [
        ...costPosting({ ...input, vatCode: input.vatCode, netOre, vatOre }),
        {
          account: input.paidNow ? "1920" : "2400",
          debit: 0,
          credit: input.grossOre,
        },
      ],
    }),
  ]);
  return { id };
}

async function requirePurchase(id: string) {
  const [row] = await db
    .select()
    .from(purchases)
    .where(and(eq(purchases.id, id), eq(purchases.deleted, false)));
  if (!row) refuse("No such purchase.");
  return row;
}

export async function getPurchase(id: string, actor: Actor) {
  const [row] = await db
    .select({
      purchase: purchases,
      supplier: contacts.name,
      createdByEmail: users.email,
    })
    .from(purchases)
    .innerJoin(contacts, eq(contacts.id, purchases.supplierId))
    .leftJoin(users, eq(users.id, purchases.createdBy))
    .where(and(eq(purchases.id, id), eq(purchases.deleted, false)));
  if (!row) return null;
  const { lockDate } = await getCompany();
  const p = row.purchase;
  const voucher = await voucherFor("purchase", p.id);
  const payment = await voucherFor("purchase_payment", p.id);
  const locked = !!lockDate && p.date <= lockDate;
  return {
    id: p.id,
    supplierId: p.supplierId,
    supplier: row.supplier,
    date: p.date,
    description: p.description,
    accountNumber: p.accountNumber,
    vatCode: p.vatCode,
    grossOre: p.grossOre,
    netOre: p.netOre,
    vatOre: p.vatOre,
    dueDate: p.dueDate,
    paidDate: p.paidDate,
    receiptName: p.receiptName,
    receiptType: p.receiptType,
    hasReceipt: !!p.receiptKey,
    createdBy: row.createdByEmail,
    voucherNumber: voucher?.number ?? null,
    paymentVoucherNumber: payment?.number ?? null,
    locked,
    canDelete:
      !locked &&
      (!p.paidDate || !lockDate || p.paidDate > lockDate) &&
      (actor.admin || p.createdBy === actor.id),
  };
}

export async function payPurchase(actor: Actor, input: z.infer<typeof payPurchaseInput>) {
  const p = await requirePurchase(input.id);
  if (p.paidDate) refuse("This purchase is already paid.");
  if (input.date < p.date) refuse("The payment can't be before the purchase.");
  await assertOpen(input.date);
  await runBatch([
    db
      .update(purchases)
      .set({ paidDate: input.date })
      .where(and(eq(purchases.id, p.id), isNull(purchases.paidDate))),
    ...postVoucher({
      date: input.date,
      description: `Payment: ${p.description}`,
      sourceType: "purchase_payment",
      sourceId: p.id,
      createdBy: actor.id,
      lines: [
        { account: "2400", debit: p.grossOre, credit: 0 },
        { account: "1920", debit: 0, credit: p.grossOre },
      ],
    }),
  ]);
}

/** Deletes a purchase by posting reversals of its entries on their own dates. */
export async function deletePurchase(actor: Actor, input: { id: string }) {
  const p = await requirePurchase(input.id);
  if (!actor.admin && p.createdBy !== actor.id) {
    refuse("Only the person who registered it or an admin can delete this purchase.");
  }
  await assertOpen(p.date, p.paidDate);
  const vatCode = p.vatCode as VatCode;
  const paidAtPurchase = p.paidDate !== null && (await voucherFor("purchase_payment", p.id)) === null;
  const reverse = (lines: PostingLine[]) =>
    lines.map((l) => ({ ...l, debit: l.credit, credit: l.debit }));
  const statements = [
    db.update(purchases).set({ deleted: true }).where(eq(purchases.id, p.id)),
    ...postVoucher({
      date: p.date,
      description: `Deleted: ${p.description}`,
      sourceType: "purchase_reversal",
      sourceId: p.id,
      createdBy: actor.id,
      lines: reverse([
        ...costPosting({ ...p, vatCode }),
        { account: paidAtPurchase ? "1920" : "2400", debit: 0, credit: p.grossOre },
      ]),
    }),
  ];
  if (p.paidDate && !paidAtPurchase) {
    statements.push(
      ...postVoucher({
        date: p.paidDate,
        description: `Deleted payment: ${p.description}`,
        sourceType: "purchase_payment_reversal",
        sourceId: p.id,
        createdBy: actor.id,
        lines: [
          { account: "1920", debit: p.grossOre, credit: 0 },
          { account: "2400", debit: 0, credit: p.grossOre },
        ],
      }),
    );
  }
  await runBatch(statements);
}

export const RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
export const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

/** Stores a receipt privately in R2 and links it to the purchase. */
export async function attachReceipt(
  bucket: R2Bucket,
  id: string,
  file: { name: string; type: string; body: ArrayBuffer },
) {
  const p = await requirePurchase(id);
  await assertOpen(p.date);
  if (!RECEIPT_TYPES.includes(file.type)) refuse("Attach a photo or a PDF.");
  if (file.body.byteLength > RECEIPT_MAX_BYTES) refuse("The file is over 10 MB.");
  const key = `receipts/${p.id}/${crypto.randomUUID()}`;
  await bucket.put(key, file.body, { httpMetadata: { contentType: file.type } });
  await db
    .update(purchases)
    .set({ receiptKey: key, receiptName: file.name.slice(0, 200), receiptType: file.type })
    .where(eq(purchases.id, p.id));
  if (p.receiptKey) await bucket.delete(p.receiptKey);
}

export async function receiptOf(bucket: R2Bucket, id: string) {
  const p = await requirePurchase(id);
  if (!p.receiptKey) return null;
  const object = await bucket.get(p.receiptKey);
  if (!object) return null;
  return { object, name: p.receiptName ?? "receipt", type: p.receiptType ?? "application/octet-stream" };
}
