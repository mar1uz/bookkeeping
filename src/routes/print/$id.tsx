import { Link, createFileRoute } from "@tanstack/react-router";
import { InvoiceDocument } from "@/client/components/InvoiceDocument";
import { Button, buttonVariants } from "@/client/components/ui/button";
import { getInvoice } from "@/serverFunctions/invoices";

export const Route = createFileRoute("/print/$id")({
  loader: ({ params }) => getInvoice({ data: { id: params.id } }),
  component: PrintInvoice,
});

function PrintInvoice() {
  const invoice = Route.useLoaderData();
  return (
    <div className="h-dvh overflow-y-auto">
      <main className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
        <div className="flex justify-between gap-2 print:hidden">
          <Link
            to="/invoices/$id"
            params={{ id: invoice?.id ?? "" }}
            className={buttonVariants({ variant: "ghost" })}
          >
            Back
          </Link>
          <Button onClick={() => window.print()}>Print</Button>
        </div>
        {invoice ? (
          <InvoiceDocument doc={invoice} />
        ) : (
          <p className="text-muted-foreground">No such invoice.</p>
        )}
      </main>
    </div>
  );
}
