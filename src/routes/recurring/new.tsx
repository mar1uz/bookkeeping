import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { TemplateForm } from "@/client/components/TemplateForm";
import { getSettings } from "@/serverFunctions/books";
import { pickContacts } from "@/serverFunctions/contacts";
import { createTemplate } from "@/serverFunctions/invoices";

export const Route = createFileRoute("/recurring/new")({
  loader: async () => {
    const [settings, customers] = await Promise.all([getSettings(), pickContacts({ data: { role: "customer" } })]);
    return { settings, customers };
  },
  head: () => ({ meta: [{ title: "New recurring invoice" }] }),
  component: NewTemplate,
});

function NewTemplate() {
  const { settings, customers } = Route.useLoaderData();
  const navigate = useNavigate();
  return (
    <AppShell>
      <PageHeader title="New recurring invoice" />
      <TemplateForm
        customers={customers}
        accounts={settings.accounts}
        vatRegistered={settings.company.vatRegistered}
        submitLabel="Save"
        onSubmit={async (v) => {
          const { id } = await createTemplate({ data: v });
          await navigate({ to: "/recurring/$id", params: { id } });
        }}
      />
    </AppShell>
  );
}
