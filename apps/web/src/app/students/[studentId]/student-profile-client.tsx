"use client";

import { ReloadPageButton } from "@/components/reload-page-button";

import { ProfileEditor } from "@/components/profile-editor";

import {
  DetailList,
  FieldGrid,
  FormActions,
  PageHeader,
  PageStack,
  StatusBadge,
} from "@/components/product-ui";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { ApiRequestError } from "@/lib/api-error";
import { getAcademicSetup, type AcademicSetup } from "@/lib/academics-api";
import {
  listAcademicEnrollments,
  listSchoolEnrollments,
  type AcademicEnrollment,
  type SchoolEnrollment,
} from "@/lib/enrollment-api";
import {
  createGuardianForStudent,
  getStudent,
  linkStudentAccount,
  listEligiblePersonAccounts,
  listPeopleSchools,
  unlinkStudentAccount,
  updateStudent,
  updateStudentGuardianRelationship,
  type EligiblePersonAccount,
  type PeopleSchool,
  type Student,
  type StudentGuardianRelationship,
} from "@/lib/students-api";
import { StudentEnrollmentPanel } from "./student-enrollment-panel";

type EnrollmentGroup = {
  school: SchoolEnrollment;
  academics: AcademicEnrollment[];
};
const detail = (cause: unknown) =>
  cause instanceof Error ? cause.message : "The request could not be completed";
const relationshipTypes = [
  "mother",
  "father",
  "legal_guardian",
  "grandparent",
  "sibling",
  "other",
] as const;
const flagLabels = {
  primaryContact: "Primary contact",
  emergencyContact: "Emergency contact",
  authorizedPickup: "Authorized pickup",
  financialResponsibility: "Financial responsibility",
  portalAccess: "Portal access",
} as const;
type Flag = keyof typeof flagLabels;

