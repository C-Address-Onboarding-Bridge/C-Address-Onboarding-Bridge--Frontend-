// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  ACCEPTED_AVATAR_TYPES,
  AVATAR_ACCEPT_ATTR,
  AVATAR_MAX_BYTES,
  avatarInitials,
  avatarStorageKey,
  formatBytes,
  isRenderableAvatar,
  loadAvatar,
  removeAvatar,
  saveAvatar,
  validateAvatarFile,
} from "@/lib/avatar";

const PNG = "data:image/png;base64,iVBORw0KGgo=";
const ADDRESS_A = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";
const ADDRESS_B = "CABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW";

describe("validateAvatarFile (#342)", () => {
  it("accepts every advertised image type", () => {
    for (const type of ACCEPTED_AVATAR_TYPES) {
      expect(validateAvatarFile({ type, size: 1024 })).toEqual({ ok: true });
    }
  });

  it("rejects non-image and non-listed types", () => {
    for (const type of ["application/pdf", "image/svg+xml", "text/html", ""]) {
      const result = validateAvatarFile({ type, size: 1024 });
      expect(result.ok).toBe(false);
    }
  });

  it("rejects empty files", () => {
    expect(validateAvatarFile({ type: "image/png", size: 0 }).ok).toBe(false);
  });

  it("rejects files over the size limit but accepts one exactly at it", () => {
    expect(validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES }).ok).toBe(true);
    const tooBig = validateAvatarFile({ type: "image/png", size: AVATAR_MAX_BYTES + 1 });
    expect(tooBig.ok).toBe(false);
    if (!tooBig.ok) expect(tooBig.error).toContain("512 KB");
  });

  it("exposes the accepted types as an accept attribute", () => {
    expect(AVATAR_ACCEPT_ATTR).toBe("image/png,image/jpeg,image/webp,image/gif");
  });
});

describe("isRenderableAvatar", () => {
  it("accepts base64 image data URLs", () => {
    expect(isRenderableAvatar(PNG)).toBe(true);
    expect(isRenderableAvatar("data:image/webp;base64,UklGRg==")).toBe(true);
  });

  it("rejects anything that is not a base64 image data URL", () => {
    // The value is rendered into <img src>, so scripts, remote URLs and
    // non-image data URLs must never pass.
    for (const value of [
      "javascript:alert(1)",
      "https://example.com/a.png",
      "data:text/html;base64,PHNjcmlwdD4=",
      "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
      "data:image/png;base64,",
      null,
      undefined,
      42,
    ]) {
      expect(isRenderableAvatar(value)).toBe(false);
    }
  });
});

describe("avatar storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips an avatar for an address", () => {
    expect(saveAvatar(ADDRESS_A, PNG)).toBe(true);
    expect(loadAvatar(ADDRESS_A)).toBe(PNG);
    expect(localStorage.getItem(avatarStorageKey(ADDRESS_A))).toBe(PNG);
  });

  it("keeps avatars separate per address", () => {
    saveAvatar(ADDRESS_A, PNG);
    expect(loadAvatar(ADDRESS_B)).toBeNull();
  });

  it("refuses to persist a value that is not a safe data URL", () => {
    expect(saveAvatar(ADDRESS_A, "javascript:alert(1)")).toBe(false);
    expect(localStorage.getItem(avatarStorageKey(ADDRESS_A))).toBeNull();
  });

  it("ignores a tampered stored value instead of rendering it", () => {
    localStorage.setItem(avatarStorageKey(ADDRESS_A), "javascript:alert(1)");
    expect(loadAvatar(ADDRESS_A)).toBeNull();
  });

  it("removes an avatar", () => {
    saveAvatar(ADDRESS_A, PNG);
    removeAvatar(ADDRESS_A);
    expect(loadAvatar(ADDRESS_A)).toBeNull();
  });

  it("no-ops without an address", () => {
    expect(saveAvatar(null, PNG)).toBe(false);
    expect(loadAvatar(null)).toBeNull();
    expect(() => removeAvatar(undefined)).not.toThrow();
  });
});

describe("presentation helpers", () => {
  it("derives two-character initials from an address", () => {
    expect(avatarInitials(ADDRESS_A)).toBe("GA");
    expect(avatarInitials(ADDRESS_B)).toBe("CA");
    expect(avatarInitials(null)).toBe("?");
  });

  it("formats byte counts", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(512 * 1024)).toBe("512 KB");
    expect(formatBytes(1536 * 1024)).toBe("1.5 MB");
  });
});
