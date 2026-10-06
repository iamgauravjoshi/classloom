import { RecoveryPage } from "@/components/recovery-page";

export default function NotFound() {
  return (
    <RecoveryPage
      title="Page not found"
      description="This address may have changed, or the page may no longer be available. Return to the overview to continue."
    />
  );
}