function OverviewPanel({
  student,
  canEdit,
  busy,
  onSave,
}: {
  student: Student;
  canEdit: boolean;
  busy: boolean;
  onSave: (changes: object) => Promise<void>;
}) {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    setFields({});
    setFormError("");
    try {
      await onSave({
        givenName: value("givenName"),
        familyName: value("familyName"),
        preferredName: value("preferredName") || null,
        email: value("email") || null,
        phone: value("phone") || null,
      });
    } catch (cause) {
      setFormError(detail(cause));
      if (cause instanceof ApiRequestError) setFields(cause.fields);
    }
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Student details</CardTitle>
        <CardDescription>
          Identity details are shared across schools in this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <DetailList
          items={[
            { label: "Student code", value: <>{student.studentCode}</> },
            { label: "Date of birth", value: <>{student.dateOfBirth}</> },
            { label: "Email", value: <>{student.email ?? "—"}</> },
            { label: "Phone", value: <>{student.phone ?? "—"}</> },
          ]}
        />
        {canEdit ? (
          <ProfileEditor
            title="Edit student profile"
            description="Changes apply to this shared profile across schools in your workspace."
            busy={busy}
          >
            {formError && (
              <Alert variant="destructive">
                <AlertTitle>Check the profile details</AlertTitle>
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <form onSubmit={(event) => void submit(event)}>
              <fieldset disabled={busy} className="min-w-0 border-0 p-0">
                <FieldGroup>
                  <FieldGrid>
                    {(["givenName", "familyName"] as const).map((key) => (
                      <Field
                        key={key}
                        data-invalid={Boolean(fields[key]) || undefined}
                      >
                        <FieldLabel htmlFor={`student-edit-${key}`}>
                          {key === "givenName" ? "Given name" : "Family name"}
                        </FieldLabel>
                        <Input
                          id={`student-edit-${key}`}
                          name={key}
                          defaultValue={student[key]}
                          required
                          minLength={2}
                          maxLength={120}
                          aria-invalid={Boolean(fields[key]) || undefined}
                        />
                        {fields[key] && <FieldError>{fields[key]}</FieldError>}
                      </Field>
                    ))}
                  </FieldGrid>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field>
                      <FieldLabel htmlFor="student-edit-preferredName">
                        Preferred name
                      </FieldLabel>
                      <Input
                        id="student-edit-preferredName"
                        name="preferredName"
                        defaultValue={student.preferredName ?? ""}
                        maxLength={120}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="student-edit-email">
                        Email
                      </FieldLabel>
                      <Input
                        id="student-edit-email"
                        name="email"
                        type="email"
                        defaultValue={student.email ?? ""}
                        maxLength={254}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="student-edit-phone">
                        Phone
                      </FieldLabel>
                      <Input
                        id="student-edit-phone"
                        name="phone"
                        type="tel"
                        defaultValue={student.phone ?? ""}
                        maxLength={30}
                      />
                    </Field>
                  </div>
                  <FormActions>
                    <Button type="submit" disabled={busy}>
                      Save profile
                    </Button>
                  </FormActions>
                </FieldGroup>
              </fieldset>
            </form>
          </ProfileEditor>
        ) : (
          <p className="text-sm text-muted-foreground">
            Shared details can be edited by a manager with access to every
            school where this student is actively enrolled.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function RelationshipEditor({
  item,
  schoolId,
  busy,
  onSave,
}: {
  item: NonNullable<Student["guardians"]>[number];
  schoolId: string;
  busy: boolean;
  onSave: (id: string, input: object) => Promise<void>;
}) {
  const [value, setValue] = useState<StudentGuardianRelationship>(
    item.relationship,
  );
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={`/guardians/${item.guardian.id}?school=${schoolId}`}
            className="font-semibold text-foreground underline-offset-4 hover:underline"
          >
            {item.guardian.preferredName || item.guardian.givenName}{" "}
            {item.guardian.familyName}
          </Link>
          <p className="text-sm text-muted-foreground">
            {item.guardian.guardianCode} ·{" "}
            {value.relationshipType.replaceAll("_", " ")}
          </p>
        </div>
        <StatusBadge status={value.status} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.keys(flagLabels) as Flag[]).map((flag) => (
          <label
            key={flag}
            className="flex items-center gap-2 text-sm font-medium text-foreground"
          >
            <Checkbox
              checked={value[flag]}
              onCheckedChange={(checked) =>
                setValue((current) => ({
                  ...current,
                  [flag]: checked === true,
                }))
              }
              disabled={busy}
            />
            {flagLabels[flag]}
          </label>
        ))}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="mt-4"
        disabled={busy}
        onClick={() => {
          void onSave(value.id, {
            primaryContact: value.primaryContact,
            emergencyContact: value.emergencyContact,
            authorizedPickup: value.authorizedPickup,
            financialResponsibility: value.financialResponsibility,
            portalAccess: value.portalAccess,
          }).catch(() => {});
        }}
      >
        Save responsibilities
      </Button>
    </div>
  );
}

function GuardiansPanel({
  student,
  schoolId,
  busy,
  canManage,
  onMutate,
}: {
  student: Student;
  schoolId: string;
  busy: boolean;
  canManage: boolean;
  onMutate: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [relationshipType, setRelationshipType] =
    useState<(typeof relationshipTypes)[number]>("mother");
  const [flags, setFlags] = useState<Record<Flag, boolean>>({
    primaryContact: false,
    emergencyContact: false,
    authorizedPickup: false,
    financialResponsibility: false,
    portalAccess: false,
  });
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    try {
      await onMutate(
        () =>
          createGuardianForStudent(schoolId, student.id, {
            guardian: {
              guardianCode: value("guardianCode"),
              givenName: value("givenName"),
              familyName: value("familyName"),
              email: value("email") || null,
              phone: value("phone") || null,
            },
            relationship: { relationshipType, ...flags },
          }),
        "Guardian connected to student",
      );
      setShowForm(false);
    } catch {
      /* The page alert and toast describe the failure. */
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Guardians</CardTitle>
            <CardDescription>
              Family contacts and responsibilities for this student.
            </CardDescription>
          </div>
          {canManage && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowForm((current) => !current)}
            >
              <Plus data-icon="inline-start" />
              Add guardian
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {student.guardians?.length ? (
          student.guardians.map((item) => (
            <RelationshipEditor
              key={item.relationship.id}
              item={item}
              schoolId={schoolId}
              busy={busy || !canManage}
              onSave={(id, input) =>
                onMutate(
                  () =>
                    updateStudentGuardianRelationship(
                      schoolId,
                      student.id,
                      id,
                      input,
                    ),
                  "Guardian responsibilities updated",
                )
              }
            />
          ))
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No guardians linked</EmptyTitle>
              <EmptyDescription>
                Add a guardian contact for this student.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {showForm && (
          <form
            onSubmit={(event) => void create(event)}
            className="rounded-lg border p-4"
          >
            <fieldset disabled={busy} className="min-w-0 border-0 p-0">
              <FieldGroup>
                <h3 className="font-semibold">Add guardian</h3>
                <div className="grid gap-4 sm:grid-cols-3">
                  {[
                    ["guardianCode", "Guardian code"],
                    ["givenName", "Given name"],
                    ["familyName", "Family name"],
                  ].map(([key, label]) => (
                    <Field key={key}>
                      <FieldLabel htmlFor={`new-guardian-${key}`}>
                        {label}
                      </FieldLabel>
                      <Input
                        id={`new-guardian-${key}`}
                        name={key}
                        required
                        minLength={key === "guardianCode" ? undefined : 2}
                        maxLength={key === "guardianCode" ? 20 : 120}
                      />
                    </Field>
                  ))}
                </div>
                <FieldGrid>
                  <Field>
                    <FieldLabel htmlFor="new-guardian-email">Email</FieldLabel>
                    <Input
                      id="new-guardian-email"
                      name="email"
                      type="email"
                      maxLength={254}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="new-guardian-phone">Phone</FieldLabel>
                    <Input
                      id="new-guardian-phone"
                      name="phone"
                      type="tel"
                      maxLength={30}
                    />
                  </Field>
                </FieldGrid>
                <Field>
                  <FieldLabel htmlFor="new-guardian-relationship">
                    Relationship
                  </FieldLabel>
                  <Select
                    items={relationshipTypes.map((value) => ({
                      value,
                      label: value.replaceAll("_", " "),
                    }))}
                    value={relationshipType}
                    onValueChange={(value) =>
                      setRelationshipType(value as typeof relationshipType)
                    }
                  >
                    <SelectTrigger
                      id="new-guardian-relationship"
                      className="w-full"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {relationshipTypes.map((value) => (
                          <SelectItem key={value} value={value}>
                            {value.replaceAll("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(Object.keys(flagLabels) as Flag[]).map((flag) => (
                    <label
                      key={flag}
                      className="flex items-center gap-2 text-sm font-medium text-foreground"
                    >
                      <Checkbox
                        checked={flags[flag]}
                        onCheckedChange={(checked) =>
                          setFlags((current) => ({
                            ...current,
                            [flag]: checked === true,
                          }))
                        }
                      />
                      {flagLabels[flag]}
                    </label>
                  ))}
                </div>
                <FormActions>
                  <Button type="submit" disabled={busy}>
                    Save guardian
                  </Button>
                </FormActions>
              </FieldGroup>
            </fieldset>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function AccountPanel({
  student,
  schoolId,
  canManage,
  busy,
  onMutate,
}: {
  student: Student;
  schoolId: string;
  canManage: boolean;
  busy: boolean;
  onMutate: (action: () => Promise<unknown>, success: string) => Promise<void>;
}) {
  const [eligible, setEligible] = useState<EligiblePersonAccount[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!canManage || student.membershipId) return;
    let cancelled = false;
    listEligiblePersonAccounts(schoolId, "student")
      .then((items) => {
        if (!cancelled) setEligible(items);
      })
      .catch((cause) => {
        if (!cancelled) setError(detail(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, schoolId, student.membershipId]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account access</CardTitle>
        <CardDescription>
          A profile can be linked to one active account in this workspace.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Accounts could not be loaded</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Badge
          variant={student.membershipId ? "default" : "secondary"}
          className="w-fit"
        >
          {student.membershipId ? "Linked account" : "No login account"}
        </Badge>
        {canManage &&
          (student.membershipId ? (
            <Button
              variant="outline"
              disabled={busy}
              className="w-fit"
              onClick={() => {
                void onMutate(
                  () => unlinkStudentAccount(schoolId, student.id),
                  "Student account unlinked",
                ).catch(() => {});
              }}
            >
              Unlink account
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <Field className="min-w-56 flex-1">
                <FieldLabel htmlFor="student-account">
                  Eligible account
                </FieldLabel>
                <Select
                  items={eligible.map((item) => ({
                    label: item.displayName
                      ? `${item.displayName} (${item.email})`
                      : item.email,
                    value: item.id,
                  }))}
                  value={membershipId || null}
                  onValueChange={(value) => setMembershipId(value ?? "")}
                >
                  <SelectTrigger id="student-account" className="w-full">
                    <SelectValue placeholder="Choose account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {eligible.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.displayName
                            ? `${item.displayName} (${item.email})`
                            : item.email}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Button
                variant="outline"
                disabled={busy || !membershipId}
                onClick={() => {
                  void onMutate(
                    () =>
                      linkStudentAccount(schoolId, student.id, membershipId),
                    "Student account linked",
                  ).catch(() => {});
                }}
              >
                Link account
              </Button>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

export function StudentProfileClient({ studentId }: { studentId: string }) {
  const [schools, setSchools] = useState<PeopleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [student, setStudent] = useState<Student | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentGroup[]>([]);
  const [setup, setSetup] = useState<AcademicSetup | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const school = schools.find((item) => item.id === schoolId);

  useEffect(() => {
    let cancelled = false;
    listPeopleSchools()
      .then((items) => {
        if (cancelled) return;
        const readable = items.filter((item) => item.canReadStudents);
        setSchools(readable);
        const requested = new URLSearchParams(window.location.search).get(
          "school",
        );
        setSchoolId(
          readable.find((item) => item.id === requested)?.id ??
            readable[0]?.id ??
            "",
        );
        if (!readable.length) setLoading(false);
      })
      .catch((cause) => {
        if (!cancelled) {
          setError(detail(cause));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    Promise.all([
      getStudent(schoolId, studentId),
      listSchoolEnrollments(schoolId, studentId),
      getAcademicSetup(schoolId),
    ])
      .then(async ([profile, schoolEnrollments, academicSetup]) => {
        const history = await Promise.all(
          schoolEnrollments.map(async (record) => ({
            school: record,
            academics: await listAcademicEnrollments(schoolId, record.id),
          })),
        );
        if (!cancelled) {
          setStudent(profile);
          setEnrollments(history);
          setSetup(academicSetup);
          setError("");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setStudent(null);
          setError(detail(cause));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, studentId, version]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      setVersion((current) => current + 1);
      toast.add({ type: "success", title: "Saved", description: success });
    } catch (cause) {
      const message = detail(cause);
      setError(message);
      toast.add({
        type: "error",
        title: "Could not save student details",
        description: message,
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
        title={
          <>
            {student
              ? `${student.preferredName || student.givenName || "Unknown student"} ${student.familyName}`
              : "Student profile"}
          </>
        }
        description={
          student
            ? `${student.studentCode} · ${school?.name ?? "School record"}`
            : "Identity, relationships, and account access."
        }
        actions={student && <StatusBadge status={student.status} />}
        breadcrumbs={[{ label: "Students", href: "/students" }]}
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Student details need attention</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {!student && <ReloadPageButton />}
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : !school && error ? null : !school ? (
        <Alert>
          <AlertTitle>No accessible school</AlertTitle>
          <AlertDescription>
            Your workspace cannot view this student.
          </AlertDescription>
        </Alert>
      ) : student ? (
        <>
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="guardians">Guardians</TabsTrigger>
              <TabsTrigger value="enrollment">Enrollment history</TabsTrigger>
              <TabsTrigger value="account">Account access</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <OverviewPanel
                key={`${student.id}-${version}`}
                student={student}
                canEdit={Boolean(student.canEditShared)}
                busy={busy}
                onSave={(changes) =>
                  mutate(
                    () => updateStudent(schoolId, student.id, changes),
                    "Student profile updated",
                  )
                }
              />
            </TabsContent>
            <TabsContent value="guardians">
              <GuardiansPanel
                student={student}
                schoolId={schoolId}
                busy={busy}
                canManage={
                  school.canManageGuardians && school.canManageStudents
                }
                onMutate={mutate}
              />
            </TabsContent>
            <TabsContent value="enrollment">
              <StudentEnrollmentPanel
                schoolId={schoolId}
                studentId={student.id}
                groups={enrollments}
                setup={setup}
                canManage={school.canManageEnrollment}
                busy={busy}
                onMutate={mutate}
              />
            </TabsContent>
            <TabsContent value="account">
              <AccountPanel
                student={student}
                schoolId={schoolId}
                canManage={Boolean(
                  student.canEditShared && school.canManageStudents,
                )}
                busy={busy}
                onMutate={mutate}
              />
            </TabsContent>
          </Tabs>
        </>
      ) : (
        !error && (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Student not found</EmptyTitle>
              <EmptyDescription>
                Check the selected school or return to the directory.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )
      )}
    </PageStack>
  );
}
