import { LoadingPanel } from "@/components/states";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col justify-center gap-6 p-6 sm:p-8">
      <LoadingPanel label="Loading your workspace" />
    </main>
  );
}
