"use client";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/components/workspace-context";
import { ChoiceField } from "@/components/choice-field";
import {
  PageHeader,
  PageStack,
  Toolbar,
  FieldGrid,
  SectionHeader,
  StatusBadge,
  LinkButton,
  DetailList,
} from "@/components/product-ui";
import { EmptyState, LoadingPanel, ErrorState } from "@/components/states";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from "@/components/ui/table";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmationDialog } from "@/components/confirmation-dialog";
import { GradingPolicyForm } from "@/components/results/grading-policy-form";
import { useResultMutation } from "@/components/results/use-result-mutation";
import {
  resultSetup,
  resultEdition,
  generateResults,
  recalculateResults,
  resultLifecycle,
  type ResultSetup,
  type ResultEdition,
  type ResultAction,
} from "@/lib/results-api";
import { formatScore } from "@/lib/examinations-api";
export function ResultsClient() {
  const workspace = useWorkspace();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const schoolId = selected || workspace.results.schools[0]?.id || "";
  return (
    <PageStack>
      <PageHeader
        title="Results & report cards"
        description="Calculate reviewed marks, approve an edition, and publish report cards."
      />
      {workspace.loading ? (
        <LoadingPanel />
      ) : workspace.failed.includes("results") ? (
        <ErrorState
          title="Results access unavailable"
          description="Results access could not be loaded. Use the workspace retry action."
        />
      ) : !schoolId ? (
        <EmptyState
          title="No results access"
          description="Your account has no results permissions at a school."
        />
      ) : (
        <>
          <Toolbar>
            <ChoiceField
              label="School"
              value={schoolId}
              options={workspace.results.schools}
              onChange={setSelected}
              clearable={false}
              disabled={busy}
            />
          </Toolbar>
          <SchoolResults
            key={schoolId}
            schoolId={schoolId}
            onBusyChange={setBusy}
          />
        </>
      )}
    </PageStack>
  );
}
function SchoolResults({
  schoolId,
  onBusyChange,
}: {
  schoolId: string;
  onBusyChange: (busy: boolean) => void;
}) {
  const [editionBusy, setEditionBusy] = useState(false);
  const onEditionBusy = useCallback(
    (value: boolean) => {
      setEditionBusy(value);
      onBusyChange(value);
    },
    [onBusyChange],
  );
  const [setup, setSetup] = useState<ResultSetup | null>(null),
    [error, setError] = useState(""),
    [examId, setExamId] = useState(""),
    [policyId, setPolicyId] = useState(""),
    [batchId, setBatchId] = useState(""),
    [revision, setRevision] = useState(0),
    [key, setKey] = useState(() => crypto.randomUUID());
  const refresh = useCallback(async () => {
    const data = await resultSetup(schoolId);
    setSetup(data);
    setRevision((v) => v + 1);
    setError("");
  }, [schoolId]);
  const mutation = useResultMutation(refresh, onBusyChange);
  const blocked = mutation.disabled || editionBusy;
  useEffect(() => {
    let active = true;
    resultSetup(schoolId)
      .then((data) => {
        if (active) setSetup(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [schoolId]);
  if (!setup)
    return error ? (
      <ErrorState title="Results unavailable" description={error} />
    ) : (
      <LoadingPanel label="Loading result setup" />
    );
  const selectedExam = examId || setup.exams[0]?.id || "",
    batches = setup.batches.filter((b) => b.examId === selectedExam),
    selectedBatch = batches.some((b) => b.id === batchId)
      ? batchId
      : batches[0]?.id || "";
  return (
    <PageStack>
      {mutation.error && (
        <ErrorState
          title={
            mutation.paused
              ? "Reload results to continue"
              : "Results action could not be completed"
          }
          description={mutation.error}
        />
      )}
      <Tabs defaultValue="editions">
        <TabsList>
          <TabsTrigger value="editions" disabled={mutation.busy || editionBusy}>
            Result editions
          </TabsTrigger>
          <TabsTrigger value="grading" disabled={mutation.busy || editionBusy}>
            Grading policies
          </TabsTrigger>
        </TabsList>
        <TabsContent value="editions" className="flex flex-col gap-6">
          <Toolbar>
            <FieldGrid>
              <ChoiceField
                label="Completed examination"
                value={selectedExam}
                options={setup.exams}
                disabled={blocked}
                onChange={(v) => {
                  setExamId(v);
                  setBatchId("");
                  setKey(crypto.randomUUID());
                }}
                clearable={false}
              />
              <ChoiceField
                label="Result edition"
                value={selectedBatch}
                options={batches.map((b) => ({
                  id: b.id,
                  name: `Edition ${b.edition} · ${b.status}`,
                }))}
                disabled={blocked}
                onChange={setBatchId}
              />
            </FieldGrid>
          </Toolbar>
          {setup.capabilities.canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Calculate a new edition</CardTitle>
                <CardDescription>
                  Existing published reports remain available until a reviewed
                  replacement is published.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <ChoiceField
                  label="Grading policy revision"
                  value={policyId}
                  options={setup.policies.map((p) => ({
                    id: p.id,
                    name: `${p.name} · Revision ${p.revision}`,
                  }))}
                  disabled={blocked}
                  onChange={(v) => {
                    setPolicyId(v);
                    setKey(crypto.randomUUID());
                  }}
                />
                {!setup.policies.length && (
                  <p className="text-sm text-muted-foreground">
                    Create a grading policy in the Grading policies tab first.
                  </p>
                )}
                <Button
                  className="self-start"
                  disabled={blocked || !selectedExam || !policyId}
                  onClick={() =>
                    mutation.run(async () => {
                      const b = await generateResults(schoolId, {
                        examId: selectedExam,
                        gradingPolicyId: policyId,
                        idempotencyKey: key,
                      });
                      setBatchId(b.id);
                      setKey(crypto.randomUUID());
                    }, "Result edition calculated")
                  }
                >
                  Calculate new edition
                </Button>
              </CardContent>
            </Card>
          )}
          {!selectedExam ? (
            <EmptyState
              title="No completed examinations"
              description="Complete an examination and lock its reviewed assessments before calculating results."
              action={
                <LinkButton href="/examinations" variant="outline">
                  Open examinations
                </LinkButton>
              }
            />
          ) : !selectedBatch ? (
            <EmptyState
              title="No result editions yet"
              description="Choose a grading policy and calculate a draft edition for this examination."
            />
          ) : (
            <EditionReview
              key={`${selectedBatch}-${revision}`}
              schoolId={schoolId}
              id={selectedBatch}
              onChange={refresh}
              onBusyChange={onEditionBusy}
              contextBlocked={mutation.disabled}
            />
          )}
        </TabsContent>
        <TabsContent value="grading" className="flex flex-col gap-6">
          <SectionHeader title="Saved policy revisions" />
          {setup.policies.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {setup.policies.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle>{p.name}</CardTitle>
                    <CardDescription>
                      Revision {p.revision} · Pass{" "}
                      {formatScore(p.overallPassingPercentage)}% ·{" "}
                      {p.requireSubjectPass
                        ? "Every subject must pass"
                        : "Overall threshold"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6">
                      {p.bands
                        .map(
                          (b) =>
                            `${b.grade}: ≥ ${formatScore(b.minimumPercentage)}%`,
                        )
                        .join(" · ")}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No grading policy"
              description="A results manager must configure the school’s grading policy."
            />
          )}
          {setup.capabilities.canManage && (
            <Card>
              <CardContent>
                <GradingPolicyForm
                  schoolId={schoolId}
                  onSave={mutation.run}
                  disabled={blocked}
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
      <Button
        variant="outline"
        className="self-start"
        disabled={mutation.busy || editionBusy}
        onClick={mutation.reload}
      >
        Reload results
      </Button>
    </PageStack>
  );
}
function EditionReview({
  schoolId,
  id,
  onChange,
  onBusyChange,
  contextBlocked,
}: {
  schoolId: string;
  id: string;
  onChange: () => Promise<void>;
  onBusyChange: (busy: boolean) => void;
  contextBlocked: boolean;
}) {
  const [data, setData] = useState<ResultEdition | null>(null),
    [error, setError] = useState(""),
    [reason, setReason] = useState("");
  const refresh = useCallback(async () => {
    const next = await resultEdition(schoolId, id);
    setData(next);
    await onChange();
  }, [schoolId, id, onChange]);
  const mutation = useResultMutation(refresh, onBusyChange);
  const blocked = mutation.disabled || contextBlocked;
  useEffect(() => {
    let active = true;
    resultEdition(schoolId, id)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [schoolId, id]);
  if (!data)
    return error ? (
      <ErrorState title="Result edition unavailable" description={error} />
    ) : (
      <LoadingPanel label="Loading result edition" />
    );
  const { batch, capabilities: c } = data;
  const actions: ResultAction[] = [];
  if (batch.status === "draft" && c.canManage) actions.push("submit");
  if (
    batch.status === "submitted" &&
    c.canApprove &&
    data.currentAccountId !== batch.preparedByAccountId &&
    data.currentAccountId !== batch.submittedByAccountId
  )
    actions.push("approve");
  if (["submitted", "approved"].includes(batch.status) && c.canApprove)
    actions.push("return");
  if (batch.status === "approved" && c.canPublish) actions.push("publish");
  if (batch.status === "published" && c.canPublish) actions.push("withdraw");
  return (
    <PageStack>
      <SectionHeader
        title={`Edition ${batch.edition}`}
        actions={<StatusBadge status={batch.status} />}
      />
      {(mutation.error || error) && (
        <ErrorState
          title={
            mutation.paused
              ? "Reload the edition to continue"
              : "Results action could not be completed"
          }
          description={mutation.error || error}
        />
      )}
      {!data.sourceCurrent && (
        <ErrorState
          title="Marks need recalculation"
          description={
            batch.status === "published" ||
            batch.status === "superseded" ||
            batch.status === "withdrawn"
              ? "This issued snapshot remains unchanged. Create and review a new edition to include later marks."
              : "Marks changed or a correction is pending. Return to draft if needed, then recalculate before submitting or publishing."
          }
        />
      )}
      <div className="flex flex-wrap gap-2">
        {batch.status === "draft" && c.canManage && (
          <Button
            variant="outline"
            disabled={blocked}
            onClick={() =>
              mutation.run(
                () => recalculateResults(schoolId, batch),
                "Draft recalculated",
              )
            }
          >
            Recalculate draft
          </Button>
        )}
        {actions.map((action) => (
          <ConfirmationDialog
            key={action}
            triggerLabel={
              action === "submit"
                ? "Submit for review"
                : action === "approve"
                  ? "Approve edition"
                  : action === "publish"
                    ? "Publish report cards"
                    : action === "return"
                      ? "Return to draft"
                      : "Withdraw publication"
            }
            title={`${action[0].toUpperCase() + action.slice(1)} this edition?`}
            description={
              action === "publish"
                ? "This makes these reports available to linked students and eligible guardians and replaces the current published edition."
                : action === "withdraw"
                  ? "This immediately removes this edition from student and guardian access."
                  : "This action is recorded in the result history."
            }
            confirmLabel="Confirm"
            destructive={action === "withdraw"}
            disabled={
              blocked ||
              (["submit", "approve", "publish"].includes(action) &&
                !data.sourceCurrent) ||
              (["return", "withdraw"].includes(action) && !reason.trim())
            }
            onConfirm={() =>
              mutation.run(
                () =>
                  resultLifecycle(
                    schoolId,
                    batch,
                    action,
                    reason.trim() || undefined,
                  ),
                "Result workflow updated",
              )
            }
          />
        ))}
      </div>
      {actions.some((a) => a === "return" || a === "withdraw") && (
        <Field>
          <FieldLabel htmlFor={`reason-${id}`}>
            Reason for return or withdrawal
          </FieldLabel>
          <Textarea
            id={`reason-${id}`}
            maxLength={1000}
            value={reason}
            disabled={blocked}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      )}
      {batch.status === "submitted" &&
        c.canApprove &&
        (data.currentAccountId === batch.preparedByAccountId ||
          data.currentAccountId === batch.submittedByAccountId) && (
          <p className="text-sm text-muted-foreground">
            A different authorized staff account must approve this edition.
          </p>
        )}
      <div className="flex flex-col gap-4 md:hidden">
        {data.reports.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle>{r.snapshot.student.name}</CardTitle>
              <CardDescription>
                {r.snapshot.student.admissionNumber}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <DetailList
                items={[
                  { label: "Section", value: r.snapshot.sectionName },
                  {
                    label: "Percentage",
                    value:
                      r.snapshot.overall.percentage === null
                        ? "—"
                        : `${formatScore(r.snapshot.overall.percentage)}%`,
                  },
                  { label: "Grade", value: r.snapshot.overall.grade ?? "—" },
                  {
                    label: "Outcome",
                    value: <StatusBadge status={r.snapshot.overall.outcome} />,
                  },
                ]}
              />
              <LinkButton
                href={`/report-cards/${r.id}`}
                variant="outline"
                aria-label={`View report for ${r.snapshot.student.name}`}
              >
                View report
                <span className="sr-only"> for {r.snapshot.student.name}</span>
              </LinkButton>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="hidden rounded-lg border bg-card md:block">
        <Table>
          <TableCaption>
            Report cards for this edition. Open a report to review papers and
            remarks.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Percentage</TableHead>
              <TableHead>Grade</TableHead>
              <TableHead>Outcome</TableHead>
              <TableHead>Report</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.reports.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.snapshot.student.name}
                  <p className="text-xs text-muted-foreground">
                    {r.snapshot.student.admissionNumber}
                  </p>
                </TableCell>
                <TableCell>{r.snapshot.sectionName}</TableCell>
                <TableCell>
                  {r.snapshot.overall.percentage === null
                    ? "—"
                    : `${formatScore(r.snapshot.overall.percentage)}%`}
                </TableCell>
                <TableCell>{r.snapshot.overall.grade ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={r.snapshot.overall.outcome} />
                </TableCell>
                <TableCell>
                  <LinkButton
                    href={`/report-cards/${r.id}`}
                    variant="outline"
                    size="sm"
                    aria-label={`View report for ${r.snapshot.student.name}`}
                  >
                    View report
                    <span className="sr-only">
                      {" "}
                      for {r.snapshot.student.name}
                    </span>
                  </LinkButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Review history</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-4">
            {data.events.map((e) => (
              <li key={e.id} className="text-sm">
                <p className="font-medium">
                  {e.eventType.replaceAll("_", " ")}
                </p>
                <p className="text-muted-foreground">
                  {new Date(e.createdAt).toLocaleString()}
                  {e.details.reason && ` · ${e.details.reason}`}
                </p>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Button
        variant="outline"
        className="self-start"
        disabled={mutation.busy}
        onClick={mutation.reload}
      >
        Reload edition
      </Button>
    </PageStack>
  );
}
