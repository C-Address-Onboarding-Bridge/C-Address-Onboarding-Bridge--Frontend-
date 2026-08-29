// @vitest-environment jsdom
import React, { act } from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createRoot, Root } from "react-dom/client";
import ProfilePage from "@/components/routes/profile-page";
import { avatarStorageKey } from "@/lib/avatar";
import { displayNameStorageKey } from "@/lib/profile";
import { auditAccessibility, summarizeViolations } from "./helpers/a11y";

/**
 * Unit tests for the Profile Page. (#325)
 *
 * Covers the three things the page is responsible for: gating on the wallet
 * connection, editing the display name (including the failure paths), and
 * presenting the wallet identity accessibly. The pure storage/validation rules
 * live in `src/lib/__tests__/profile.test.ts`.
 */

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ADDRESS = "GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST";

// The wallet context is the page's only external input; a mutable object lets
// each test set the connection state before rendering.
const wallet = {
  isConnected: true,
  address: ADDRESS as string | null,
  networkStatus: "TESTNET" as string,
  walletNetworkName: "TESTNET" as string | null,
  isNetworkSupported: true,
  isConnecting: false,
  connect: vi.fn(),
};

vi.mock("@/components/wallet-provider", () => ({
  useWallet: () => wallet,
}));

vi.mock("next/link", () => ({
  default: ({ children, ...rest }: { children: React.ReactNode } & Record<string, unknown>) => (
    <a {...rest}>{children}</a>
  ),
}));

// Real Horizon labels are not the subject here; the page only has to render
// whatever the helper returns.
vi.mock("@/lib/stellar", () => ({
  formatNetworkLabel: (status: string) => (status === "TESTNET" ? "Testnet" : status),
}));

