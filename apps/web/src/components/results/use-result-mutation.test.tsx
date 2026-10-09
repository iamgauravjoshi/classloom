// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useResultMutation } from "./use-result-mutation";
vi.mock("@/components/ui/toast", () => ({ toast: { add: vi.fn() } }));
afterEach(cleanup);
describe("Results save recovery", () => {
  it("pauses repeated writes after a successful save whose refresh fails, and resumes only after reload succeeds", async () => {
    const refresh = vi
        .fn()
        .mockRejectedValueOnce(new Error("offline"))
        .mockResolvedValue(undefined),
      save = vi.fn().mockResolvedValue({ saved: true });
    const { result } = renderHook(() => useResultMutation(refresh));
    await act(async () => {
      await result.current.run(save, "Saved");
    });
    expect(result.current.paused).toBe(true);
    expect(result.current.error).toContain("change was saved");
    await act(async () => {
      await result.current.run(save, "Saved");
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.disabled).toBe(false);
  });
  it("blocks competing submissions synchronously and preserves useful validation errors", async () => {
    let release!: () => void;
    const save = vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      ),
      refresh = vi.fn().mockResolvedValue(undefined);
    const onBusyChange = vi.fn();
    const { result } = renderHook(() =>
      useResultMutation(refresh, onBusyChange),
    );
    let first!: Promise<boolean>;
    await act(async () => {
      first = result.current.run(save, "Saved");
      await result.current.run(save, "Saved");
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => {
      release();
      await first;
    });
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    await act(async () => {
      await result.current.run(async () => {
        throw new Error("The lowest grade band must start at 0 percent");
      }, "Saved");
    });
    expect(result.current.error).toContain("0 percent");
    expect(result.current.paused).toBe(false);
  });
});
