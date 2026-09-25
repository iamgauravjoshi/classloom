import { AuthForm } from "@/components/auth-form";
import { cookies } from "next/headers";
import { readServerSession } from "@/lib/auth-api";
export default async function AcceptInvitationPage({searchParams}:{searchParams:Promise<{token?:string|string[]}>}) {
  const session=await readServerSession((await cookies()).toString());
  const params=await searchParams;
  return <AuthForm mode={session ? "invite-existing" : "invite"} currentEmail={session?.account.email} token={Array.isArray(params.token)?params.token[0]:params.token} />;
}
