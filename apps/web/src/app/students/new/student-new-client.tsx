"use client";

import { ReloadPageButton } from "@/components/reload-page-button";

import { LinkButton, PageHeader, PageStack } from "@/components/product-ui";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { getAcademicSetup, type AcademicSetup } from "@/lib/academics-api";
import { admitStudent, type AdmissionInput } from "@/lib/enrollment-api";
import { listPeopleSchools, type PeopleSchool } from "@/lib/students-api";
import { StudentForm } from "../student-form";

export function StudentNewClient() {
  const router = useRouter();
  const [schools, setSchools] = useState<PeopleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const schoolSelectId = useId();

  useEffect(() => {
    let cancelled = false;
    listPeopleSchools()
      .then((items) => {
        if (cancelled) return;
        const manageable = items.filter(
          (item) => item.canManageStudents && item.canManageEnrollment,
        );
        setSchools(manageable);
        const requested = new URLSearchParams(window.location.search).get(
          "school",
        );
        setSchoolId(
          manageable.find((item) => item.id === requested)?.id ??
            manageable[0]?.id ??
            "",
        );
      })
      .catch((cause) => {
        if (!cancelled)
          setError(
            cause instanceof Error
              ? cause.message
              : "Schools could not be loaded",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    getAcademicSetup(schoolId)
      .then((value) => {
        if (!cancelled) {
          setSetup(value);
          setError("");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setSetup(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Academic setup could not be loaded",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId]);

  async function save(input: AdmissionInput) {
    setBusy(true);
    setError("");
    try {
      const result = await admitStudent(schoolId, input);
      toast.add({
        type: "success",
        title: "Student admitted",
        description:
          "The student, school admission, and academic placement were saved.",
      });
      router.push(`/students/${result.student.id}?school=${schoolId}`);
      return true;
    } catch (cause) {
      const detail =
        cause instanceof Error ? cause.message : "Admission could not be saved";
      setError(detail);
      toast.add({
        type: "error",
        title: "Could not admit student",
        description: detail,
        priority: "high",
      });
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageStack>
      <PageHeader
        title={<>Admit student</>}
        description={
          <>Create a student profile and initial school placement together.</>
        }
        breadcrumbs={[{ label: "Students", href: "/students" }]}
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Admission needs attention</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {!setup && !busy && <ReloadPageButton />}
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : schools.length === 0 && error ? null : schools.length === 0 ? (
        <Alert>
          <AlertTitle>No school available for admissions</AlertTitle>
          <AlertDescription>
            You need student and enrollment management access at a school.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Field>
            <FieldLabel htmlFor={schoolSelectId}>School</FieldLabel>
            <Select
              items={schools.map((item) => ({
                label: item.name,
                value: item.id,
              }))}
              value={schoolId || null}
              onValueChange={(next) => {
                setSchoolId(next ?? "");
                setSetup(null);
              }}
            >
              <SelectTrigger id={schoolSelectId} className="max-w-md">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {schools.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {setup ? (
            setup.sessions.length ? (
              <StudentForm
                key={schoolId}
                setup={setup}
                busy={busy}
                onSave={save}
              />
            ) : (
              <Alert>
                <AlertTitle>Set up an academic session first</AlertTitle>
                <AlertDescription>
                  Create an active session, class, and section before admitting
                  students.
                </AlertDescription>
                <LinkButton href="/academic-setup" variant="outline">
                  Open academic setup
                </LinkButton>
              </Alert>
            )
          ) : (
            !error && <Skeleton className="h-96 w-full" />
          )}
        </>
      )}
    </PageStack>
  );
}
