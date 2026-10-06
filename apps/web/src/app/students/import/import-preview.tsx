"use client";

import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StudentImportPreview } from "@/lib/student-import-api";

const PAGE_SIZE = 10;
export function ImportPreview({ preview }: { preview: StudentImportPreview }) {
  const [page, setPage] = useState(0);
  const errors = preview.errors;
  const rows = errors.length
    ? errors
    : preview.commands.map((command) => ({
        row: command.sourceRows[0] ?? 0,
        field: "studentCode" as const,
        message: `${command.student.studentCode} · ${command.student.givenName} ${command.student.familyName} · ${command.guardians.length} guardian(s)`,
      }));
  const count = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, count - 1);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <strong className="text-xl text-foreground">
            {preview.rowCount}
          </strong>
          <p className="text-sm text-muted-foreground">CSV data rows</p>
        </div>
        <div className="rounded-lg border p-4">
          <strong className="text-xl text-foreground">
            {preview.commands.length}
          </strong>
          <p className="text-sm text-muted-foreground">Unique students</p>
        </div>
        <div className="rounded-lg border p-4">
          <strong className="text-xl text-foreground">{errors.length}</strong>
          <p className="text-sm text-muted-foreground">Issues to fix</p>
        </div>
      </div>
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertTitle>Fix CSV errors before importing</AlertTitle>
          <AlertDescription>
            Each issue below names its source row and field. Correct the file or
            mapping, then preview again.
          </AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto">
        <Table aria-label="Import preview">
          <TableHeader>
            <TableRow>
              <TableHead>CSV row</TableHead>
              <TableHead>Field</TableHead>
              <TableHead>
                {errors.length ? "Issue" : "Student preview"}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows
              .slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE)
              .map((row, index) => (
                <TableRow key={`${row.row}-${row.field}-${index}`}>
                  <TableCell>{row.row}</TableCell>
                  <TableCell>{row.field}</TableCell>
                  <TableCell className="whitespace-normal">
                    {row.message}
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
      {count > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="outline"
                disabled={current === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </Button>
            </PaginationItem>
            <PaginationItem>
              <span className="px-3 text-sm text-foreground">
                Page {current + 1} of {count}
              </span>
            </PaginationItem>
            <PaginationItem>
              <Button
                variant="outline"
                disabled={current + 1 >= count}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  );
}
