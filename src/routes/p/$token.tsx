import { createFileRoute, notFound } from "@tanstack/react-router";
import { InvoiceDocument } from "@/client/components/InvoiceDocument";
import { Button } from "@/client/components/ui/button";
import { getPublicInvoice } from "@/serverFunctions/invoices";

// Public: the customer opens it from the link they were sent, without signing in.
export const Route = createFileRoute("/p/$token")({
  loader: async ({ params }) => {
    const doc = await getPublicInvoice({ data: { token: params.token } });
    if (!doc) throw notFound();
    return doc;
  },
  notFoundComponent: () => (
    <main className="mx-auto max-w-3xl p-8">
      <p className="text-muted-foreground" data-testid="not-found">
        This invoice link doesn't work.
      </p>
    </main>
  ),
  head: ({ loaderData }) => ({
    meta: [
      { title: loaderData ? `${loaderData.kind === "credit_note" ? "Credit note" : "Invoice"} ${loaderData.number} – ${loaderData.company.name}` : "Not found" },
      { name: "robots", content: "noindex" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: PublicInvoice,
});

function PublicInvoice() {
  const doc = Route.useLoaderData();
  return (
    <div className="h-dvh overflow-y-auto">
      <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <div className="flex justify-end print:hidden">
          <Button variant="outline" onClick={() => window.print()}>
            Print
          </Button>
        </div>
        <InvoiceDocument doc={doc} />
      </main>
    </div>
  );
}
