import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";

/**
 * HelpProvider owns the help centre's open state and its global shortcuts
 * (#755). HelpCenter itself is replaced with a stub that only reflects the
 * props it receives, so these tests cover the context, not the panel.
 */
vi.mock("@/components/HelpCenter", () => ({
  HelpCenter: ({ isOpen, onClose, locale }: { isOpen: boolean; onClose: () => void; locale: string }) =>
    isOpen ? (
      <div role="dialog" aria-label="Help centre" data-locale={locale}>
        <button onClick={onClose}>close stub</button>
      </div>
    ) : null,
}));

import { HelpProvider, useHelp } from "@/contexts/HelpContext";

function Controls() {
  const { openHelp, closeHelp } = useHelp();
  return (
    <>
      <button onClick={openHelp}>open</button>
      <button onClick={closeHelp}>close</button>
      <input aria-label="name" />
      <textarea aria-label="notes" />
      <select aria-label="pick">
        <option>a</option>
      </select>
      <div aria-label="editable" contentEditable suppressContentEditableWarning />
    </>
  );
}

function renderProvider(locale?: string) {
  return render(
    <HelpProvider locale={locale}>
      <Controls />
    </HelpProvider>,
  );
}

const dialog = () => screen.queryByRole("dialog", { name: "Help centre" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HelpProvider", () => {
  it("starts closed", () => {
    renderProvider();
    expect(dialog()).toBeNull();
  });

  it("openHelp opens the help centre and closeHelp closes it", () => {
    renderProvider();
    fireEvent.click(screen.getByText("open"));
    expect(dialog()).not.toBeNull();

    fireEvent.click(screen.getByText("close"));
    expect(dialog()).toBeNull();
  });

  it("closes when the help centre calls its onClose", () => {
    renderProvider();
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("close stub"));
    expect(dialog()).toBeNull();
  });

  it("calling openHelp while already open keeps it open", () => {
    renderProvider();
    fireEvent.click(screen.getByText("open"));
    fireEvent.click(screen.getByText("open"));
    expect(dialog()).not.toBeNull();
  });

  it.each([
    ["Cmd+K", { key: "k", metaKey: true }],
    ["Ctrl+K", { key: "k", ctrlKey: true }],
    ["Ctrl+Shift+K (upper-case key)", { key: "K", ctrlKey: true, shiftKey: true }],
  ])("%s opens the help centre and prevents the browser default", (_label, init) => {
    renderProvider();
    const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(event);
    });
    expect(dialog()).not.toBeNull();
    expect(event.defaultPrevented).toBe(true);
  });

  it("plain K without a modifier does nothing", () => {
    renderProvider();
    fireEvent.keyDown(window, { key: "k" });
    expect(dialog()).toBeNull();
  });

  it("'?' opens the help centre from outside a text field", () => {
    renderProvider();
    fireEvent.keyDown(document.body, { key: "?" });
    expect(dialog()).not.toBeNull();
  });

  it.each(["name", "notes", "pick"])("'?' typed into the %s field is left alone", (label) => {
    renderProvider();
    fireEvent.keyDown(screen.getByLabelText(label), { key: "?" });
    expect(dialog()).toBeNull();
  });

  it("'?' typed into a contenteditable element is left alone", () => {
    renderProvider();
    const editable = screen.getByLabelText("editable");
    // jsdom does not implement isContentEditable; mirror what browsers report.
    Object.defineProperty(editable, "isContentEditable", { value: true });
    fireEvent.keyDown(editable, { key: "?" });
    expect(dialog()).toBeNull();
  });

  it.each([
    ["Ctrl", { ctrlKey: true }],
    ["Cmd", { metaKey: true }],
    ["Alt", { altKey: true }],
  ])("%s+? does not open the help centre", (_label, modifiers) => {
    renderProvider();
    fireEvent.keyDown(document.body, { key: "?", ...modifiers });
    expect(dialog()).toBeNull();
  });

  it("passes the locale through to the help centre", () => {
    renderProvider("fr");
    fireEvent.click(screen.getByText("open"));
    expect(dialog()?.getAttribute("data-locale")).toBe("fr");
  });

  it("defaults the help centre locale to English", () => {
    renderProvider();
    fireEvent.click(screen.getByText("open"));
    expect(dialog()?.getAttribute("data-locale")).toBe("en");
  });

  it("removes its keydown listener on unmount", () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderProvider();
    unmount();
    expect(remove).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});

describe("useHelp outside HelpProvider", () => {
  it("returns no-op functions instead of throwing", () => {
    render(<Controls />);
    expect(() => {
      fireEvent.click(screen.getByText("open"));
      fireEvent.click(screen.getByText("close"));
    }).not.toThrow();
    expect(dialog()).toBeNull();
  });
});
