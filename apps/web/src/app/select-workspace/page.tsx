import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readServerSession } from "@/lib/auth-api";
import { SelectWorkspace } from "./select-workspace";
export default async function SelectWorkspacePage() {
  const session=await readServerSession((await cookies()).toString());
  if(!session) redirect("/login");
  if(!session.workspaceSelectionRequired && session.memberships.length > 0) redirect("/dashboard");
  return <SelectWorkspace session={session}/>;
}
