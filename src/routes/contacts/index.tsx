import { Link, createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { AppShell } from "@/client/components/AppShell";
import { ContactForm } from "@/client/components/ContactForm";
import { PageHeader } from "@/client/components/PageHeader";
import { panel } from "@/client/components/Section";
import { Button } from "@/client/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/client/components/ui/dialog";
import { Input } from "@/client/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/client/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/client/components/ui/table";
import { Amount } from "@/client/lib/format";
import { createContact, getContacts } from "@/serverFunctions/contacts";

const search = z.object({
  q: z.coerce.string().optional(),
  role: z.enum(["all", "customer", "supplier"]).optional(),
  archived: z.boolean().optional(),
});

export const Route = createFileRoute("/contacts/")({
  validateSearch: search,
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    getContacts({ data: { search: deps.q || undefined, role: deps.role, archived: deps.archived } }),
  head: () => ({ meta: [{ title: "Contacts" }] }),
  component: Contacts,
});

function Contacts() {
  const rows = Route.useLoaderData();
  const { q = "", role = "all", archived = false } = Route.useSearch();
  const navigate = useNavigate({ from: "/contacts/" });
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <AppShell>
      <PageHeader
        title="Contacts"
        actions={
          <Button onClick={() => setOpen(true)} data-testid="new-contact">
            New contact
          </Button>
        }
      />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New contact</DialogTitle>
          </DialogHeader>
          <ContactForm
            submitLabel="Save contact"
            onSubmit={async (value) => {
              await createContact({ data: value });
              setOpen(false);
              await router.invalidate();
            }}
          />
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap gap-2">
        <Input
          aria-label="Search contacts"
          data-testid="contact-search"
          placeholder="Name, org. number or email"
          className="max-w-xs bg-card"
          defaultValue={q}
          onChange={(e) => navigate({ search: (s) => ({ ...s, q: e.target.value || undefined }), replace: true })}
        />
        <NativeSelect
          aria-label="Kind"
          value={role}
          onChange={(e) => navigate({ search: (s) => ({ ...s, role: e.target.value as "all" }) })}
        >
          <NativeSelectOption value="all">Customers and suppliers</NativeSelectOption>
          <NativeSelectOption value="customer">Customers</NativeSelectOption>
          <NativeSelectOption value="supplier">Suppliers</NativeSelectOption>
        </NativeSelect>
        <NativeSelect
          aria-label="Archived"
          value={archived ? "archived" : "active"}
          onChange={(e) => navigate({ search: (s) => ({ ...s, archived: e.target.value === "archived" || undefined }) })}
        >
          <NativeSelectOption value="active">Active</NativeSelectOption>
          <NativeSelectOption value="archived">Archived</NativeSelectOption>
        </NativeSelect>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {q || role !== "all" || archived ? "No contacts match." : "No contacts yet. Add your customers and suppliers here."}
        </p>
      ) : (
        <div className={panel}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Org. number</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead className="text-right">They owe</TableHead>
                <TableHead className="text-right">We owe</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.id} data-testid="contact-row">
                  <TableCell>
                    <Link to="/contacts/$id" params={{ id: c.id }} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell>{c.orgNumber}</TableCell>
                  <TableCell>{[c.isCustomer && "Customer", c.isSupplier && "Supplier"].filter(Boolean).join(", ")}</TableCell>
                  <TableCell className="text-right"><Amount ore={c.receivable} /></TableCell>
                  <TableCell className="text-right"><Amount ore={c.payable} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </AppShell>
  );
}
