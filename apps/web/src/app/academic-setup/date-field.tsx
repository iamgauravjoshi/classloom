"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";

export function DateField({
  id,
  label,
  value,
  onChange,
  error,
  earliestDate,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  earliestDate?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateOnly(value) : undefined;

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={id}
              type="button"
              variant="outline"
              aria-invalid={Boolean(error) || undefined}
              aria-required="true"
              className="w-full justify-between"
            />
          }
        >
          {selected ? format(selected, "PPP") : "Pick a date"}
          <CalendarDays data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={selected}
            defaultMonth={selected}
            disabled={earliestDate ? { before: parseDateOnly(earliestDate) } : undefined}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatDateOnly(date));
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
