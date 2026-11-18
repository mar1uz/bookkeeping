import { useState, type ReactNode } from "react";
import { Alert, AlertDescription } from "@/client/components/ui/alert";
import { Button } from "@/client/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/client/components/ui/dialog";
import { errorMessage } from "@/client/lib/format";

/** A button that opens a small form; the dialog closes when `onSubmit` succeeds. */
export function ActionDialog({
  trigger,
  triggerVariant = "outline",
  title,
  description,
  submitLabel,
  destructive,
  onSubmit,
  children,
  testId,
}: {
  trigger: ReactNode;
  triggerVariant?: "default" | "outline" | "ghost" | "destructive" | "secondary";
  title: string;
  description?: ReactNode;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: () => Promise<void>;
  children?: ReactNode;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant={triggerVariant}
        data-testid={testId}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {trigger}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await onSubmit();
                setOpen(false);
              } catch (cause) {
                setError(errorMessage(cause));
              } finally {
                setBusy(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              {description ? <DialogDescription>{description}</DialogDescription> : null}
            </DialogHeader>
            {children}
            {error ? (
              <Alert variant="destructive">
                <AlertDescription data-testid="dialog-error">{error}</AlertDescription>
              </Alert>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={destructive ? "destructive" : "default"}
                pending={busy}
                data-testid="dialog-submit"
              >
                {submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
