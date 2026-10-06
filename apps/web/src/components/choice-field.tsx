"use client";

import { useId } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function ChoiceField({
  id,
  label,
  value,
  options,
  onChange,
  placeholder = "Choose an option",
  disabled,
  clearable = true,
}: {
  id?: string;
  label: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  clearable?: boolean;
}) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const items = [
    { value: "__none__", label: placeholder },
    ...options.map((option) => ({ value: option.id, label: option.name })),
  ];
  return (
    <Field>
      <FieldLabel htmlFor={controlId}>{label}</FieldLabel>
      <Select
        items={items}
        value={value || "__none__"}
        onValueChange={(next) =>
          onChange(next === "__none__" ? "" : (next ?? ""))
        }
        disabled={disabled}
      >
        <SelectTrigger id={controlId} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {items.map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                disabled={item.value === "__none__" && !clearable}
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}
