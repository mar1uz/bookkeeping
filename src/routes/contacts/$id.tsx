import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionDialog } from "@/client/components/ActionDialog";
import { AppShell } from "@/client/components/AppShell";
import { ContactForm } from "@/client/components/ContactForm";
import { PageHeader } from "@/client/components/PageHeader";
import { Section, note, panel } from "@/client/components/Section";
import { Button } from "@/client/components/ui/button";
import { Badge } from "@/client/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Amount, StatusBadge, errorMessage } from "@/client/lib/format";
import { statusOf } from "@/server/invoices.status";
import { deleteContact, getContact, setContactArchived, updateContact } from "@/serverFunctions/contacts";

export const Route = createFileRoute("/contacts/$id")({
  loader: ({ params }) => getContact({ data: { id: params.id } }),
  head: ({ loaderData }) => ({ meta: [{ title: loaderData?.contact.name ?? "Contact" }] }),
  component: ContactPage,
});

function ContactPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  if (!data) {
    return (
      <AppShell>
        <PageHeader title="Contact not found" />
      </AppShell>
    );
  }
  const { contact } = data;
  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/contacts" className="text-sm text-muted-foreground hover:text-foreground">
            ‹ Contacts
          </Link>
        }
        title={contact.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            {contact.isCustomer ? <Badge variant="secondary">Customer</Badge> : null}
            {contact.isSupplier ? <Badge variant="secondary">Supplier</Badge> : null}
            {contact.archived ? <Badge variant="outline" data-testid="archived">Archived</Badge> : null}
          </span>
        }
        actions={
          <>
            <Button
              variant="outline"
              data-testid="toggle-archive"
              onClick={async () => {
                await setContactArchived({ data: { id: contact.id, archived: !contact.archived } });
                await router.invalidate();
              }}
            >
              {contact.archived ? "Restore" : "Archive"}
            </Button>
            <ActionDialog
              trigger="Delete"
              triggerVariant="ghost"
              testId="delete-contact"
              title={`Delete ${contact.name}?`}
              submitLabel="Delete"
              destructive
              onSubmit={async () => {
                await deleteContact({ data: { id: contact.id } });
                await navigate({ to: "/contacts" });
              }}
            />
          </>
        }
      />
      <dl className="grid gap-4 sm:grid-cols-2">
        {contact.isCustomer ? (
          <div className={`${panel} p-5`}>
            <dt className={note}>Open invoices</dt>
            <dd className="text-2xl font-semibold" data-testid="receivable"><Amount ore={data.receivable} /></dd>
          </div>
        ) : null}
        {contact.isSupplier ? (
          <div className={`${panel} p-5`}>
            <dt className={note}>Unpaid bills</dt>
            <dd className="text-2xl font-semibold" data-testid="payable"><Amount ore={data.payable} /></dd>
          </div>
        ) : null}
      </dl>
      {contact.isCustomer ? (
        <Section title="Invoices">
          {data.invoices.length === 0 ? (
            <p className={note}>No invoices yet.</p>
          ) : (
            <div className={panel}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No.</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.invoices.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <Link to="/invoices/$id" params={{ id: i.id }} className="font-medium hover:underline">
                          {i.number ?? "Draft"}
                        </Link>
                      </TableCell>
                      <TableCell>{i.issueDate}</TableCell>
                      <TableCell className="text-right"><Amount ore={i.grossOre} /></TableCell>
                      <TableCell><StatusBadge status={statusOf(i)} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      ) : null}
      {contact.isSupplier ? (
        <Section title="Purchases">
          {data.purchases.length === 0 ? (
            <p className={note}>No purchases yet.</p>
          ) : (
            <div className={panel}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.purchases.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>{p.date}</TableCell>
                      <TableCell>
                        <Link to="/purchases/$id" params={{ id: p.id }} className="hover:underline">
                          {p.description}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right"><Amount ore={p.grossOre} /></TableCell>
                      <TableCell>{p.paidDate ? "Paid" : `Due ${p.dueDate}`}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>
      ) : null}
      <Section title="Details">
        <div className={`${panel} p-5`}>
          <ContactForm
            key={contact.id}
            initial={contact}
            submitLabel="Save changes"
            onSubmit={async (value) => {
              try {
                await updateContact({ data: { id: contact.id, contact: value } });
                toast.success("Saved");
                await router.invalidate();
              } catch (cause) {
                throw new Error(errorMessage(cause));
              }
            }}
          />
        </div>
      </Section>
    </AppShell>
  );
}
