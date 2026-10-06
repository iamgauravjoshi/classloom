"use client";

import { ReloadPageButton } from "@/components/reload-page-button";

import { ChoiceField as Choice } from "@/components/choice-field";

import {
  Toolbar,
  DetailList,
  PageHeader,
  PageStack,
  StatusBadge,
} from "@/components/product-ui";

import {
  useDeferredValue,
  useEffect,
  useId,
  useState,
  type FormEvent,
} from "react";
import { Plus, Search } from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import {
  addStaffSchool,
  createStaff,
  getStaff,
  linkStaffAccount,
  listEligibleAccounts,
  listStaff,
  listStaffSchools,
  unlinkStaffAccount,
  updateStaff,
  updateTeacher,
  type EligibleAccount,
  type StaffCreate,
  type StaffPage,
  type StaffRecord,
  type StaffSchool,
} from "@/lib/staff-api";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, LoadingPanel } from "@/components/states";
import { StaffForm } from "./staff-form";
import { DateField } from "@/components/date-field";

const message = (error: unknown) =>
  error instanceof Error ? error.message : "The request could not be completed";

function StaffDetails({
  staff,
  schoolId,
  schools,
  onChanged,
  tab,
  onTabChange,
}: {
  staff: StaffRecord;
  schoolId: string;
  schools: StaffSchool[];
  onChanged: (fresh: StaffRecord) => void;
  tab: string;
  onTabChange: (value: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [eligible, setEligible] = useState<EligibleAccount[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [targetSchoolId, setTargetSchoolId] = useState("");
  const [targetKind, setTargetKind] = useState<"staff" | "teacher">("staff");
  const [targetDesignation, setTargetDesignation] = useState(staff.designation);
  const [startDate, setStartDate] = useState(staff.startDate ?? "");
  const [error, setError] = useState("");
  const accountChoiceId = useId();
  const schoolChoiceId = useId();
  const kindChoiceId = useId();

  useEffect(() => {
    if (!staff.canEditShared || staff.membershipId) return;
    let cancelled = false;
    listEligibleAccounts(schoolId)
      .then((items) => {
        if (!cancelled) setEligible(items);
      })
      .catch((cause) => {
        if (!cancelled) setError(message(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, staff.canEditShared, staff.membershipId]);

  async function mutate(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    try {
      await action();
      const fresh = await getStaff(schoolId, staff.id);
      toast.add({ type: "success", title: "Saved", description: success });
      onChanged(fresh);
    } catch (cause) {
      const detail = message(cause);
      setError(detail);
      toast.add({
        type: "error",
        title: "Could not save staff details",
        description: detail,
        priority: "high",
      });
    } finally {
      setBusy(false);
    }
  }
  const formValue = (data: FormData, name: string) =>
    String(data.get(name) ?? "").trim();

  return (
    <Card className="border-0 bg-transparent p-0">
      <CardHeader className="px-0">
        <CardTitle>
          {staff.preferredName || staff.givenName} {staff.familyName}
        </CardTitle>
        <CardDescription>
          {staff.staffCode} · {staff.designation} at{" "}
          {schools.find((school) => school.id === schoolId)?.name ??
            "this school"}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6 px-0">
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Could not complete the request</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap gap-2">
          <StatusBadge status={staff.status} />
          <Badge variant="secondary">{staff.kind}</Badge>
          <Badge variant="outline">
            {staff.membershipId ? "Linked account" : "No login account"}
          </Badge>
        </div>

        <Tabs
          value={tab}
          onValueChange={(value) => onTabChange(value ?? "profile")}
        >
          <TabsList aria-label="Staff profile areas">
            <TabsTrigger value="profile">Profile & account</TabsTrigger>
            <TabsTrigger value="schools">School assignments</TabsTrigger>
          </TabsList>
          <TabsContent value="profile" keepMounted>
            <DetailList
              items={[
                { label: "Work email", value: <>{staff.workEmail || "—"}</> },
                { label: "Phone", value: <>{staff.phone || "—"}</> },
                { label: "Start date", value: <>{staff.startDate || "—"}</> },
                {
                  label: "Qualification",
                  value: <>{staff.qualification || "—"}</>,
                },
                {
                  label: "Specialization",
                  value: <>{staff.specialization || "—"}</>,
                },
              ]}
            />
            {staff.canEditShared && (
              <div className="grid gap-6 lg:grid-cols-2">
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    void mutate(
                      () =>
                        updateStaff(schoolId, staff.id, {
                          profile: {
                            givenName: formValue(data, "givenName"),
                            familyName: formValue(data, "familyName"),
                            preferredName:
                              formValue(data, "preferredName") || null,
                            workEmail: formValue(data, "workEmail") || null,
                            phone: formValue(data, "phone") || null,
                          },
                        }),
                      "Shared profile updated",
                    );
                  }}
                >
                  <fieldset disabled={busy} className="min-w-0 border-0 p-0">
                    <FieldGroup>
                      <h3 className="font-semibold">Shared profile</h3>
                      <Field>
                        <FieldLabel htmlFor="staff-edit-given">
                          Given name
                        </FieldLabel>
                        <Input
                          id="staff-edit-given"
                          name="givenName"
                          defaultValue={staff.givenName}
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="staff-edit-family">
                          Family name
                        </FieldLabel>
                        <Input
                          id="staff-edit-family"
                          name="familyName"
                          defaultValue={staff.familyName}
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="staff-edit-preferred">
                          Preferred name
                        </FieldLabel>
                        <Input
                          id="staff-edit-preferred"
                          name="preferredName"
                          defaultValue={staff.preferredName ?? ""}
                          maxLength={120}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="staff-edit-email">
                          Work email
                        </FieldLabel>
                        <Input
                          id="staff-edit-email"
                          name="workEmail"
                          type="email"
                          defaultValue={staff.workEmail ?? ""}
                          maxLength={254}
                        />
                      </Field>
                      <Field>
                        <FieldLabel htmlFor="staff-edit-phone">
                          Phone
                        </FieldLabel>
                        <Input
                          id="staff-edit-phone"
                          name="phone"
                          type="tel"
                          defaultValue={staff.phone ?? ""}
                          maxLength={30}
                        />
                      </Field>
                      <Button type="submit" variant="outline" disabled={busy}>
                        Save shared profile
                      </Button>
                    </FieldGroup>
                  </fieldset>
                </form>
                <div className="flex flex-col gap-6">
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const data = new FormData(event.currentTarget);
                      void mutate(
                        () =>
                          updateTeacher(schoolId, staff.id, {
                            qualification:
                              formValue(data, "qualification") || null,
                            specialization:
                              formValue(data, "specialization") || null,
                          }),
                        "Teacher details updated",
                      );
                    }}
                  >
                    <fieldset disabled={busy} className="min-w-0 border-0 p-0">
                      <FieldGroup>
                        <h3 className="font-semibold">Teacher details</h3>
                        <Field>
                          <FieldLabel htmlFor="staff-edit-qualification">
                            Qualification
                          </FieldLabel>
                          <Input
                            id="staff-edit-qualification"
                            name="qualification"
                            defaultValue={staff.qualification ?? ""}
                            maxLength={240}
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="staff-edit-specialization">
                            Specialization
                          </FieldLabel>
                          <Input
                            id="staff-edit-specialization"
                            name="specialization"
                            defaultValue={staff.specialization ?? ""}
                            maxLength={240}
                          />
                        </Field>
                        <Button type="submit" variant="outline" disabled={busy}>
                          Save teacher details
                        </Button>
                      </FieldGroup>
                    </fieldset>
                  </form>
                  <FieldGroup>
                    <h3 className="font-semibold">Login account</h3>
                    {staff.membershipId ? (
                      <>
                        <p className="text-sm text-muted-foreground">
                          This profile is linked to an account. Unlinking is
                          blocked when academic assignments use it.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () => unlinkStaffAccount(schoolId, staff.id),
                              "Account unlinked",
                            )
                          }
                        >
                          Unlink account
                        </Button>
                      </>
                    ) : (
                      <>
                        <Choice
                          id={accountChoiceId}
                          label="Eligible account"
                          value={membershipId}
                          onChange={setMembershipId}
                          options={eligible.map((item) => ({
                            id: item.id,
                            name: item.displayName
                              ? `${item.displayName} (${item.email})`
                              : item.email,
                          }))}
                          placeholder="Select account"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !membershipId}
                          onClick={() =>
                            void mutate(
                              () =>
                                linkStaffAccount(
                                  schoolId,
                                  staff.id,
                                  membershipId,
                                ),
                              "Account linked",
                            )
                          }
                        >
                          Link account
                        </Button>
                      </>
                    )}
                  </FieldGroup>
                </div>
              </div>
            )}
            {!staff.canEditShared && (
              <p className="text-sm text-muted-foreground">
                Shared profile and account details can be changed by a manager
                with access to every affiliated school.
              </p>
            )}
          </TabsContent>
          <TabsContent
            value="schools"
            keepMounted
            className="flex flex-col gap-6"
          >
            {staff.canManageAffiliation && (
              <form
                onSubmit={(event: FormEvent<HTMLFormElement>) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  void mutate(
                    () =>
                      updateStaff(schoolId, staff.id, {
                        affiliation: {
                          designation: formValue(data, "designation"),
                          status: formValue(data, "status") as
                            "active" | "inactive",
                          kind: formValue(data, "kind") as "staff" | "teacher",
                          startDate: startDate || null,
                        },
                      }),
                    "School assignment updated",
                  );
                }}
              >
                <fieldset disabled={busy} className="min-w-0 border-0 p-0">
                  <FieldGroup>
                    <h3 className="font-semibold">School assignment</h3>
                    <Field>
                      <FieldLabel htmlFor="staff-edit-designation">
                        Designation
                      </FieldLabel>
                      <Input
                        id="staff-edit-designation"
                        name="designation"
                        defaultValue={staff.designation}
                        required
                        maxLength={120}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="staff-edit-kind">
                        Role at this school
                      </FieldLabel>
                      <Select
                        name="kind"
                        defaultValue={staff.kind}
                        items={[
                          { label: "Staff", value: "staff" },
                          { label: "Teacher", value: "teacher" },
                        ]}
                      >
                        <SelectTrigger id="staff-edit-kind" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="staff">Staff</SelectItem>
                            <SelectItem value="teacher">Teacher</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="staff-edit-status">
                        Status
                      </FieldLabel>
                      <Select
                        name="status"
                        defaultValue={staff.status}
                        items={[
                          { label: "Active", value: "active" },
                          { label: "Inactive", value: "inactive" },
                        ]}
                      >
                        <SelectTrigger
                          id="staff-edit-status"
                          className="w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="inactive">Inactive</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </Field>
                    <DateField
                      id="staff-edit-start-date"
                      label="Start date (optional)"
                      value={startDate}
                      onChange={setStartDate}
                      required={false}
                    />
                    <Button type="submit" variant="outline" disabled={busy}>
                      Save school assignment
                    </Button>
                  </FieldGroup>
                </fieldset>
              </form>
            )}
            {schools.some(
              (school) => school.id !== schoolId && school.canManageStaff,
            ) && (
              <FieldGroup>
                <h3 className="font-semibold">Add another school</h3>
                <Choice
                  id={schoolChoiceId}
                  label="School"
                  value={targetSchoolId}
                  onChange={setTargetSchoolId}
                  options={schools
                    .filter(
                      (school) =>
                        school.id !== schoolId && school.canManageStaff,
                    )
                    .map((school) => ({ id: school.id, name: school.name }))}
                  placeholder="Select school"
                />
                <Field>
                  <FieldLabel htmlFor={kindChoiceId}>Role at school</FieldLabel>
                  <Select
                    items={[
                      { label: "Staff", value: "staff" },
                      { label: "Teacher", value: "teacher" },
                    ]}
                    value={targetKind}
                    onValueChange={(next) =>
                      setTargetKind(next as "staff" | "teacher")
                    }
                  >
                    <SelectTrigger id={kindChoiceId} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="staff">Staff</SelectItem>
                        <SelectItem value="teacher">Teacher</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="staff-new-designation">
                    Designation at new school
                  </FieldLabel>
                  <Input
                    id="staff-new-designation"
                    value={targetDesignation}
                    onChange={(event) =>
                      setTargetDesignation(event.target.value)
                    }
                    maxLength={120}
                  />
                </Field>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy || !targetSchoolId || !targetDesignation.trim()
                  }
                  onClick={() =>
                    void mutate(
                      () =>
                        addStaffSchool(schoolId, staff.id, {
                          targetSchoolId,
                          designation: targetDesignation.trim(),
                          kind: targetKind,
                        }),
                      "School added",
                    )
                  }
                >
                  Add school assignment
                </Button>
              </FieldGroup>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function StaffClient() {
  const [schools, setSchools] = useState<StaffSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [cursor, setCursor] = useState("");
  const [page, setPage] = useState<StaffPage | null>(null);
  const [pageKey, setPageKey] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [profileTab, setProfileTab] = useState("profile");
  const [selected, setSelected] = useState<StaffRecord | null>(null);
  const [version, setVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const schoolChoiceId = useId();
  const kindChoiceId = useId();
  const statusChoiceId = useId();
  const queryKey = `${schoolId}|${deferredQuery}|${kind}|${status}|${cursor}|${version}`;
  const directoryLoading = Boolean(schoolId && pageKey !== queryKey);

  useEffect(() => {
    listStaffSchools()
      .then((items) => {
        setSchools(items);
        setSchoolId(items[0]?.id ?? "");
        setLoading(false);
      })
      .catch((cause) => {
        setError(message(cause));
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    listStaff(schoolId, {
      q: deferredQuery || undefined,
      kind: (kind as "teacher" | "staff") || undefined,
      status: (status as "active" | "inactive") || undefined,
      cursor: cursor || undefined,
    })
      .then((result) => {
        if (!cancelled) {
          setPage(result);
          setPageKey(queryKey);
          setError("");
        }
      })
      .catch((cause) => {
        if (!cancelled) {
          setPage(null);
          setPageKey(queryKey);
          setError(message(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, deferredQuery, kind, status, cursor, version, queryKey]);
  useEffect(() => {
    if (!schoolId || !selectedId) return;
    let cancelled = false;
    getStaff(schoolId, selectedId)
      .then((record) => {
        if (!cancelled) setSelected(record);
      })
      .catch((cause) => {
        if (!cancelled) setError(message(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [schoolId, selectedId, version]);
  const changed = (fresh: StaffRecord) => {
    setSelected(fresh);
    setVersion((current) => current + 1);
  };
  async function save(input: StaffCreate) {
    setBusy(true);
    setError("");
    try {
      const created = await createStaff(schoolId, input);
      setCreateOpen(false);
      setSelectedId(created.id);
      setVersion((current) => current + 1);
      toast.add({
        type: "success",
        title: "Staff profile created",
        description: `${created.givenName} ${created.familyName} is in the directory.`,
      });
      return true;
    } catch (cause) {
      const detail = message(cause);
      setError(detail);
      toast.add({
        type: "error",
        title: "Could not create staff profile",
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
        title={<>Staff & teachers</>}
        description={
          <>
            Manage staff profiles, school assignments and teacher account links.
          </>
        }
        breadcrumbs={[{ label: "People" }]}
        actions={
          <>
            {schools.find((school) => school.id === schoolId)
              ?.canManageStaff && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus data-icon="inline-start" />
                Add staff
              </Button>
            )}
          </>
        }
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Could not load staff details</AlertTitle>
          <AlertDescription>
            <p>{error}</p>
            {!schools.length && <ReloadPageButton />}
          </AlertDescription>
        </Alert>
      )}
      {loading ? (
        <Skeleton className="h-56 w-full" />
      ) : schools.length === 0 && error ? null : schools.length === 0 ? (
        <Alert>
          <AlertTitle>No accessible schools</AlertTitle>
          <AlertDescription>
            Your workspace does not have staff directory access at a school.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Toolbar label="Staff directory filters">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Choice
                id={schoolChoiceId}
                label="School"
                value={schoolId}
                onChange={(value) => {
                  setSchoolId(value);
                  setSelectedId("");
                  setSelected(null);
                  setPage(null);
                  setCursor("");
                }}
                options={schools.map((school) => ({
                  id: school.id,
                  name: school.name,
                }))}
                placeholder="Select school"
              />
              <Field>
                <FieldLabel htmlFor="staff-search">Search</FieldLabel>
                <div className="relative">
                  <Search
                    aria-hidden="true"
                    className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="staff-search"
                    className="pl-10"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setCursor("");
                    }}
                    placeholder="Name or code"
                  />
                </div>
              </Field>
              <Choice
                id={kindChoiceId}
                label="Role"
                value={kind}
                onChange={(value) => {
                  setKind(value);
                  setCursor("");
                }}
                options={[
                  { id: "staff", name: "Staff" },
                  { id: "teacher", name: "Teacher" },
                ]}
                placeholder="All roles"
                clearable
              />
              <Choice
                id={statusChoiceId}
                label="Status"
                value={status}
                onChange={(value) => {
                  setStatus(value);
                  setCursor("");
                }}
                options={[
                  { id: "active", name: "Active" },
                  { id: "inactive", name: "Inactive" },
                ]}
                placeholder="All statuses"
                clearable
              />
            </div>
            {(query || kind || status) && (
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setKind("");
                    setStatus("");
                    setCursor("");
                  }}
                >
                  Clear filters
                </Button>
              </div>
            )}
          </Toolbar>
          <Card>
            <CardHeader>
              <CardTitle>Directory</CardTitle>
              <CardDescription>
                Find people by name or staff code. Profiles can be affiliated
                with more than one school.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {directoryLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : page?.items.length ? (
                <Table aria-label="Staff directory">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Staff code</TableHead>
                      <TableHead>Designation</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">View profile</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {page.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">
                          {item.preferredName || item.givenName}{" "}
                          {item.familyName}
                        </TableCell>
                        <TableCell>{item.staffCode}</TableCell>
                        <TableCell>{item.designation}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{item.kind}</Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            size="sm"
                            aria-label={`View ${item.preferredName || item.givenName} ${item.familyName} profile`}
                            onClick={() => {
                              setError("");
                              setSelected(null);
                              setProfileTab("profile");
                              setSelectedId(item.id);
                            }}
                          >
                            View
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : !error ? (
                <EmptyState
                  title="No staff found"
                  description="Try another search or filter, or add the first staff profile for this school."
                />
              ) : null}
              {!directoryLoading && (
                <div className="flex justify-end gap-2">
                  {cursor && (
                    <Button variant="outline" onClick={() => setCursor("")}>
                      First page
                    </Button>
                  )}
                  {page?.nextCursor && (
                    <Button
                      variant="outline"
                      onClick={() => setCursor(page.nextCursor!)}
                    >
                      Next page
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          <Dialog
            open={Boolean(selectedId)}
            onOpenChange={(open) => {
              if (!open) setSelectedId("");
            }}
          >
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Staff profile</DialogTitle>
                <DialogDescription>
                  Review this person’s details, account link, and school
                  assignments.
                </DialogDescription>
              </DialogHeader>
              {selected && selected.id === selectedId ? (
                <StaffDetails
                  key={schoolId + "-" + selectedId + "-" + version}
                  staff={selected}
                  schoolId={schoolId}
                  schools={schools}
                  onChanged={changed}
                  tab={profileTab}
                  onTabChange={setProfileTab}
                />
              ) : error ? (
                <Alert variant="destructive">
                  <AlertTitle>Could not load profile</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : (
                <LoadingPanel label="Loading staff profile" />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create staff profile</DialogTitle>
            <DialogDescription>
              Add a person to the selected school. A login account can be linked
              later.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Check the staff details</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <StaffForm busy={busy} onSave={save} />
        </DialogContent>
      </Dialog>
    </PageStack>
  );
}
