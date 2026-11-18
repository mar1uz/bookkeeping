import { createFileRoute } from "@tanstack/react-router";
import { requireEveryAppUser } from "@every-app/sdk/server";
import { env } from "cloudflare:workers";
import { UserError } from "@/server/errors";
import { attachReceipt, receiptOf } from "@/server/purchases";

const ID = /^[0-9a-f-]{36}$/;

// A purchase's receipt: members only (not listed under `public`), and the
// Worker checks the signed identity itself too.
export const Route = createFileRoute("/api/purchases/$id/receipt")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        await requireEveryAppUser(request, env);
        if (!ID.test(params.id)) return new Response("Not found", { status: 404 });
        try {
          const receipt = await receiptOf(env.files, params.id);
          if (!receipt) return new Response("Not found", { status: 404 });
          return new Response(receipt.object.body, {
            headers: {
              "content-type": receipt.type,
              "content-disposition": `inline; filename="${receipt.name.replace(/["\\\r\n]/g, "")}"`,
              "cache-control": "private, no-store",
              "x-content-type-options": "nosniff",
            },
          });
        } catch (error) {
          if (error instanceof UserError) return new Response("Not found", { status: 404 });
          throw error;
        }
      },
      POST: async ({ request, params }) => {
        await requireEveryAppUser(request, env);
        if (!ID.test(params.id)) return Response.json({ error: "Not found" }, { status: 404 });
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        if (!file || typeof file === "string") {
          return Response.json({ error: "Attach a file." }, { status: 400 });
        }
        try {
          await attachReceipt(env.files, params.id, {
            name: file.name,
            type: file.type,
            body: await file.arrayBuffer(),
          });
          return Response.json({ ok: true }, { status: 201 });
        } catch (error) {
          if (error instanceof UserError) {
            return Response.json({ error: error.message }, { status: 400 });
          }
          throw error;
        }
      },
    },
  },
});
