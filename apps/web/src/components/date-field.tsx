"use client";

import { useId, useState } from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverClose,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateOnly, parseDateOnly } from "@/lib/date-only";

// Forms exchange date-only strings with the API; calendar Dates stay local to this control.
export function DateField({
  id,
  label,
  value,
  onChange,
  error,
  earliestDate,
  yearDropdown = false,
  required = true,
  min,
  max,
  disabled,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  earliestDate?: string;
  yearDropdown?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  disabled?: boolean;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const [open, setOpen] = useState(false);
  const selected = value ? parseDateOnly(value) : undefined;

  return (
    <Field data-invalid={Boolean(error) || undefined}>
      <FieldLabel htmlFor={controlId}>
        {label}
        {required && <span aria-hidden="true">*</span>}
      </FieldLabel>
      <Popover modal open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              id={controlId}
              type="button"
              variant="outline"
              aria-invalid={Boolean(error) || undefined}
              aria-label={`${label}: ${selected ? format(selected, "PPP") : "Choose date"}${required ? " (required)" : ""}`}
              disabled={disabled}
              className="w-full justify-between font-normal"
            />
          }
        >
          <span className="truncate">
            {selected ? format(selected, "PPP") : "Choose date"}
          </span>
          <CalendarDays data-icon="inline-end" />
        </PopoverTrigger>
        <PopoverContent
          className="w-auto gap-0 p-0"
          align="start"
          collisionPadding={2}
          collisionAvoidance={{ side: "shift", align: "shift" }}
          data-calendar-picker=""
          aria-label={`${label} date picker`}
        >
          <Calendar
            mode="single"
            captionLayout={yearDropdown ? "dropdown" : "label"}
            startMonth={yearDropdown ? new Date(1900, 0, 1) : undefined}
            endMonth={yearDropdown ? new Date() : undefined}
            selected={selected}
            defaultMonth={
              selected ??
              (min || earliestDate
                ? parseDateOnly(min || earliestDate!)
                : undefined)
            }
            disabled={(date) => {
              const value = formatDateOnly(date);
              return Boolean(
                ((min || earliestDate) && value < (min || earliestDate)!) ||
                (max && value > max),
              );
            }}
            onSelect={(date) => {
              if (!date) return;
              onChange(formatDateOnly(date));
              setOpen(false);
            }}
          />
          <div className="border-t p-2">
            <PopoverClose
              render={
                <Button type="button" variant="ghost" className="w-full" />
              }
            >
              Close calendar
            </PopoverClose>
          </div>
        </PopoverContent>
      </Popover>
      {!required && selected && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => onChange("")}
        >
          Clear date
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
