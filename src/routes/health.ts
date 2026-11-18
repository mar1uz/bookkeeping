import { createFileRoute } from "@tanstack/react-router";

// For uptime checks by members or a personal access token; not public.
export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => Response.json({ ok: true }),
    },
  },
});
