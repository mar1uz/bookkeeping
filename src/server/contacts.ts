import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, invoices, purchases, recurringTemplates } from "@/db/schema";
import type { Actor } from "./books";
import { refuse } from "./errors";

export const contactInput = z
  .object({
    name: z.string().trim().min(1, "Enter a name").max(200),
    orgNumber: z.string().trim().max(30),
    email: z.union([z.literal(""), z.string().trim().email("Enter a valid email")]),
    address: z.string().trim().max(500),
    isCustomer: z.boolean(),
    isSupplier: z.boolean(),
  })
  .refine((c) => c.isCustomer || c.isSupplier, "Pick customer, supplier or both");

export const contactUpdate = z.object({
  id: z.string().uuid(),
  contact: contactInput,
});

export const listInput = z.object({
  search: z.string().trim().max(100).optional(),
  role: z.enum(["all", "customer", "supplier"]).optional(),
  archived: z.boolean().optional(),
});

export async function listContacts(input: z.infer<typeof listInput>) {
  const filters = [eq(contacts.archived, input.archived ?? false)];
  if (input.search) {
    const q = `%${input.search.replace(/[%_]/g, "")}%`;
    filters.push(
      or(
        like(contacts.name, q),
        like(contacts.orgNumber, q),
        like(contacts.email, q),
      )!,
    );
  }
  if (input.role === "customer") filters.push(eq(contacts.isCustomer, true));
  if (input.role === "supplier") filters.push(eq(contacts.isSupplier, true));
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      orgNumber: contacts.orgNumber,
      email: contacts.email,
      isCustomer: contacts.isCustomer,
      isSupplier: contacts.isSupplier,
      archived: contacts.archived,
      receivable: sql<number>`(select coalesce(sum(gross_ore - paid_ore), 0) from invoices where customer_id = ${contacts.id} and kind = 'invoice' and state = 'issued')`,
      payable: sql<number>`(select coalesce(sum(gross_ore), 0) from purchases where supplier_id = ${contacts.id} and paid_date is null and deleted = 0)`,
    })
    .from(contacts)
    .where(and(...filters))
    .orderBy(asc(contacts.name))
    .limit(500);
  return rows.map((r) => ({
    ...r,
    receivable: Number(r.receivable),
    payable: Number(r.payable),
  }));
}

/** Active contacts for a picker. */
export async function pickContacts(role: "customer" | "supplier") {
  return db
    .select({ id: contacts.id, name: contacts.name, email: contacts.email })
    .from(contacts)
    .where(
      and(
        eq(contacts.archived, false),
        eq(role === "customer" ? contacts.isCustomer : contacts.isSupplier, true),
      ),
    )
    .orderBy(asc(contacts.name));
}

export async function requireContact(id: string, role?: "customer" | "supplier") {
  const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!row) refuse("No such contact.");
  if (row.archived) refuse(`${row.name} is archived.`);
  if (role === "customer" && !row.isCustomer) refuse(`${row.name} isn't a customer.`);
  if (role === "supplier" && !row.isSupplier) refuse(`${row.name} isn't a supplier.`);
  return row;
}

export async function getContact(id: string, actor: Actor) {
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  if (!contact) return null;
  const invoiceRows = await db
    .select({
      id: invoices.id,
      kind: invoices.kind,
      state: invoices.state,
      number: invoices.number,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      grossOre: invoices.grossOre,
      paidOre: invoices.paidOre,
      createdBy: invoices.createdBy,
    })
    .from(invoices)
    .where(eq(invoices.customerId, id))
    .orderBy(desc(invoices.issueDate));
  const purchaseRows = await db
    .select({
      id: purchases.id,
      date: purchases.date,
      description: purchases.description,
      grossOre: purchases.grossOre,
      dueDate: purchases.dueDate,
      paidDate: purchases.paidDate,
    })
    .from(purchases)
    .where(and(eq(purchases.supplierId, id), eq(purchases.deleted, false)))
    .orderBy(desc(purchases.date));
  // Drafts stay private to their creator and admins.
  const visible = invoiceRows.filter(
    (i) => i.state !== "draft" || actor.admin || i.createdBy === actor.id,
  );
  const receivable = invoiceRows
    .filter((i) => i.kind === "invoice" && i.state === "issued")
    .reduce((s, i) => s + i.grossOre - i.paidOre, 0);
  const payable = purchaseRows
    .filter((p) => !p.paidDate)
    .reduce((s, p) => s + p.grossOre, 0);
  return {
    contact,
    invoices: visible.map(({ createdBy: _c, ...i }) => i),
    purchases: purchaseRows,
    receivable,
    payable,
  };
}

export async function createContact(actor: Actor, input: z.infer<typeof contactInput>) {
  const id = crypto.randomUUID();
  await db.insert(contacts).values({ id, ...input, createdBy: actor.id });
  return { id };
}

export async function updateContact(input: z.infer<typeof contactUpdate>) {
  const [row] = await db
    .update(contacts)
    .set(input.contact)
    .where(eq(contacts.id, input.id))
    .returning({ id: contacts.id });
  if (!row) refuse("No such contact.");
  return row;
}

export const contactRef = z.object({ id: z.string().uuid() });

export async function setArchived(input: { id: string; archived: boolean }) {
  const [row] = await db
    .update(contacts)
    .set({ archived: input.archived })
    .where(eq(contacts.id, input.id))
    .returning({ id: contacts.id });
  if (!row) refuse("No such contact.");
}

/** Deletes a contact no document refers to; anything else is archived instead. */
export async function deleteContact(input: { id: string }) {
  const [used] = await db
    .select({ n: sql<number>`1` })
    .from(contacts)
    .where(
      and(
        eq(contacts.id, input.id),
        or(
          sql`exists (select 1 from ${invoices} where ${invoices.customerId} = ${contacts.id})`,
          sql`exists (select 1 from ${purchases} where ${purchases.supplierId} = ${contacts.id})`,
          sql`exists (select 1 from ${recurringTemplates} where ${recurringTemplates.customerId} = ${contacts.id})`,
        ),
      ),
    );
  if (used) refuse("This contact is on invoices or purchases. Archive it instead.");
  await db.delete(contacts).where(eq(contacts.id, input.id));
}
