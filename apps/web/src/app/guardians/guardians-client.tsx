"use client";

import { useDeferredValue, useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem } from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listGuardians, listPeopleSchools, type Guardian, type Page, type PeopleSchool } from "@/lib/students-api";

export function GuardiansClient() {
  const [schools, setSchools] = useState<PeopleSchool[]>([]);
  const [schoolId, setSchoolId] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [status, setStatus] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1) ?? "";
  const [page, setPage] = useState<Page<Guardian> | null>(null);
  const [pageKey, setPageKey] = useState("");
  const [loadingSchools, setLoadingSchools] = useState(true);
  const [error, setError] = useState("");
  const schoolSelectId = useId();
  const statusSelectId = useId();
  const key = `${schoolId}|${deferredQuery}|${status}|${cursor}`;
  const loadingPage = schoolId && pageKey !== key;

  useEffect(() => {
    let cancelled = false;
    listPeopleSchools().then((items) => {
      if (cancelled) return;
      const readable = items.filter((item) => item.canReadGuardians);
      setSchools(readable);
      const requested = new URLSearchParams(window.location.search).get("school");
      setSchoolId(readable.find((item) => item.id === requested)?.id ?? readable[0]?.id ?? "");
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Schools could not be loaded"); })
      .finally(() => { if (!cancelled) setLoadingSchools(false); });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!schoolId) return;
    let cancelled = false;
    listGuardians(schoolId, { q: deferredQuery || undefined, status: status as "active" | "inactive" || undefined, cursor: cursor || undefined })
      .then((result) => { if (!cancelled) { setPage(result); setPageKey(key); setError(""); } })
      .catch((cause) => { if (!cancelled) { setPage(null); setPageKey(key); setError(cause instanceof Error ? cause.message : "Guardians could not be loaded"); } });
    return () => { cancelled = true; };
  }, [schoolId, deferredQuery, status, cursor, key]);

  return <div className="flex flex-col gap-6">
    <div className="page-heading"><div><div className="breadcrumb"><span>School management</span><ChevronRight size={14} /><strong>Guardians</strong></div><h1>Guardians</h1><p>Find family contacts and see the students they support.</p></div></div>
    {error && <Alert variant="destructive"><AlertTitle>Could not load guardians</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loadingSchools ? <Skeleton className="h-64 w-full" /> : schools.length === 0 ? <Alert><AlertTitle>No accessible schools</AlertTitle><AlertDescription>Your workspace does not have guardian directory access at a school.</AlertDescription></Alert> : <Card>
      <CardHeader><CardTitle>Guardian directory</CardTitle><CardDescription>Search by guardian name or code.</CardDescription></CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="grid gap-4 md:grid-cols-3"><Field><FieldLabel htmlFor={schoolSelectId}>School</FieldLabel><Select items={schools.map((item) => ({ label: item.name, value: item.id }))} value={schoolId || null} onValueChange={(value) => { setSchoolId(value ?? ""); setQuery(""); setStatus(""); setCursors([]); setPage(null); }}><SelectTrigger id={schoolSelectId} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup>{schools.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectGroup></SelectContent></Select></Field>
          <Field><FieldLabel htmlFor="guardian-search">Search guardians</FieldLabel><div className="relative"><Search aria-hidden="true" className="absolute left-2 top-2 size-4 text-muted-foreground" /><Input id="guardian-search" className="pl-8" value={query} onChange={(event) => { setQuery(event.target.value); setCursors([]); }} placeholder="Name or code" /></div></Field>
          <Field><FieldLabel htmlFor={statusSelectId}>Status</FieldLabel><Select items={[{ label: "All statuses", value: "__all__" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }]} value={status || "__all__"} onValueChange={(value) => { setStatus(value === "__all__" ? "" : value ?? ""); setCursors([]); }}><SelectTrigger id={statusSelectId} className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectGroup><SelectItem value="__all__">All statuses</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectGroup></SelectContent></Select></Field></div>
        {loadingPage ? <Skeleton className="h-48 w-full" aria-label="Loading guardians" /> : page?.items.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Guardian</TableHead><TableHead>Code</TableHead><TableHead>Email</TableHead><TableHead>Phone</TableHead><TableHead>Status</TableHead><TableHead><span className="sr-only">Profile</span></TableHead></TableRow></TableHeader><TableBody>{page.items.map((guardian) => <TableRow key={guardian.id}><TableCell><Link href={`/guardians/${guardian.id}?school=${schoolId}`} className="flex items-center gap-3 font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"><Avatar size="sm"><AvatarFallback>{(guardian.preferredName || guardian.givenName || "G").slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>{guardian.preferredName || guardian.givenName || "Unknown guardian"} {guardian.familyName}</Link></TableCell><TableCell>{guardian.guardianCode}</TableCell><TableCell>{guardian.email ?? "—"}</TableCell><TableCell>{guardian.phone ?? "—"}</TableCell><TableCell><Badge variant={guardian.status === "active" ? "default" : "secondary"}>{guardian.status}</Badge></TableCell><TableCell><Button variant="outline" size="sm" nativeButton={false} render={<Link href={`/guardians/${guardian.id}?school=${schoolId}`} />}>View</Button></TableCell></TableRow>)}</TableBody></Table></div> : !error && <Empty><EmptyHeader><EmptyTitle>No guardians found</EmptyTitle><EmptyDescription>Try another search or filter. Guardians appear here when linked to a student enrolled at this school.</EmptyDescription></EmptyHeader></Empty>}
        {!loadingPage && (cursors.length > 0 || page?.nextCursor) && <Pagination><PaginationContent><PaginationItem><Button variant="outline" disabled={cursors.length === 0} onClick={() => setCursors((current) => current.slice(0, -1))}>Previous</Button></PaginationItem><PaginationItem><span className="px-3 text-sm text-foreground">Page {cursors.length + 1}</span></PaginationItem><PaginationItem><Button variant="outline" disabled={!page?.nextCursor} onClick={() => { if (page?.nextCursor) setCursors((current) => [...current, page.nextCursor!]); }}>Next</Button></PaginationItem></PaginationContent></Pagination>}
      </CardContent>
    </Card>}
  </div>;
}