describe("ProfilePage (#325)", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    window.localStorage.clear();
    wallet.isConnected = true;
    wallet.address = ADDRESS;
    wallet.isNetworkSupported = true;
    wallet.networkStatus = "TESTNET";
    wallet.walletNetworkName = "TESTNET";
    wallet.isConnecting = false;
    wallet.connect = vi.fn();

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

  const render = async () => {
    await act(async () => {
      root?.render(<ProfilePage />);
    });
  };

  const nameInput = () => container?.querySelector<HTMLInputElement>("#display-name");
  const button = (label: string) =>
    Array.from(container?.querySelectorAll("button") ?? []).find((b) =>
      (b.textContent ?? "").includes(label),
    );

  const type = async (value: string) => {
    const input = nameInput()!;
    await act(async () => {
      // React tracks the last value it set on the node, so assigning through the
      // prototype setter is what makes it see a real change.
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  const submit = async () => {
    await act(async () => {
      button("Save")?.click();
    });
  };

  describe("wallet gating", () => {
    it("prompts for a connection instead of rendering the form", async () => {
      wallet.isConnected = false;
      wallet.address = null;

      await render();

      expect(container?.textContent).toContain("Connect Your Wallet");
      expect(nameInput()).toBeNull();
    });

    it("connects when the prompt's button is clicked", async () => {
      wallet.isConnected = false;
      wallet.address = null;
      await render();

      await act(async () => {
        button("Connect Freighter")?.click();
      });

      expect(wallet.connect).toHaveBeenCalledTimes(1);
    });

    it("disables the connect button while a connection is in flight", async () => {
      wallet.isConnected = false;
      wallet.address = null;
      wallet.isConnecting = true;

      await render();

      expect(button("Connecting...")?.disabled).toBe(true);
    });

    it("renders the profile form once connected", async () => {
      await render();

      expect(container?.textContent).toContain("Profile");
      expect(nameInput()).not.toBeNull();
      expect(container?.textContent).not.toContain("Connect Your Wallet");
    });
  });

  describe("display name", () => {
    it("starts empty when nothing is stored", async () => {
      await render();

      expect(nameInput()?.value).toBe("");
      expect(button("Remove")).toBeUndefined();
    });

    it("loads the name stored for the connected address", async () => {
      window.localStorage.setItem(displayNameStorageKey(ADDRESS), "Ada Lovelace");

      await render();

      expect(nameInput()?.value).toBe("Ada Lovelace");
      expect(button("Remove")).toBeTruthy();
    });

    it("ignores a name stored under a different address", async () => {
      window.localStorage.setItem(displayNameStorageKey("GSOMEONEELSE00000000000"), "Grace");

      await render();

      expect(nameInput()?.value).toBe("");
    });

    it("saves a typed name", async () => {
      await render();

      await type("Ada Lovelace");
      await submit();

      expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS))).toBe("Ada Lovelace");
      expect(container?.textContent).toContain("Display name saved.");
    });

    it("normalises the field to the stored value after saving", async () => {
      await render();

      await type("  Ada Lovelace  ");
      await submit();

      expect(nameInput()?.value).toBe("Ada Lovelace");
    });

    it("rejects an empty name and stores nothing", async () => {
      await render();

      await type("   ");
      await submit();

      expect(container?.textContent).toContain("Enter a display name");
      expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS))).toBeNull();
    });

    it("rejects an over-long name and stores nothing", async () => {
      await render();

      await type("x".repeat(40));
      await submit();

      expect(container?.textContent).toContain("the limit is 32");
      expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS))).toBeNull();
    });

    it("marks the field invalid and announces the error to assistive tech", async () => {
      await render();

      await type("  ");
      await submit();

      expect(nameInput()?.getAttribute("aria-invalid")).toBe("true");
      expect(container?.querySelector('[role="alert"]')?.textContent).toContain(
        "Enter a display name",
      );
    });

    it("clears the error as soon as the field is edited again", async () => {
      await render();
      await type("  ");
      await submit();

      await type("Ada");

      expect(nameInput()?.getAttribute("aria-invalid")).toBeNull();
      expect(container?.querySelector('[role="alert"]')).toBeNull();
    });

    it("surfaces a storage failure instead of reporting success", async () => {
      await render();
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new Error("QuotaExceededError");
      });

      await type("Ada Lovelace");
      await submit();

      expect(container?.textContent).toContain("browser storage may be full");
      expect(container?.textContent).not.toContain("Display name saved.");
    });

    it("removes a stored name", async () => {
      window.localStorage.setItem(displayNameStorageKey(ADDRESS), "Ada Lovelace");
      await render();

      await act(async () => {
        button("Remove")?.click();
      });

      expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS))).toBeNull();
      expect(nameInput()?.value).toBe("");
      expect(container?.textContent).toContain("Display name removed.");
    });

    it("does not submit the surrounding form via the Remove button", async () => {
      window.localStorage.setItem(displayNameStorageKey(ADDRESS), "Ada Lovelace");
      await render();

      // A bare <button> inside a <form> defaults to type="submit", which would
      // re-save the name it is meant to delete.
      expect(button("Remove")?.getAttribute("type")).toBe("button");
    });
  });

  describe("wallet details", () => {
    it("shows the full address and the network label", async () => {
      await render();

      expect(container?.textContent).toContain(ADDRESS);
      expect(container?.textContent).toContain("Testnet");
    });

    it("flags an unsupported network", async () => {
      wallet.isNetworkSupported = false;
      wallet.networkStatus = "UNSUPPORTED";

      await render();

      expect(container?.textContent).toContain("switch to Testnet or Mainnet");
    });

    it("copies the address and announces the result", async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
      await render();

      await act(async () => {
        container?.querySelector<HTMLButtonElement>('[aria-label="Copy wallet address"]')?.click();
      });

      expect(writeText).toHaveBeenCalledWith(ADDRESS);
      expect(container?.textContent).toContain("copied to clipboard");
    });

    it("reports a copy failure rather than showing success", async () => {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
        configurable: true,
      });
      await render();

      await act(async () => {
        container?.querySelector<HTMLButtonElement>('[aria-label="Copy wallet address"]')?.click();
      });

      expect(container?.textContent).toContain("Copy failed");
    });
  });

  describe("avatar", () => {
    it("renders the avatar control for the connected address", async () => {
      await render();

      expect(button("Upload avatar")).toBeTruthy();
    });

    it("renders an avatar already stored for the address", async () => {
      const png =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
      window.localStorage.setItem(avatarStorageKey(ADDRESS), png);

      await render();

      expect(container?.querySelector("img")?.getAttribute("src")).toBe(png);
    });
  });

  describe("accessibility", () => {
    const audit = () => summarizeViolations(auditAccessibility(container!));

    it("passes the shared a11y audit when connected", async () => {
      window.localStorage.setItem(displayNameStorageKey(ADDRESS), "Ada Lovelace");

      await render();

      expect(audit()).toEqual([]);
    });

    it("passes the shared a11y audit on the connect prompt", async () => {
      wallet.isConnected = false;
      wallet.address = null;

      await render();

      expect(audit()).toEqual([]);
    });

    it("labels the display name input", async () => {
      await render();

      const label = container?.querySelector('label[for="display-name"]');
      expect(label?.textContent).toContain("Display name");
      expect(nameInput()?.getAttribute("aria-describedby")).toBe("display-name-hint");
    });

    it("gives each section a heading it is labelled by", async () => {
      await render();

      for (const section of Array.from(container?.querySelectorAll("section") ?? [])) {
        const id = section.getAttribute("aria-labelledby");
        expect(id, `section is missing aria-labelledby: ${section.className}`).toBeTruthy();
        expect(container?.querySelector(`#${id}`)).not.toBeNull();
      }
    });
  });
});
