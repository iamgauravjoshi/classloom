import type { Metadata } from "next";
import "./globals.css";
import { Inter } from "next/font/google";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/toast";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: {
    default: "ClassLoom | School workspace",
    template: "%s | ClassLoom",
  },
  description:
    "Manage your school's people, academics, and daily operations with ClassLoom.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={cn("font-sans", inter.variable)}
      suppressHydrationWarning
    >
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{if(localStorage.getItem('classloom-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}",
          }}
        />
        <Toaster>
          <TooltipProvider>{children}</TooltipProvider>
        </Toaster>
      </body>
    </html>
  );
}
