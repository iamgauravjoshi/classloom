"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { listPeopleSchools, type PeopleSchool } from "@/lib/students-api";
import { listAcademicSchools, type AcademicSchool } from "@/lib/academics-api";
import {
  listTimetableSchools,
  type TimetableSchool,
} from "@/lib/timetable-api";
import {
  listAttendanceSchools,
  type AttendanceSchool,
} from "@/lib/attendance-api";
import {
  listAdmissionSchools,
  type AdmissionSchool,
} from "@/lib/admissions-api";
import { listFinanceSchools, type FinanceSchool } from "@/lib/finance-api";
import { listExamSchools, type ExamSchool } from "@/lib/examinations-api";

type WorkspaceData = {
  people: PeopleSchool[];
  academic: AcademicSchool[];
  timetable: TimetableSchool[];
  attendance: AttendanceSchool[];
  admissions: AdmissionSchool[];
  finance: FinanceSchool[];
  examinations: ExamSchool[];
};
const empty: WorkspaceData = {
  people: [],
  academic: [],
  timetable: [],
  attendance: [],
  admissions: [],
  finance: [],
  examinations: [],
};
type Workspace = WorkspaceData & {
  loading: boolean;
  failed: string[];
  retry: () => void;
};
const WorkspaceContext = createContext<Workspace | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<WorkspaceData>(empty);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState<string[]>([]);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let current = true;
    const sources = {
      people: listPeopleSchools,
      academic: listAcademicSchools,
      timetable: listTimetableSchools,
      attendance: listAttendanceSchools,
      admissions: listAdmissionSchools,
      finance: listFinanceSchools,
      examinations: listExamSchools,
    };
    // Each endpoint returns only schools allowed by the active server membership.
    Promise.allSettled(Object.values(sources).map((read) => read())).then(
      (results) => {
        if (!current) return;
        const next = { ...empty };
        const errors: string[] = [];
        Object.keys(sources).forEach((key, index) => {
          const result = results[index];
          if (result.status === "fulfilled")
            Object.assign(next, { [key]: result.value });
          else errors.push(key);
        });
        setData(next);
        setFailed(errors);
        setLoading(false);
      },
    );
    return () => {
      current = false;
    };
  }, [revision]);
  return (
    <WorkspaceContext value={{ ...data, loading, failed, retry }}>
      {children}
    </WorkspaceContext>
  );
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace components require WorkspaceProvider");
  return value;
}
