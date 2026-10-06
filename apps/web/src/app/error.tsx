"use client";

import { Button } from "@/components/ui/button";
import { RecoveryPage } from "@/components/recovery-page";

export default function ErrorPage({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RecoveryPage
      title="This page could not load"
      description="Please try again. If the problem continues, return to the overview and open the page again."
      action={<Button onClick={retry}>Try again</Button>}
    />
  );
}
