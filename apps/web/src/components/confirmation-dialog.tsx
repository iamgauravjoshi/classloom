"use client";

import { useRef } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ConfirmationDialog({
  triggerLabel,
  triggerAccessibleLabel,
  title,
  description,
  confirmLabel,
  onConfirm,
  disabled = false,
  destructive = false,
}: {
  triggerLabel: string;
  triggerAccessibleLabel?: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  disabled?: boolean;
  destructive?: boolean;
}) {
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="outline"
            disabled={disabled}
            aria-label={triggerAccessibleLabel}
          />
        }
      >
        {triggerLabel}
      </DialogTrigger>
      <DialogContent initialFocus={cancel}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button ref={cancel} variant="outline" />}>
            Cancel
          </DialogClose>
          <DialogClose
            render={
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={onConfirm}
              />
            }
          >
            {confirmLabel}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
