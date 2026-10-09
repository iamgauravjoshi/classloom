"use client";
import { useCallback, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
export function useResultMutation(
  refresh: () => Promise<void>,
  onBusyChange?: (busy: boolean) => void,
) {
  const lock = useRef(false);
  const [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState("");
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (lock.current || paused) return false;
    lock.current = true;
    setBusy(true);
    onBusyChange?.(true);
    setError("");
    try {
      await work();
      toast.add({ type: "success", title: success });
      try {
        await refresh();
      } catch {
        setPaused(true);
        setError(
          "The change was saved, but updated results could not be loaded. Reload before making another change.",
        );
      }
      return true;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : "Could not save these results";
      setError(message);
      toast.add({ type: "error", title: message });
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
      onBusyChange?.(false);
    }
  };
  const reload = useCallback(async () => {
    try {
      await refresh();
      setPaused(false);
      setError("");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not reload these results",
      );
    }
  }, [refresh]);
  return { run, reload, busy, paused, error, disabled: busy || paused };
}
