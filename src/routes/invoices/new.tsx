import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { InvoiceForm } from "@/client/components/InvoiceForm";
import { PageHeader } from "@/client/components/PageHeader";
import { getSettings } from "@/serverFunctions/books";
import { pickContacts } from "@/serverFunctions/contacts";
import { createDraft } from "@/serverFunctions/invoices";

export const Route = createFileRoute("/invoices/new")({
  loader: async () => {
    const [settings, customers] = await Promise.all([
      getSettings(),
      pickContacts({ data: { role: "customer" } }),
    ]);
    return { settings, customers };
  },
  head: () => ({ meta: [{ title: "New invoice" }] }),
  component: NewInvoice,
});

function NewInvoice() {
  const { settings, customers } = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <AppShell>
      <PageHeader title="New invoice" />
      <InvoiceForm
        customers={customers}
        accounts={settings.accounts}
        company={settings.company}
        submitLabel="Save draft"
        onSubmit={async (value) => {
          const { id } = await createDraft({ data: value });
          await navigate({ to: "/invoices/$id", params: { id } });
        }}
      />
    </AppShell>
  );
}
