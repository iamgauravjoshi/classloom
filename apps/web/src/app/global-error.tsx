"use client";

import { Inter } from "next/font/google";
import { Button } from "@/components/ui/button";
import { RecoveryPage } from "@/components/recovery-page";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <title>Workspace unavailable | ClassLoom</title>
        <RecoveryPage
          title="Your workspace could not load"
          description="Please try again to reconnect. Your previously saved records are kept safely on the server."
          action={<Button onClick={retry}>Try again</Button>}
        />
      </body>
    </html>
  );
}
