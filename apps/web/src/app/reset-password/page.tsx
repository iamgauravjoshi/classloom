import { AuthForm } from "@/components/auth-form";
export default async function ResetPasswordPage({searchParams}:{searchParams:Promise<{token?:string|string[]}>}) {
  const params=await searchParams;
  return <AuthForm mode="reset" token={Array.isArray(params.token)?params.token[0]:params.token} />;
}
