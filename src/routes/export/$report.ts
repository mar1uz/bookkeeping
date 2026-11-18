import { createFileRoute } from "@tanstack/react-router";
import { requireEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { ZodError } from "zod";
import { reportCsv } from "@/server/csv";
import { UserError } from "@/server/errors";

// Reports as CSV for members (journal, ledger, profit-and-loss, balance-sheet, vat).
export const Route = createFileRoute("/export/$report")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireEveryAppUser(request, env);
        try {
          const file = await reportCsv(params.report, new URL(request.url).searchParams);
          if (!file) return new Response("Not found", { status: 404 });
          return new Response(`﻿${file.body}`, {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": `attachment; filename="${file.name}"`,
              "cache-control": "private, no-store",
            },
          });
        } catch (error) {
          if (error instanceof ZodError || error instanceof UserError) {
            return new Response("Check the report's dates.", { status: 400 });
          }
          throw error;
        }
      },
    },
  },
});
