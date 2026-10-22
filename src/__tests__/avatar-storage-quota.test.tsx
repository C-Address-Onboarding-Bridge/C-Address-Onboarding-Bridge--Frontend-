// @vitest-environment jsdom
import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import AvatarUpload from "@/components/avatar-upload";
import {
  AVATAR_MAX_DIMENSION,
  AVATAR_MAX_STORED_LENGTH,
  AVATAR_SAVE_ERRORS,
  avatarStorageKey,
  downscaleAvatar,
  isQuotaExceededError,
  loadAvatar,
  saveAvatarResult,
  type AvatarCanvas,
  type LoadedImage,
} from "@/lib/avatar";

/**
 * #761: avatars were stored full size as data URLs, so a few accounts could
 * use up the origin's localStorage quota and make every other save fail
 * silently. Images are now downscaled before saving, and a full store is
 * reported with a clear message.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST";
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
/** A large, valid data URL standing in for a full-size photo. */
const BIG_JPEG = `data:image/jpeg;base64,${"A".repeat(400_000)}`;
const SMALL_WEBP = "data:image/webp;base64,UklGRhIAAABXRUJQVlA4";

function quotaError(): DOMException {
  return new DOMException("The quota has been exceeded.", "QuotaExceededError");
}

/** A canvas stub that records its size and returns `output` when encoded. */
function stubCanvas(output: string) {
  const drawImage = vi.fn();
  const canvas: AvatarCanvas & { drawImage: typeof drawImage } = {
    width: 0,
    height: 0,
    drawImage,
    getContext: () => ({ drawImage }),
    toDataURL: vi.fn(() => output),
  };
  return canvas;
}

const image = (width: number, height: number): LoadedImage => ({
  width,
  height,
  source: {} as CanvasImageSource,
});

beforeEach(() => window.localStorage.clear());
afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("downscaleAvatar (#761)", () => {
  it("shrinks the longest side to the maximum, keeping the aspect ratio", async () => {
    const canvas = stubCanvas(SMALL_WEBP);
    const result = await downscaleAvatar(BIG_JPEG, {
      createCanvas: () => canvas,
      loadImage: async () => image(1200, 800),
    });

    expect(result).toBe(SMALL_WEBP);
    expect([canvas.width, canvas.height]).toEqual([AVATAR_MAX_DIMENSION, Math.round((800 * AVATAR_MAX_DIMENSION) / 1200)]);
    expect(canvas.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, canvas.width, canvas.height);
    expect(canvas.toDataURL).toHaveBeenCalledWith("image/webp", 0.85);
  });

  it("never upscales a small image", async () => {
    const canvas = stubCanvas(SMALL_WEBP);
    await downscaleAvatar(BIG_JPEG, { createCanvas: () => canvas, loadImage: async () => image(40, 20) });
    expect([canvas.width, canvas.height]).toEqual([40, 20]);
  });

  it("keeps the original when re-encoding would not make it smaller", async () => {
    const result = await downscaleAvatar(PNG, {
      createCanvas: () => stubCanvas(BIG_JPEG),
      loadImage: async () => image(1, 1),
    });
    expect(result).toBe(PNG);
  });

  it("keeps the original when there is no canvas or the image won't decode", async () => {
    await expect(downscaleAvatar(PNG, { createCanvas: () => null })).resolves.toBe(PNG);
    await expect(
      downscaleAvatar(PNG, {
        createCanvas: () => stubCanvas(SMALL_WEBP),
        loadImage: async () => {
          throw new Error("decode failed");
        },
      })
    ).resolves.toBe(PNG);
  });

  it("never returns a value that is not a safe data URL", async () => {
    const result = await downscaleAvatar(BIG_JPEG, {
      createCanvas: () => stubCanvas("data:,"),
      loadImage: async () => image(800, 800),
    });
    expect(result).toBe(BIG_JPEG);
  });
});

describe("saveAvatarResult (#761)", () => {
  it("saves a valid image", () => {
    expect(saveAvatarResult(ADDRESS, PNG)).toEqual({ ok: true });
    expect(loadAvatar(ADDRESS)).toBe(PNG);
  });

  it("reports a full store as quota, not a silent failure", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaError();
    });
    expect(saveAvatarResult(ADDRESS, PNG)).toEqual({ ok: false, reason: "quota" });
  });

  it("reports other storage failures as unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(saveAvatarResult(ADDRESS, PNG)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("refuses values longer than any picked image could be", () => {
    const tooLong = `data:image/png;base64,${"A".repeat(AVATAR_MAX_STORED_LENGTH)}`;
    expect(saveAvatarResult(ADDRESS, tooLong)).toEqual({ ok: false, reason: "too_large" });
    expect(window.localStorage.getItem(avatarStorageKey(ADDRESS))).toBeNull();
  });

  it("refuses unsafe values and a missing address", () => {
    expect(saveAvatarResult(ADDRESS, "javascript:alert(1)")).toEqual({ ok: false, reason: "invalid" });
    expect(saveAvatarResult(null, PNG)).toEqual({ ok: false, reason: "invalid" });
  });

  it("recognises quota errors across browsers", () => {
    expect(isQuotaExceededError(quotaError())).toBe(true);
    expect(isQuotaExceededError({ name: "NS_ERROR_DOM_QUOTA_REACHED" })).toBe(true);
    expect(isQuotaExceededError({ code: 22 })).toBe(true);
    expect(isQuotaExceededError(new Error("other"))).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
  });
});

describe("AvatarUpload when storage is full (#761)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the storage-full message and keeps no avatar", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw quotaError();
    });
    await act(async () => {
      root.render(<AvatarUpload address={ADDRESS} />);
    });

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const bytes = Uint8Array.from(atob(PNG.split(",")[1]), (c) => c.charCodeAt(0));
    Object.defineProperty(input, "files", {
      value: [new File([bytes], "avatar.png", { type: "image/png" })],
      configurable: true,
    });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    // FileReader and downscaling resolve on later tasks; poll, bounded.
    for (let i = 0; i < 50 && !container.textContent?.includes("Browser storage is full"); i++) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }

    expect(container.textContent).toContain(AVATAR_SAVE_ERRORS.quota);
    expect(container.querySelector("img")).toBeNull();
  });
});
