"use client";

import { DateField } from "@/components/date-field";

import { ChoiceField as Choice } from "@/components/choice-field";

import {
  FormActions,
  PageHeader,
  PageStack,
  SectionHeader,
  Toolbar,
} from "@/components/product-ui";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { format, parseISO } from "date-fns";
import { ReceiptText } from "lucide-react";
import {
  assignFeePlan,
  createFeeHead,
  createFeeLine,
  createFeePlan,
  decimalToMinor,
  formatMinor,
  getFeeSetup,
  grantFeeConcession,
  listFeeOutstanding,
  listFinanceEnrollments,
  listFinanceSchools,
  readFeeReceipt,
  readFeeStatement,
  recordFeePayment,
  reverseFeePayment,
  type FeeReceipt,
  type FeeSetup,
  type FeeStatement,
  type FinanceEnrollment,
  type FinanceSchool,
} from "@/lib/finance-api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LoadingPanel } from "@/components/states";
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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";

const errorText = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "The request could not be completed. Please try again.";
const schoolTime = (value: string, timezone: string) =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parseISO(value));

function TextField({
  label,
  name,
  placeholder,
  required = true,
}: {
  label: string;
  name: string;
  placeholder?: string;
  required?: boolean;
}) {
  const id = useId();
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        placeholder={placeholder}
        required={required}
      />
    </Field>
  );
}

function FormCard({
  title,
  description,
  submitLabel,
  busy,
  disabled,
  paused,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  submitLabel: string;
  busy: boolean;
  disabled?: boolean;
  paused?: boolean;
  onSubmit: (form: FormData) => Promise<void>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit(new FormData(event.currentTarget));
          }}
        >
          <fieldset
            disabled={busy || paused}
            className="flex min-w-0 flex-col gap-5 border-0 p-0"
          >
            {children}
            <FormActions>
              <Button type="submit" disabled={busy || disabled || paused}>
                {paused
                  ? "Refresh balances to continue"
                  : busy
                    ? "Saving…"
                    : submitLabel}
              </Button>
            </FormActions>
          </fieldset>
        </form>
      </CardContent>
    </Card>
  );
}

