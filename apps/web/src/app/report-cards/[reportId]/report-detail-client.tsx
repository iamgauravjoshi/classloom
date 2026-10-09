"use client";
import { useCallback, useEffect, useState } from "react";
import {
  reportDetail,
  saveRemarks,
  type ReportDetail,
} from "@/lib/results-api";
import { responseError } from "@/lib/api-error";
import { formatScore } from "@/lib/examinations-api";
import {
  PageHeader,
  PageStack,
  StatusBadge,
  DetailList,
} from "@/components/product-ui";
import { LoadingPanel, ErrorState } from "@/components/states";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { useResultMutation } from "@/components/results/use-result-mutation";
export function ReportDetailClient({ id }: { id: string }) {
  const [data, setData] = useState<ReportDetail | null>(null),
    [error, setError] = useState(""),
    [remarks, setRemarks] = useState(""),
    [downloading, setDownloading] = useState(false);
  const refresh = useCallback(async () => {
    const next = await reportDetail(id);
    setData(next);
    setRemarks(next.report.remarks ?? "");
    setError("");
  }, [id]);
  const mutation = useResultMutation(refresh);
  useEffect(() => {
    let active = true;
    reportDetail(id)
      .then((d) => {
        if (active) {
          setData(d);
          setRemarks(d.report.remarks ?? "");
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (remarks === (data?.report.remarks ?? "")) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [remarks, data]);
  async function download() {
    if (downloading) return;
    setDownloading(true);
    try {
      const response = await fetch(`/api/results/reports/${id}/pdf`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok)
        throw responseError(
          await response.json().catch(() => ({})),
          "Could not download this report card",
        );
      const url = URL.createObjectURL(await response.blob()),
        a = document.createElement("a");
      a.href = url;
      a.download = `report-card-${id}.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.add({ type: "success", title: "Report card downloaded" });
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not download report card";
      setError(message);
      toast.add({ type: "error", title: message });
    } finally {
      setDownloading(false);
    }
  }
  if (!data)
    return (
      <PageStack>
        <PageHeader title="Report card" />
        {error ? (
          <ErrorState title="Report card unavailable" description={error} />
        ) : (
          <LoadingPanel label="Loading report card" />
        )}
        <Button variant="outline" onClick={mutation.reload}>
          Retry
        </Button>
      </PageStack>
    );
  const { report: r, batch: b } = data,
    s = r.snapshot;
  return (
    <PageStack>
      <PageHeader
        title="Report card"
        description={`${s.exam.name} · ${s.school.name}`}
        breadcrumbs={[
          {
            label:
              data.capabilities.canRead ||
              data.capabilities.canManage ||
              data.capabilities.canApprove ||
              data.capabilities.canPublish ||
              data.capabilities.canExport
                ? "Results"
                : "My report cards",
            href: Object.values(data.capabilities).some(Boolean)
              ? "/results"
              : "/report-cards",
          },
          { label: s.student.name },
        ]}
        actions={
          data.canDownload && (
            <Button disabled={downloading} onClick={download}>
              {downloading ? "Preparing PDF…" : "Download PDF"}
            </Button>
          )
        }
      />
      {(error || mutation.error) && (
        <ErrorState
          title={
            mutation.paused
              ? "Reload the report to continue"
              : "Report action could not be completed"
          }
          description={error || mutation.error}
        />
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle>{s.student.name}</CardTitle>
            <StatusBadge status={b.status} />
            <StatusBadge status={s.overall.outcome} />
          </div>
          <CardDescription>
            Edition {b.edition}
            {b.status !== "published"
              ? " · This is not the current published report."
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DetailList
            items={[
              { label: "Student code", value: s.student.code },
              { label: "Admission number", value: s.student.admissionNumber },
              { label: "Roll number", value: s.student.rollNumber ?? "—" },
              { label: "Date of birth", value: s.student.dateOfBirth },
              {
                label: "Class & section",
                value: `${s.className} · ${s.sectionName}`,
              },
              { label: "Academic session", value: s.sessionName },
              {
                label: "Included marks",
                value: `${formatScore(s.overall.earnedScore)} / ${formatScore(s.overall.maximumScore)}`,
              },
              {
                label: "Percentage",
                value:
                  s.overall.percentage === null
                    ? "—"
                    : `${formatScore(s.overall.percentage)}%`,
              },
              { label: "Overall grade", value: s.overall.grade ?? "—" },
            ]}
          />
        </CardContent>
      </Card>
      <div className="flex flex-col gap-5">
        {s.subjects.map((subject) => (
          <Card key={subject.subjectId}>
            <CardHeader>
              <div className="flex flex-wrap justify-between gap-3">
                <CardTitle>{subject.name}</CardTitle>
                <StatusBadge status={subject.outcome} />
              </div>
              <CardDescription>
                {formatScore(subject.earnedScore)} /{" "}
                {formatScore(subject.maximumScore)} ·{" "}
                {subject.percentage === null
                  ? "No percentage"
                  : formatScore(subject.percentage) + "%"}{" "}
                · Grade {subject.grade ?? "—"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col divide-y">
                {subject.assessments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-col gap-2 py-4 sm:flex-row sm:justify-between"
                  >
                    <div>
                      <p className="font-medium break-words">{p.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {p.date} · Passing {formatScore(p.passingScore)} /{" "}
                        {formatScore(p.maximumScore)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={p.status} />
                      {p.score !== null && (
                        <span className="font-medium tabular-nums">
                          {formatScore(p.score)} / {formatScore(p.maximumScore)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Staff remarks</CardTitle>
        </CardHeader>
        <CardContent>
          {data.capabilities.canManage && b.status === "draft" ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.run(
                  () => saveRemarks(id, b, remarks.trim() || null),
                  "Staff remarks saved",
                );
              }}
            >
              <Field>
                <FieldLabel htmlFor="report-remarks">Remarks</FieldLabel>
                <Textarea
                  id="report-remarks"
                  value={remarks}
                  maxLength={1000}
                  disabled={mutation.disabled}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </Field>
              {s.overall.outcome === "incomplete" && (
                <p className="text-sm text-muted-foreground">
                  Add a remark explaining the incomplete coverage before
                  submitting this edition.
                </p>
              )}
              <Button
                className="self-start"
                type="submit"
                disabled={mutation.disabled || remarks === (r.remarks ?? "")}
              >
                Save remarks
              </Button>
            </form>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-6">
              {r.remarks ?? "No staff remarks."}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Grading policy</CardTitle>
          <CardDescription>
            {s.policy.name} · Revision {s.policy.revision}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm leading-6">
          <p>
            {s.policy.bands
              .map((b) => `${b.grade} ≥ ${formatScore(b.minimumPercentage)}%`)
              .join(" · ")}
          </p>
          <p>
            Overall pass threshold:{" "}
            {formatScore(s.policy.overallPassingPercentage)}%.{" "}
            {s.policy.requireSubjectPass
              ? "Each included subject must pass."
              : "Overall threshold determines passing, except absence or incomplete coverage."}
          </p>
          <p className="text-muted-foreground">
            Absent counts as zero and fails. Exempt papers are excluded. Not
            assessed means incomplete. Percentages are truncated to two
            decimals; grade thresholds use the exact marks ratio.
          </p>
        </CardContent>
      </Card>
      <Button
        variant="outline"
        className="self-start"
        disabled={mutation.busy}
        onClick={mutation.reload}
      >
        Reload report card
      </Button>
    </PageStack>
  );
}
