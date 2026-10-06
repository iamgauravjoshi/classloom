"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Use only when initial context is unavailable and no editable record is open.
export function ReloadPageButton() {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => window.location.reload()}
    >
      <RefreshCw data-icon="inline-start" />
      Reload page
    </Button>
  );
}
