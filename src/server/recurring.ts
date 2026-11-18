import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { contacts, invoices, recurringTemplates, users } from "@/db/schema";
import { getCompany, type Actor } from "./books";
import { requireContact } from "./contacts";
import { refuse } from "./errors";
import {
  computeLines,
  emailInvoice,
  issueFromTemplate,
  lineInput,
  type LineInput,
} from "./invoices";
import { DATE, INTERVALS, nextRun, today } from "./money";

export const templateInput = z
  .object({
    customerId: z.string().uuid("Pick a customer"),
    interval: z.enum(INTERVALS),
    startDate: z.string().regex(DATE, "Pick a start date"),
    endDate: z.string().regex(DATE).nullable(),
    autoEmail: z.boolean(),
    lines: z.array(lineInput).min(1, "Add at least one line").max(100),
  })
  .refine((t) => !t.endDate || t.endDate >= t.startDate, "The end date is before the start date");

export const templateUpdate = z.object({
  id: z.string().uuid(),
  template: templateInput,
});
export const templateRef = z.object({ id: z.string().uuid() });

function parseLines(text: string): LineInput[] {
  return JSON.parse(text) as LineInput[];
}

export async function listTemplates() {
  const rows = await db
    .select({
      id: recurringTemplates.id,
      customer: contacts.name,
      interval: recurringTemplates.interval,
      nextDate: recurringTemplates.nextDate,
      endDate: recurringTemplates.endDate,
      status: recurringTemplates.status,
      autoEmail: recurringTemplates.autoEmail,
      lines: recurringTemplates.lines,
      owner: users.email,
    })
    .from(recurringTemplates)
    .innerJoin(contacts, eq(contacts.id, recurringTemplates.customerId))
    .leftJoin(users, eq(users.id, recurringTemplates.createdBy))
    .orderBy(asc(recurringTemplates.nextDate));
  const { vatRegistered } = await getCompany();
  return Promise.all(
    rows.map(async ({ lines, ...r }) => {
      let grossOre = 0;
      try {
        grossOre = (await computeLines(parseLines(lines), vatRegistered)).grossOre;
      } catch {
        grossOre = 0;
      }
      return { ...r, grossOre };
    }),
  );
}

export async function getTemplate(actor: Actor, id: string) {
  const [row] = await db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.id, id));
  if (!row) return null;
  const [owner] = await db.select().from(users).where(eq(users.id, row.createdBy));
  const runs = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      runDate: invoices.templateDate,
      issueDate: invoices.issueDate,
      grossOre: invoices.grossOre,
    })
    .from(invoices)
    .where(eq(invoices.templateId, id))
    .orderBy(asc(invoices.templateDate));
  return {
    ...row,
    lines: parseLines(row.lines),
    owner: owner?.email ?? null,
    canChange: actor.admin || row.createdBy === actor.id,
    runs,
  };
}

export async function createTemplate(actor: Actor, input: z.infer<typeof templateInput>) {
  await requireContact(input.customerId, "customer");
  const { vatRegistered } = await getCompany();
  await computeLines(input.lines, vatRegistered);
  const id = crypto.randomUUID();
  await db.insert(recurringTemplates).values({
    id,
    customerId: input.customerId,
    createdBy: actor.id,
    interval: input.interval,
    startDate: input.startDate,
    endDate: input.endDate,
    nextDate: input.startDate,
    autoEmail: input.autoEmail,
    lines: JSON.stringify(input.lines),
  });
  return { id };
}

async function requireChangeable(actor: Actor, id: string) {
  const [row] = await db
    .select()
    .from(recurringTemplates)
    .where(eq(recurringTemplates.id, id));
  if (!row) refuse("No such recurring invoice.");
  if (!actor.admin && row.createdBy !== actor.id) {
    refuse("Only its owner or an admin can change this recurring invoice.");
  }
  return row;
}

export async function updateTemplate(actor: Actor, input: z.infer<typeof templateUpdate>) {
  const row = await requireChangeable(actor, input.id);
  if (row.status === "ended") refuse("This recurring invoice has ended.");
  const t = input.template;
  await requireContact(t.customerId, "customer");
  const { vatRegistered } = await getCompany();
  await computeLines(t.lines, vatRegistered);
  // A new start date only moves the schedule while nothing has run yet.
  const [ran] = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.templateId, row.id))
    .limit(1);
  await db
    .update(recurringTemplates)
    .set({
      customerId: t.customerId,
      interval: t.interval,
      startDate: t.startDate,
      endDate: t.endDate,
      autoEmail: t.autoEmail,
      lines: JSON.stringify(t.lines),
      ...(ran ? {} : { nextDate: t.startDate }),
    })
    .where(eq(recurringTemplates.id, row.id));
}

export const statusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["active", "paused", "ended"]),
});

export async function setTemplateStatus(actor: Actor, input: z.infer<typeof statusInput>) {
  const row = await requireChangeable(actor, input.id);
  if (row.status === "ended") refuse("This recurring invoice has ended.");
  await db
    .update(recurringTemplates)
    .set({ status: input.status })
    .where(eq(recurringTemplates.id, row.id));
}

/**
 * The daily job: issues each due run of every active template. The unique
 * (template, date) index makes a second run for the same date fail as a
 * whole, so a date is never issued twice.
 */
export async function runRecurring(on = today()) {
  const { appOrigin } = await getCompany();
  const due = await db
    .select()
    .from(recurringTemplates)
    .where(
      and(eq(recurringTemplates.status, "active"), lte(recurringTemplates.nextDate, on)),
    );
  let issued = 0;
  for (const t of due) {
    let next = t.nextDate;
    for (let i = 0; i < 60 && next <= on; i++) {
      if (t.endDate && next > t.endDate) break;
      const [already] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.templateId, t.id), eq(invoices.templateDate, next)));
      if (!already) {
        try {
          const { id } = await issueFromTemplate({
            templateId: t.id,
            runDate: next,
            customerId: t.customerId,
            createdBy: t.createdBy,
            lines: parseLines(t.lines),
          });
          issued++;
          if (t.autoEmail) await emailInvoice(id, "invoice", appOrigin, null);
        } catch (error) {
          console.error("recurring invoice failed", t.id, next, error);
          break;
        }
      }
      next = nextRun(next, t.interval as (typeof INTERVALS)[number]);
    }
    const ended = t.endDate !== null && next > t.endDate;
    await db
      .update(recurringTemplates)
      .set({ nextDate: next, ...(ended ? { status: "ended" } : {}) })
      .where(eq(recurringTemplates.id, t.id));
  }
  return { issued };
}
