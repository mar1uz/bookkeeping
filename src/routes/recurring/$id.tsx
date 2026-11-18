import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { ActionDialog } from "@/client/components/ActionDialog";
import { AppShell } from "@/client/components/AppShell";
import { PageHeader } from "@/client/components/PageHeader";
import { Section, note, panel } from "@/client/components/Section";
import { INTERVAL_LABELS, TEMPLATE_STATUS, TemplateForm } from "@/client/components/TemplateForm";
import { Badge } from "@/client/components/ui/badge";
import { Button } from "@/client/components/ui/button";
import { Amount, errorMessage } from "@/client/lib/format";
import type { Interval } from "@/server/money";
import { getSettings } from "@/serverFunctions/books";
import { pickContacts } from "@/serverFunctions/contacts";
import { getTemplate, setTemplateStatus, updateTemplate } from "@/serverFunctions/invoices";

export const Route = createFileRoute("/recurring/$id")({
  loader: async ({ params }) => {
    const [template, settings, customers] = await Promise.all([
      getTemplate({ data: { id: params.id } }),
      getSettings(),
      pickContacts({ data: { role: "customer" } }),
    ]);
    return { template, settings, customers };
  },
  head: () => ({ meta: [{ title: "Recurring invoice" }] }),
  component: TemplatePage,
});

function TemplatePage() {
  const { template: t, settings, customers } = Route.useLoaderData();
  const router = useRouter();
  if (!t) {
    return (
      <AppShell>
        <PageHeader title="Recurring invoice not found" />
      </AppShell>
    );
  }
  const changeable = t.canChange && t.status !== "ended";
  async function status(next: "active" | "paused" | "ended") {
    try {
      await setTemplateStatus({ data: { id: t!.id, status: next } });
      await router.invalidate();
    } catch (cause) {
      toast.error(errorMessage(cause));
    }
  }
  const customerName = customers.find((c) => c.id === t.customerId)?.name ?? "";
  return (
    <AppShell>
      <PageHeader
        backLink={
          <Link to="/recurring" className="text-sm text-muted-foreground hover:text-foreground">
            ‹ Recurring invoices
          </Link>
        }
        title={`${INTERVAL_LABELS[t.interval as Interval]}${customerName ? ` for ${customerName}` : ""}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={t.status === "active" ? "default" : "outline"} data-testid="template-status">
              {TEMPLATE_STATUS[t.status]}
            </Badge>
            {t.status !== "ended" ? <span>Next invoice {t.nextDate}</span> : null}
            {t.owner ? <span>· Owner {t.owner}</span> : null}
          </span>
        }
        actions={
          changeable ? (
            <>
              {t.status === "active" ? (
                <Button variant="outline" data-testid="pause" onClick={() => status("paused")}>
                  Pause
                </Button>
              ) : (
                <Button variant="outline" data-testid="resume" onClick={() => status("active")}>
                  Resume
                </Button>
              )}
              <ActionDialog
                trigger="End"
                triggerVariant="ghost"
                testId="end-template"
                title="End this recurring invoice?"
                description="No more invoices are issued from it. This can't be undone."
                submitLabel="End"
                destructive
                onSubmit={async () => {
                  await setTemplateStatus({ data: { id: t.id, status: "ended" } });
                  await router.invalidate();
                }}
              />
            </>
          ) : null
        }
      />
      <Section title="Invoices issued">
        {t.runs.length === 0 ? (
          <p className={note}>None yet.</p>
        ) : (
          <ul className={`${panel} divide-y divide-border text-sm`} data-testid="runs">
            {t.runs.map((r) => (
              <li key={r.id} className="flex justify-between px-5 py-3">
                <Link to="/invoices/$id" params={{ id: r.id }} className="font-medium hover:underline">
                  Invoice {r.number}
                </Link>
                <span>
                  {r.runDate} · <Amount ore={r.grossOre} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {changeable ? (
        <Section title="Edit">
          <TemplateForm
            key={t.id}
            initial={{ ...t, interval: t.interval as Interval }}
            customers={customers}
            accounts={settings.accounts}
            vatRegistered={settings.company.vatRegistered}
            submitLabel="Save changes"
            onSubmit={async (v) => {
              await updateTemplate({ data: { id: t.id, template: v } });
              await router.invalidate();
              toast.success("Saved");
            }}
          />
        </Section>
      ) : null}
    </AppShell>
  );
}
