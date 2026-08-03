import { describe, expect, it, vi } from "vitest";
import { reloadLocalPreview } from "./LocalPreviewRuntime";

describe("reloadLocalPreview", () => {
  it("uses the bridge when the cross-origin preview is connected", () => {
    const navigate = vi.fn();
    const remount = vi.fn();

    reloadLocalPreview(true, navigate, remount);

    expect(navigate).toHaveBeenCalledWith("reload");
    expect(remount).not.toHaveBeenCalled();
  });

  it("remounts the iframe when direct cross-origin navigation is unavailable", () => {
    const navigate = vi.fn();
    const remount = vi.fn();

    reloadLocalPreview(false, navigate, remount);

    expect(navigate).not.toHaveBeenCalled();
    expect(remount).toHaveBeenCalledOnce();
  });
});
