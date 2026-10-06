"use client";

import type { ReactNode } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ProfileEditor({
  title,
  description,
  busy,
  children,
}: {
  title: string;
  description: string;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <Dialog
      disablePointerDismissal={busy}
      onOpenChange={(open, event) => {
        if (busy && !open) event.cancel();
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="self-start max-sm:w-full"
          />
        }
      >
        <Pencil aria-hidden="true" />
        {title}
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
