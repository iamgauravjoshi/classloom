"use client";
import { useCallback, useEffect, useState } from "react";
import { myReports } from "@/lib/results-api";
import {
  PageHeader,
  PageStack,
  StatusBadge,
  LinkButton,
  DetailList,
} from "@/components/product-ui";
import { EmptyState, ErrorState, LoadingPanel } from "@/components/states";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatScore } from "@/lib/examinations-api";
export function ReportCardsClient() {
  const [reports, setReports] = useState<Awaited<
      ReturnType<typeof myReports>
    > | null>(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setReports(await myReports());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load report cards");
    }
  }, []);
  useEffect(() => {
    let current = true;
    myReports()
      .then((data) => {
        if (current) setReports(data);
      })
      .catch((e) => {
        if (current) setError(e.message);
      });
    return () => {
      current = false;
    };
  }, []);
  return (
    <PageStack>
      <PageHeader
        title="My report cards"
        description="Current published reports for your linked student profile or children with portal access."
      />
      {error ? (
        <ErrorState title="Report cards unavailable" description={error} />
      ) : !reports ? (
        <LoadingPanel label="Loading published report cards" />
      ) : !reports.length ? (
        <EmptyState
          title="No published report cards"
          description="Report cards appear here after the school reviews and publishes them. Your student or guardian profile must be linked, with guardian portal access enabled."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {reports.map(({ report: r, batch: b }) => (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle>{r.snapshot.exam.name}</CardTitle>
                <CardDescription>
                  {r.snapshot.student.name} · {r.snapshot.school.name}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DetailList
                  items={[
                    {
                      label: "Class",
                      value: `${r.snapshot.className} · ${r.snapshot.sectionName}`,
                    },
                    { label: "Session", value: r.snapshot.sessionName },
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
                      value: (
                        <StatusBadge status={r.snapshot.overall.outcome} />
                      ),
                    },
                    {
                      label: "Published",
                      value: b.publishedAt
                        ? new Date(b.publishedAt).toLocaleDateString()
                        : "—",
                    },
                  ]}
                />
              </CardContent>
              <CardFooter>
                <LinkButton href={`/report-cards/${r.id}`} variant="outline">
                  View report card
                </LinkButton>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
      <Button variant="outline" className="self-start" onClick={load}>
        Reload report cards
      </Button>
    </PageStack>
  );
}
