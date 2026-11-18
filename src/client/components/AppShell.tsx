import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { ThemePreferenceRadio } from "@/client/components/ThemePreferenceMenuItems";

/**
 * The frame every page sits in: a bar with the way back to the Gateway and
 * the theme pick, then one scrolling column. The document itself doesn't
 * scroll (src/client/styles/app.css); the column does. A page starts with a
 * `PageHeader`; the sections sit in the second row.
 */
export function AppShell({ children }: { children: ReactNode }) {
  // From the root route's loader (src/serverFunctions/gateway.ts).
  const gatewayUrl = useRouterState({
    select: (state) => {
      const root = state.matches[0]?.loaderData;
      return root && "gatewayUrl" in root ? root.gatewayUrl : null;
    },
  });
  return (
    <div className="flex h-dvh flex-col">
      <header className="shrink-0 border-b border-border">
        <div
          className={`${COLUMN} flex h-12 items-center justify-between gap-3`}
        >
          <div className="flex min-w-0 items-center gap-4">
            {gatewayUrl ? (
              <a
                href={gatewayUrl}
                className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden />
                All apps
              </a>
            ) : null}
          </div>
          <ThemePreferenceRadio />
        </div>
        <nav
          aria-label="Sections"
          className={`${COLUMN} flex h-10 items-center gap-1 overflow-x-auto`}
        >
          {NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="shrink-0 rounded-md px-2.5 py-1 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[status=active]:bg-muted data-[status=active]:font-medium data-[status=active]:text-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <main className={`${COLUMN} space-y-8 pt-8 pb-24 md:pt-10`}>
          {children}
        </main>
      </div>
    </div>
  );
}

const NAV = [
  { to: "/", label: "Overview" },
  { to: "/invoices", label: "Invoices" },
  { to: "/recurring", label: "Recurring" },
  { to: "/purchases", label: "Purchases" },
  { to: "/contacts", label: "Contacts" },
  { to: "/journal", label: "Journal" },
  { to: "/reports", label: "Reports" },
  { to: "/settings", label: "Settings" },
] as const;

/** The column the bar and the page share. */
const COLUMN = "mx-auto w-full max-w-5xl px-4 md:px-10";
