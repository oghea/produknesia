"use client";

import { useFormStatus } from "react-dom";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

type ButtonProps = React.ComponentProps<typeof Button>;

/** Submit button for plain `<form action={serverAction}>` forms: disables
 * itself and shows a spinner while the action is in flight. */
export function PendingButton({ children, disabled, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button {...props} type="submit" disabled={pending || disabled}>
      {pending && (
        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      )}
      {children}
    </Button>
  );
}

/** Icon-only pending submit for the comment delete form. */
export function CommentDeleteButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      className="flex cursor-pointer items-center gap-1 rounded-md p-1 text-xs text-muted-foreground transition-colors hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Trash2 className="size-3.5" aria-hidden="true" />
      )}
    </button>
  );
}
