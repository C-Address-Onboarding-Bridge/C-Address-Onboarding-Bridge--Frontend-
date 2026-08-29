// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import AvatarUpload from "@/components/avatar-upload";
import { avatarStorageKey } from "@/lib/avatar";

/**
 * `<AvatarUpload>` component tests.
 *
 * These exercise the address-keyed component in `src/components/avatar-upload.tsx`
 * (props: `address`, `size`). An earlier revision of this file targeted a
 * second, short-lived `AvatarUpload` export with `currentAvatar`/`onAvatarChange`
 * props that a merge had left in the same module; that duplicate is gone, so the
 * cases are re-pointed at the surviving component. Pure validation and storage
 * rules are covered separately in `avatar.test.ts`.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST";
// Smallest valid 1x1 transparent PNG, as the data URL shape `avatar.ts` accepts.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

describe("AvatarUpload", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  const render = async (address: string | null) => {
    await act(async () => {
      root?.render(<AvatarUpload address={address} />);
    });
  };

  const fileInput = () => container?.querySelector<HTMLInputElement>('input[type="file"]');
  const button = (label: string) =>
    Array.from(container?.querySelectorAll("button") ?? []).find((b) =>
      (b.textContent ?? "").includes(label),
    );

  /**
   * Fires `change` with `file` on the hidden input. jsdom's `files` is
   * read-only, so it is redefined for the assignment.
   */
  const selectFile = async (file: File) => {
    const input = fileInput()!;
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  };

  const pngFile = (bytes: number) =>
    new File([new Uint8Array(bytes)], "avatar.png", { type: "image/png" });

  it("falls back to the address initials when no avatar is stored", async () => {
    await render(ADDRESS);

    expect(container?.textContent).toContain("GA");
    expect(container?.querySelector("img")).toBeNull();
  });

  it("offers an upload control and the accepted-format hint", async () => {
    await render(ADDRESS);

    expect(button("Upload avatar")).toBeTruthy();
    expect(button("Remove")).toBeUndefined();
    expect(container?.textContent).toContain("512 KB");
    expect(fileInput()?.getAttribute("accept")).toContain("image/png");
  });

  it("disables upload while no address is connected", async () => {
    await render(null);

    expect(button("Upload avatar")?.disabled).toBe(true);
  });

  it("renders the stored avatar for the address on mount", async () => {
    window.localStorage.setItem(avatarStorageKey(ADDRESS), PNG_DATA_URL);

    await render(ADDRESS);

    expect(container?.querySelector("img")?.getAttribute("src")).toBe(PNG_DATA_URL);
    expect(button("Change avatar")).toBeTruthy();
  });

  it("opens the file picker when the upload button is clicked", async () => {
    await render(ADDRESS);
    const click = vi.spyOn(fileInput()!, "click");

    await act(async () => {
      button("Upload avatar")?.click();
    });

    expect(click).toHaveBeenCalledTimes(1);
  });

  it("stores and renders a selected image", async () => {
    await render(ADDRESS);

    await selectFile(pngFile(64));
    // FileReader resolves on a later task than the dispatched change event.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const src = container?.querySelector("img")?.getAttribute("src");
    expect(src).toMatch(/^data:image\/png;base64,/);
    expect(window.localStorage.getItem(avatarStorageKey(ADDRESS))).toBe(src);
  });

  it("rejects an unsupported file type without storing it", async () => {
    await render(ADDRESS);

    await selectFile(new File(["x"], "avatar.bmp", { type: "image/bmp" }));

    expect(container?.textContent).toContain("Unsupported file type");
    expect(window.localStorage.getItem(avatarStorageKey(ADDRESS))).toBeNull();
  });

  it("rejects a file over the size limit without storing it", async () => {
    await render(ADDRESS);

    await selectFile(pngFile(512 * 1024 + 1));

    expect(container?.textContent).toContain("the limit is 512 KB");
    expect(window.localStorage.getItem(avatarStorageKey(ADDRESS))).toBeNull();
  });

  it("clears the stored avatar when Remove is clicked", async () => {
    window.localStorage.setItem(avatarStorageKey(ADDRESS), PNG_DATA_URL);
    await render(ADDRESS);

    await act(async () => {
      button("Remove")?.click();
    });

    expect(container?.querySelector("img")).toBeNull();
    expect(window.localStorage.getItem(avatarStorageKey(ADDRESS))).toBeNull();
    expect(button("Upload avatar")).toBeTruthy();
  });
});
