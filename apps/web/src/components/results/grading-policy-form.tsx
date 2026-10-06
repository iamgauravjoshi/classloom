"use client";
import { useState, useId } from "react";
import { createPolicy, percentageToBasisPoints } from "@/lib/results-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel, FieldDescription } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldGrid, FormActions, SectionHeader } from "@/components/product-ui";
import { ErrorState } from "@/components/states";
export function GradingPolicyForm({
  schoolId,
  onSave,
  disabled,
}: {
  schoolId: string;
  disabled: boolean;
  onSave: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const prefix = useId();
  const [name, setName] = useState(""),
    [threshold, setThreshold] = useState(""),
    [subjectPass, setSubjectPass] = useState(true),
    [error, setError] = useState("");
  const [bands, setBands] = useState([
    { grade: "", minimum: "" },
    { grade: "", minimum: "0" },
  ]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const input = {
            name,
            bands: bands.map((b) => ({
              grade: b.grade,
              minimumPercentage: percentageToBasisPoints(b.minimum),
            })),
            overallPassingPercentage: percentageToBasisPoints(threshold),
            requireSubjectPass: subjectPass,
            idempotencyKey: key,
          };
          if (
            await onSave(
              () => createPolicy(schoolId, input),
              "Grading policy saved",
            )
          ) {
            setName("");
            setThreshold("");
            setBands([
              { grade: "", minimum: "" },
              { grade: "", minimum: "0" },
            ]);
            setKey(crypto.randomUUID());
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : "Check the grading policy");
        }
      }}
    >
      <SectionHeader
        title="New grading policy revision"
        description="Published results keep the policy revision used to calculate them. Configure the school’s actual grading policy before creating results."
      />
      {error && (
        <ErrorState title="Check the grading policy" description={error} />
      )}
      <FieldGrid>
        <Field>
          <FieldLabel htmlFor={`${prefix}-name`}>Policy name</FieldLabel>
          <Input
            id={`${prefix}-name`}
            required
            maxLength={120}
            value={name}
            disabled={disabled}
            onChange={(e) => {
              setName(e.target.value);
              setKey(crypto.randomUUID());
            }}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${prefix}-threshold`}>
            Overall passing percentage
          </FieldLabel>
          <Input
            id={`${prefix}-threshold`}
            required
            inputMode="decimal"
            value={threshold}
            disabled={disabled}
            onChange={(e) => {
              setThreshold(e.target.value);
              setKey(crypto.randomUUID());
            }}
          />
          <FieldDescription>
            Between 0 and 100, with up to two decimal places.
          </FieldDescription>
        </Field>
      </FieldGrid>
      <Field orientation="horizontal">
        <Checkbox
          id={`${prefix}-pass`}
          checked={subjectPass}
          disabled={disabled}
          onCheckedChange={(v) => {
            setSubjectPass(v === true);
            setKey(crypto.randomUUID());
          }}
        />
        <FieldLabel htmlFor={`${prefix}-pass`}>
          Require every included subject to pass
        </FieldLabel>
      </Field>
      <div className="flex flex-col gap-4">
        {bands.map((b, i) => (
          <div
            key={i}
            className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[1fr_1fr_auto]"
          >
            <Field>
              <FieldLabel htmlFor={`${prefix}-grade-${i}`}>
                Grade {i + 1}
              </FieldLabel>
              <Input
                id={`${prefix}-grade-${i}`}
                required
                maxLength={24}
                value={b.grade}
                disabled={disabled}
                onChange={(e) => {
                  setBands(
                    bands.map((x, j) =>
                      j === i ? { ...x, grade: e.target.value } : x,
                    ),
                  );
                  setKey(crypto.randomUUID());
                }}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor={`${prefix}-minimum-${i}`}>
                Minimum percentage
              </FieldLabel>
              <Input
                id={`${prefix}-minimum-${i}`}
                required
                inputMode="decimal"
                value={b.minimum}
                disabled={disabled}
                onChange={(e) => {
                  setBands(
                    bands.map((x, j) =>
                      j === i ? { ...x, minimum: e.target.value } : x,
                    ),
                  );
                  setKey(crypto.randomUUID());
                }}
              />
            </Field>
            <Button
              type="button"
              className="self-end"
              variant="outline"
              aria-label={`Remove grade band ${i + 1}`}
              disabled={disabled || bands.length <= 2}
              onClick={() => {
                setBands(bands.filter((_, j) => j !== i));
                setKey(crypto.randomUUID());
              }}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Use distinct grade labels and minimums. The lowest band must start at
        0%.
      </p>
      <FormActions>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || bands.length >= 20}
          onClick={() => {
            setBands([...bands, { grade: "", minimum: "" }]);
            setKey(crypto.randomUUID());
          }}
        >
          Add grade band
        </Button>
        <Button type="submit" disabled={disabled}>
          Save policy revision
        </Button>
      </FormActions>
    </form>
  );
}