export function FeesClient() {
  const [schools, setSchools] = useState<FinanceSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [setup, setSetup] = useState<FeeSetup | null>(null);
  const [enrollments, setEnrollments] = useState<FinanceEnrollment[]>([]);
  const [outstanding, setOutstanding] = useState<
    { schoolEnrollmentId: string; outstandingMinor: string }[]
  >([]);
  const [enrollmentId, setEnrollmentId] = useState("");
  const [statement, setStatement] = useState<FeeStatement | null>(null);
  const [receipt, setReceipt] = useState<FeeReceipt | null>(null);
  const [planSessionId, setPlanSessionId] = useState("");
  const [planClassId, setPlanClassId] = useState("");
  const [linePlanId, setLinePlanId] = useState("");
  const [lineHeadId, setLineHeadId] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [assignmentPlanId, setAssignmentPlanId] = useState("");
  const [chargeId, setChargeId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [concessionChargeId, setConcessionChargeId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshPending, setRefreshPending] = useState(false);
  const [error, setError] = useState("");
  const paymentKey = useRef("");
  const paymentFingerprint = useRef("");
  const completedPayment = useRef<{
    fingerprint: string;
    receipt: FeeReceipt;
  } | null>(null);
  const school = schools.find((item) => item.id === schoolId);
  const currency = school?.currency ?? "INR";
  const academic = setup?.academic;
  const selectedEnrollment = enrollments.find(
    (item) => item.id === enrollmentId,
  );
  const planClasses = useMemo(
    () =>
      academic?.classes.filter((item) => item.sessionId === planSessionId) ??
      [],
    [academic, planSessionId],
  );
  const linePlan = setup?.plans.find((item) => item.id === linePlanId);
  const lineSession = academic?.sessions.find(
    (item) => item.id === linePlan?.sessionId,
  );

  useEffect(() => {
    let current = true;
    void listFinanceSchools()
      .then((items) => {
        if (current) {
          setSchools(items);
          setSchoolId(items[0]?.id ?? "");
          if (!items.length) setLoading(false);
        }
      })
      .catch((failure) => {
        if (current) {
          const message = errorText(failure);
          setError(message);
          setLoading(false);
          toast.add({
            type: "error",
            title: "Could not load finance schools",
            description: message,
            priority: "high",
          });
        }
      });
    return () => {
      current = false;
    };
  }, []);

  async function refreshSchool(id: string) {
    const [newSetup, newEnrollments, newOutstanding] = await Promise.all([
      getFeeSetup(id),
      listFinanceEnrollments(id),
      listFeeOutstanding(id),
    ]);
    setSetup(newSetup);
    setEnrollments(newEnrollments);
    setOutstanding(newOutstanding);
  }

  useEffect(() => {
    if (!schoolId) return;
    let current = true;
    void Promise.all([
      getFeeSetup(schoolId),
      listFinanceEnrollments(schoolId),
      listFeeOutstanding(schoolId),
    ])
      .then(([newSetup, newEnrollments, newOutstanding]) => {
        if (current) {
          setSetup(newSetup);
          setEnrollments(newEnrollments);
          setOutstanding(newOutstanding);
          setLoading(false);
          setError("");
        }
      })
      .catch((failure) => {
        if (current) {
          const message = errorText(failure);
          setError(message);
          setLoading(false);
          toast.add({
            type: "error",
            title: "Could not load fees",
            description: message,
            priority: "high",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [schoolId]);

  useEffect(() => {
    if (!schoolId || !enrollmentId) return;
    let current = true;
    void readFeeStatement(schoolId, enrollmentId)
      .then((data) => {
        if (current) setStatement(data);
      })
      .catch((failure) => {
        if (current) {
          const message = errorText(failure);
          setError(message);
          toast.add({
            type: "error",
            title: "Could not load statement",
            description: message,
            priority: "high",
          });
        }
      });
    return () => {
      current = false;
    };
  }, [schoolId, enrollmentId]);

  async function mutate(
    title: string,
    action: () => Promise<unknown>,
    afterWrite?: () => void,
  ) {
    if (!schoolId) return;
    setBusy(true);
    setError("");
    try {
      await action();
      afterWrite?.();
      setRefreshPending(true);
      toast.add({ type: "success", title });
      try {
        await refreshSchool(schoolId);
        if (enrollmentId)
          setStatement(await readFeeStatement(schoolId, enrollmentId));
        setRefreshPending(false);
      } catch (refreshError) {
        const message = `${title}, but balances could not refresh: ${errorText(refreshError)}`;
        setError(message);
        toast.add({
          type: "error",
          title: "Balance refresh failed",
          description: message,
          priority: "high",
        });
      }
    } catch (failure) {
      const message = errorText(failure);
      setError(message);
      toast.add({
        type: "error",
        title: `Could not ${title.toLowerCase()}`,
        description: message,
        priority: "high",
      });
    } finally {
      setBusy(false);
    }
  }

  function selectSchool(next: string) {
    setLoading(Boolean(next));
    setSetup(null);
    setEnrollments([]);
    setOutstanding([]);
    setSchoolId(next);
    setEnrollmentId("");
    setStatement(null);
    setReceipt(null);
    setPlanSessionId("");
    setPlanClassId("");
    setLinePlanId("");
    setLineHeadId("");
    setAssignmentPlanId("");
    setChargeId("");
    setConcessionChargeId("");
    setDueDate("");
    paymentKey.current = "";
    paymentFingerprint.current = "";
    completedPayment.current = null;
  }

  function selectEnrollment(next: string) {
    setEnrollmentId(next);
    setStatement(null);
    setReceipt(null);
    setChargeId("");
    setConcessionChargeId("");
    paymentKey.current = "";
    paymentFingerprint.current = "";
    completedPayment.current = null;
  }

  async function retryRefresh() {
    if (!schoolId) return;
    setBusy(true);
    try {
      await refreshSchool(schoolId);
      if (enrollmentId)
        setStatement(await readFeeStatement(schoolId, enrollmentId));
      setRefreshPending(false);
      setError("");
      toast.add({ type: "success", title: "Balances refreshed" });
    } catch (failure) {
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  if (loading && !school)
    return (
      <PageStack>
        <PageHeader
          title="Fees & Payments"
          description="Loading your school finance workspace."
        />
        <LoadingPanel label="Loading fees and payments" />
      </PageStack>
    );

  return (
    <PageStack>
      <PageHeader
        title={<>Fees & Payments</>}
        description={
          <>Set fees, follow student balances, and record offline receipts.</>
        }
        breadcrumbs={[{ label: "Operations" }]}
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Finance action needs attention</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            {error}
            {refreshPending && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void retryRefresh()}
              >
                Retry balance refresh
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {!schools.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No finance schools available</EmptyTitle>
            <EmptyDescription>
              Ask a school administrator for finance access.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Toolbar label="School context">
            <SectionHeader
              title={<>School context</>}
              description={
                <>
                  Financial records are kept separately for each school and
                  currency.
                </>
              }
            />
            <div className="max-w-md">
              <Choice
                label="School"
                value={schoolId}
                placeholder="Choose school"
                options={schools.map((item) => ({
                  id: item.id,
                  name: item.name,
                }))}
                onChange={selectSchool}
                disabled={busy || refreshPending}
              />
            </div>
          </Toolbar>
          {loading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <Tabs defaultValue="accounts" className="w-full">
              <TabsList>
                <TabsTrigger value="accounts">Student accounts</TabsTrigger>
                <TabsTrigger value="outstanding">Outstanding</TabsTrigger>
                <TabsTrigger value="setup">Fee setup</TabsTrigger>
              </TabsList>
              <TabsContent value="accounts" className="flex flex-col gap-4">
                <Toolbar label="Student statement">
                  <SectionHeader
                    title={<>Student statement</>}
                    description={
                      <>
                        Select an enrolled student to view charges, credits, and
                        receipt history.
                      </>
                    }
                  />
                  <div className="max-w-lg">
                    <Choice
                      label="Student enrollment"
                      disabled={busy || refreshPending}
                      value={enrollmentId}
                      placeholder="Choose student"
                      options={enrollments.map((item) => ({
                        id: item.id,
                        name: `${item.givenName} ${item.familyName} · ${item.admissionNumber}`,
                      }))}
                      onChange={selectEnrollment}
                    />
                  </div>
                </Toolbar>
                {selectedEnrollment && statement && (
                  <>
                    <Card>
                      <CardHeader>
                        <CardTitle>
                          {selectedEnrollment.givenName}{" "}
                          {selectedEnrollment.familyName}
                        </CardTitle>
                        <CardDescription>
                          Admission {selectedEnrollment.admissionNumber} ·
                          Outstanding{" "}
                          {formatMinor(statement.outstandingMinor, currency)}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!statement.charges.length ? (
                          <Empty>
                            <EmptyHeader>
                              <EmptyTitle>No charges yet</EmptyTitle>
                              <EmptyDescription>
                                Assign a fee plan to issue charges for this
                                student.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table aria-label="Student charges">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Charge</TableHead>
                                  <TableHead>Due</TableHead>
                                  <TableHead className="text-right">
                                    Original
                                  </TableHead>
                                  <TableHead className="text-right">
                                    Outstanding
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {statement.charges.map((charge) => (
                                  <TableRow key={charge.id}>
                                    <TableCell>{charge.description}</TableCell>
                                    <TableCell>
                                      {format(parseISO(charge.dueDate), "PP")}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatMinor(
                                        charge.amountMinor,
                                        currency,
                                      )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Badge
                                        variant={
                                          charge.outstandingMinor === "0"
                                            ? "secondary"
                                            : "outline"
                                        }
                                      >
                                        {formatMinor(
                                          charge.outstandingMinor,
                                          currency,
                                        )}
                                      </Badge>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    {statement.charges.some(
                      (item) => item.outstandingMinor !== "0",
                    ) && (
                      <Tabs
                        key={schoolId}
                        defaultValue={
                          school?.canRecord ? "payment" : "concession"
                        }
                      >
                        <TabsList aria-label="Student finance actions">
                          {school?.canRecord && (
                            <TabsTrigger value="payment">
                              Record payment
                            </TabsTrigger>
                          )}
                          {school?.canAdjust && (
                            <TabsTrigger value="concession">
                              Grant concession
                            </TabsTrigger>
                          )}
                        </TabsList>
                        <TabsContent keepMounted value="payment">
                          {school?.canRecord && (
                            <FormCard
                              title="Record offline payment"
                              description="Record a payment against one charge. If a network error occurs, you can safely retry the same payment."
                              submitLabel="Record payment"
                              busy={busy}
                              paused={refreshPending}
                              disabled={!chargeId}
                              onSubmit={async (form) => {
                                setBusy(true);
                                try {
                                  const details = {
                                    schoolEnrollmentId: enrollmentId,
                                    method: paymentMethod,
                                    reference: String(
                                      form.get("reference") ?? "",
                                    ),
                                    allocations: [
                                      {
                                        chargeId,
                                        amountMinor: decimalToMinor(
                                          String(form.get("amount")),
                                          currency,
                                        ),
                                      },
                                    ],
                                  };
                                  const fingerprint = JSON.stringify(details);
                                  if (
                                    paymentFingerprint.current !== fingerprint
                                  ) {
                                    paymentFingerprint.current = fingerprint;
                                    paymentKey.current = crypto.randomUUID();
                                  }
                                  const result =
                                    completedPayment.current?.fingerprint ===
                                    fingerprint
                                      ? completedPayment.current.receipt
                                      : await recordFeePayment(schoolId, {
                                          ...details,
                                          idempotencyKey: paymentKey.current,
                                        });
                                  completedPayment.current = {
                                    fingerprint,
                                    receipt: result,
                                  };
                                  setReceipt(result);
                                  toast.add({
                                    type: "success",
                                    title: `Receipt #${result.receiptNumber} recorded`,
                                  });
                                  try {
                                    await refreshSchool(schoolId);
                                    setStatement(
                                      await readFeeStatement(
                                        schoolId,
                                        enrollmentId,
                                      ),
                                    );
                                    setChargeId("");
                                    paymentKey.current = "";
                                    paymentFingerprint.current = "";
                                    completedPayment.current = null;
                                  } catch (refreshError) {
                                    const message = `Receipt #${result.receiptNumber} was recorded, but the statement could not refresh: ${errorText(refreshError)}`;
                                    setRefreshPending(true);
                                    setError(message);
                                    toast.add({
                                      type: "error",
                                      title: "Statement refresh failed",
                                      description: message,
                                      priority: "high",
                                    });
                                  }
                                } catch (failure) {
                                  const message = errorText(failure);
                                  setError(message);
                                  toast.add({
                                    type: "error",
                                    title: "Could not record payment",
                                    description: message,
                                    priority: "high",
                                  });
                                } finally {
                                  setBusy(false);
                                }
                              }}
                            >
                              <Choice
                                label="Charge"
                                value={chargeId}
                                placeholder="Choose charge"
                                options={statement.charges
                                  .filter(
                                    (item) => item.outstandingMinor !== "0",
                                  )
                                  .map((item) => ({
                                    id: item.id,
                                    name: `${item.description} · ${formatMinor(item.outstandingMinor, currency)}`,
                                  }))}
                                onChange={(next) => {
                                  setChargeId(next);
                                  paymentKey.current = "";
                                }}
                              />
                              <TextField
                                label={`Amount (${currency})`}
                                name="amount"
                                placeholder="0.00"
                              />
                              <Choice
                                label="Method"
                                value={paymentMethod}
                                placeholder="Choose method"
                                options={[
                                  { id: "cash", name: "Cash" },
                                  {
                                    id: "bank_transfer",
                                    name: "Bank transfer",
                                  },
                                  { id: "cheque", name: "Cheque" },
                                  {
                                    id: "card_terminal",
                                    name: "Card terminal",
                                  },
                                  { id: "other", name: "Other" },
                                ]}
                                onChange={(next) => {
                                  setPaymentMethod(next);
                                  paymentKey.current = "";
                                }}
                              />
                              <TextField
                                label="Reference (optional)"
                                name="reference"
                                required={false}
                              />
                            </FormCard>
                          )}
                        </TabsContent>
                        <TabsContent keepMounted value="concession">
                          {school?.canAdjust && (
                            <FormCard
                              title="Grant concession"
                              description="This credit is permanent and needs a reason."
                              submitLabel="Grant concession"
                              busy={busy}
                              paused={refreshPending}
                              disabled={!concessionChargeId}
                              onSubmit={async (form) =>
                                mutate(
                                  "Concession granted",
                                  () =>
                                    grantFeeConcession(schoolId, {
                                      schoolEnrollmentId: enrollmentId,
                                      chargeId: concessionChargeId,
                                      amountMinor: decimalToMinor(
                                        String(form.get("amount")),
                                        currency,
                                      ),
                                      reason: String(form.get("reason")),
                                    }),
                                  () => setConcessionChargeId(""),
                                )
                              }
                            >
                              <Choice
                                label="Charge"
                                value={concessionChargeId}
                                placeholder="Choose charge"
                                options={statement.charges
                                  .filter(
                                    (item) => item.outstandingMinor !== "0",
                                  )
                                  .map((item) => ({
                                    id: item.id,
                                    name: item.description,
                                  }))}
                                onChange={setConcessionChargeId}
                              />
                              <TextField
                                label={`Amount (${currency})`}
                                name="amount"
                                placeholder="0.00"
                              />
                              <TextField label="Reason" name="reason" />
                            </FormCard>
                          )}
                        </TabsContent>
                      </Tabs>
                    )}
                    <Card>
                      <CardHeader>
                        <CardTitle>Ledger activity</CardTitle>
                        <CardDescription>
                          Charges and adjustments remain in the history.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!statement.entries.length ? (
                          <p className="text-muted-foreground">
                            No activity yet.
                          </p>
                        ) : (
                          <div className="overflow-x-auto">
                            <Table aria-label="Ledger activity">
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Date</TableHead>
                                  <TableHead>Type</TableHead>
                                  <TableHead className="text-right">
                                    Amount
                                  </TableHead>
                                  <TableHead>Details</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {statement.entries.map((entry) => (
                                  <TableRow key={entry.id}>
                                    <TableCell>
                                      {schoolTime(
                                        entry.createdAt,
                                        school?.timezone ?? "UTC",
                                      )}
                                    </TableCell>
                                    <TableCell>
                                      {entry.kind.replaceAll("_", " ")}
                                    </TableCell>
                                    <TableCell className="text-right font-medium">
                                      {formatMinor(entry.amountMinor, currency)}
                                    </TableCell>
                                    <TableCell>
                                      {entry.paymentId ? (
                                        <Button
                                          size="sm"
                                          variant="link"
                                          type="button"
                                          onClick={() =>
                                            void readFeeReceipt(
                                              schoolId,
                                              entry.paymentId!,
                                            )
                                              .then(setReceipt)
                                              .catch((failure) =>
                                                setError(errorText(failure)),
                                              )
                                          }
                                        >
                                          View receipt
                                        </Button>
                                      ) : (
                                        (entry.reason ?? "—")
                                      )}
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </>
                )}
                {receipt && (
                  <Card>
                    <CardHeader>
                      <CardTitle>
                        <ReceiptText className="inline" aria-hidden="true" />{" "}
                        Receipt #{receipt.receiptNumber}
                      </CardTitle>
                      <CardDescription>
                        {receipt.reversed ? "Reversed" : "Recorded"} ·{" "}
                        {schoolTime(
                          receipt.createdAt,
                          school?.timezone ?? "UTC",
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                      <p>
                        {formatMinor(receipt.amountMinor, receipt.currency)} ·{" "}
                        {receipt.method.replaceAll("_", " ")}
                        {receipt.reference ? ` · ${receipt.reference}` : ""}
                      </p>
                      {receipt.reversed && (
                        <p>Reversal reason: {receipt.reversalReason}</p>
                      )}
                      {school?.canAdjust && !receipt.reversed && (
                        <form
                          className="flex flex-wrap items-end gap-3"
                          onSubmit={(event) => {
                            event.preventDefault();
                            const reason = String(
                              new FormData(event.currentTarget).get("reason"),
                            );
                            void mutate("Receipt reversed", async () => {
                              setReceipt(
                                await reverseFeePayment(
                                  schoolId,
                                  receipt.id,
                                  reason,
                                ),
                              );
                            });
                          }}
                        >
                          <TextField label="Reversal reason" name="reason" />
                          <Button
                            type="submit"
                            variant="destructive"
                            disabled={busy || refreshPending}
                          >
                            Reverse receipt
                          </Button>
                        </form>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
              <TabsContent value="outstanding">
                <Card>
                  <CardHeader>
                    <CardTitle>Outstanding balances</CardTitle>
                    <CardDescription>
                      Balances are calculated from the school ledger, including
                      reversals.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!outstanding.length ? (
                      <Empty>
                        <EmptyHeader>
                          <EmptyTitle>No outstanding balances</EmptyTitle>
                          <EmptyDescription>
                            Issued charges and payments will appear here.
                          </EmptyDescription>
                        </EmptyHeader>
                      </Empty>
                    ) : (
                      <div className="overflow-x-auto">
                        <Table aria-label="Outstanding balances">
                          <TableHeader>
                            <TableRow>
                              <TableHead>Student</TableHead>
                              <TableHead>Admission number</TableHead>
                              <TableHead className="text-right">
                                Outstanding
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {outstanding.map((item) => {
                              const student = enrollments.find(
                                (enrollment) =>
                                  enrollment.id === item.schoolEnrollmentId,
                              );
                              return (
                                <TableRow key={item.schoolEnrollmentId}>
                                  <TableCell>
                                    {student
                                      ? `${student.givenName} ${student.familyName}`
                                      : item.schoolEnrollmentId}
                                  </TableCell>
                                  <TableCell>
                                    {student?.admissionNumber ?? "—"}
                                  </TableCell>
                                  <TableCell className="text-right font-medium">
                                    {formatMinor(
                                      item.outstandingMinor,
                                      currency,
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="setup" className="flex flex-col gap-4">
                <div className="grid items-start gap-6 xl:grid-cols-2">
                  <div className="min-w-0">
                    <Card>
                      <CardHeader>
                        <CardTitle>Configured plans</CardTitle>
                        <CardDescription>
                          Lines are fixed once a plan has been assigned.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {!setup?.plans.length ? (
                          <Empty>
                            <EmptyHeader>
                              <EmptyTitle>No fee plans</EmptyTitle>
                              <EmptyDescription>
                                Create a fee head and plan to begin.
                              </EmptyDescription>
                            </EmptyHeader>
                          </Empty>
                        ) : (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {setup.plans.map((plan) => (
                              <div
                                key={plan.id}
                                className="rounded-lg border p-4"
                              >
                                <strong>{plan.name}</strong>
                                <p className="text-sm text-muted-foreground">
                                  {
                                    academic?.sessions.find(
                                      (item) => item.id === plan.sessionId,
                                    )?.name
                                  }{" "}
                                  ·{" "}
                                  {
                                    academic?.classes.find(
                                      (item) => item.id === plan.classId,
                                    )?.name
                                  }
                                </p>
                                <ul className="mt-2 flex flex-col gap-1 text-sm">
                                  {setup.lines
                                    .filter((line) => line.planId === plan.id)
                                    .map((line) => (
                                      <li key={line.id}>
                                        {line.label}:{" "}
                                        {formatMinor(
                                          line.amountMinor,
                                          currency,
                                        )}{" "}
                                        · {format(parseISO(line.dueDate), "PP")}
                                      </li>
                                    ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                  {school?.canManage && (
                    <Tabs defaultValue="plans" className="min-w-0">
                      <TabsList aria-label="Fee configuration tasks">
                        <TabsTrigger value="plans">Create plan</TabsTrigger>
                        <TabsTrigger value="heads">Fee heads</TabsTrigger>
                        <TabsTrigger value="lines">Plan lines</TabsTrigger>
                        <TabsTrigger value="issue">Issue charges</TabsTrigger>
                      </TabsList>
                      <TabsContent value="plans" keepMounted>
                        <FormCard
                          title="Fee plan"
                          description="A plan belongs to one academic class and session."
                          submitLabel="Create plan"
                          busy={busy}
                          paused={refreshPending}
                          disabled={!planSessionId || !planClassId}
                          onSubmit={async (form) =>
                            mutate("Fee plan created", () =>
                              createFeePlan(schoolId, {
                                sessionId: planSessionId,
                                classId: planClassId,
                                name: String(form.get("name")),
                              }),
                            )
                          }
                        >
                          <Choice
                            label="Academic session"
                            value={planSessionId}
                            placeholder="Choose session"
                            options={
                              academic?.sessions.map((item) => ({
                                id: item.id,
                                name: item.name,
                              })) ?? []
                            }
                            onChange={(next) => {
                              setPlanSessionId(next);
                              setPlanClassId("");
                            }}
                          />
                          <Choice
                            label="Class"
                            value={planClassId}
                            placeholder="Choose class"
                            options={planClasses.map((item) => ({
                              id: item.id,
                              name: item.name,
                            }))}
                            onChange={setPlanClassId}
                            disabled={!planSessionId}
                          />
                          <TextField
                            label="Plan name"
                            name="name"
                            placeholder="Annual fees"
                          />
                        </FormCard>
                      </TabsContent>
                      <TabsContent value="heads" keepMounted>
                        <FormCard
                          title="Fee head"
                          description="Create a reusable category such as tuition or transport."
                          submitLabel="Add fee head"
                          busy={busy}
                          paused={refreshPending}
                          onSubmit={async (form) =>
                            mutate("Fee head added", () =>
                              createFeeHead(schoolId, {
                                code: String(form.get("code")),
                                name: String(form.get("name")),
                              }),
                            )
                          }
                        >
                          <TextField
                            label="Code"
                            name="code"
                            placeholder="TUITION"
                          />
                          <TextField
                            label="Name"
                            name="name"
                            placeholder="Tuition"
                          />
                        </FormCard>
                      </TabsContent>
                      <TabsContent value="lines" keepMounted>
                        <FormCard
                          title="Plan line"
                          description="Set the fee category, installment label, due date, and exact amount."
                          submitLabel="Add line"
                          busy={busy}
                          paused={refreshPending}
                          disabled={!linePlanId || !lineHeadId || !dueDate}
                          onSubmit={async (form) =>
                            mutate("Fee line added", () =>
                              createFeeLine(schoolId, linePlanId, {
                                headId: lineHeadId,
                                label: String(form.get("label")),
                                dueDate,
                                amountMinor: decimalToMinor(
                                  String(form.get("amount")),
                                  currency,
                                ),
                              }),
                            )
                          }
                        >
                          <Choice
                            label="Plan"
                            value={linePlanId}
                            placeholder="Choose plan"
                            options={
                              setup?.plans.map((item) => ({
                                id: item.id,
                                name: item.name,
                              })) ?? []
                            }
                            onChange={(next) => {
                              setLinePlanId(next);
                              setDueDate("");
                            }}
                          />
                          <Choice
                            label="Fee head"
                            value={lineHeadId}
                            placeholder="Choose head"
                            options={
                              setup?.heads.map((item) => ({
                                id: item.id,
                                name: item.name,
                              })) ?? []
                            }
                            onChange={setLineHeadId}
                          />
                          <TextField
                            label="Installment label"
                            name="label"
                            placeholder="Term 1"
                          />
                          <DateField
                            id="fee-due-date"
                            label="Due date"
                            value={dueDate}
                            onChange={setDueDate}
                            min={lineSession?.startDate}
                            max={lineSession?.endDate}
                            disabled={!lineSession}
                          />
                          <TextField
                            label={`Amount (${currency})`}
                            name="amount"
                            placeholder="0.00"
                          />
                        </FormCard>
                      </TabsContent>
                      <TabsContent value="issue" keepMounted>
                        <FormCard
                          title="Assign and issue"
                          description="Charges are issued immediately and cannot be edited after assignment."
                          submitLabel="Issue charges"
                          busy={busy}
                          paused={refreshPending}
                          disabled={!assignmentPlanId || !enrollmentId}
                          onSubmit={async () =>
                            mutate("Charges issued", () =>
                              assignFeePlan(
                                schoolId,
                                assignmentPlanId,
                                enrollmentId,
                              ),
                            )
                          }
                        >
                          <Choice
                            label="Plan"
                            value={assignmentPlanId}
                            placeholder="Choose plan"
                            options={
                              setup?.plans.map((item) => ({
                                id: item.id,
                                name: item.name,
                              })) ?? []
                            }
                            onChange={setAssignmentPlanId}
                          />
                          <Choice
                            label="Student enrollment"
                            value={enrollmentId}
                            placeholder="Choose student"
                            options={enrollments
                              .filter((item) => item.status === "active")
                              .map((item) => ({
                                id: item.id,
                                name: `${item.givenName} ${item.familyName} · ${item.admissionNumber}`,
                              }))}
                            onChange={selectEnrollment}
                          />
                        </FormCard>
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          )}
        </>
      )}
    </PageStack>
  );
}
