import React from "react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, cleanup } from "@testing-library/react";
import { HelpProvider, useHelp } from "../HelpContext";

vi.mock("@/lib/i18n", () => ({
  t: (locale: string, key: string) => {
    const map: Record<string, Record<string, string>> = {
      en: {
        "help.title": "Help Centre",
        "help.search_placeholder": "Search for help...",
        "help.close": "Close",
      },
      es: {
        "help.title": "Centro de Ayuda",
        "help.search_placeholder": "Buscar ayuda...",
        "help.close": "Cerrar",
      },
    };
    return map[locale]?.[key] || key;
  },
}));

function Consumer() {
  const { openHelp, closeHelp } = useHelp();
  return (
    <div>
      <button data-testid="open-btn" onClick={openHelp}>
        Open Help
      </button>
      <button data-testid="close-btn" onClick={closeHelp}>
        Close Help
      </button>
      <input data-testid="test-input" placeholder="Type here..." />
      <textarea data-testid="test-textarea" placeholder="Text area..." />
      <select data-testid="test-select">
        <option value="1">Option 1</option>
      </select>
      <div
        data-testid="test-editable"
        contentEditable={true}
        suppressContentEditableWarning={true}
      >
        Editable text
      </div>
    </div>
  );
}

describe("HelpContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe("useHelp Hook Fallback", () => {
    it("provides safe no-op fallback functions when used outside HelpProvider", () => {
      render(<Consumer />);

      const openBtn = screen.getByTestId("open-btn");
      const closeBtn = screen.getByTestId("close-btn");

      expect(() => fireEvent.click(openBtn)).not.toThrow();
      expect(() => fireEvent.click(closeBtn)).not.toThrow();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Provider and Context Operations", () => {
    it("renders children and keeps help center closed initially", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      expect(screen.getByTestId("open-btn")).toBeInTheDocument();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("opens help center when openHelp is called and closes when closeHelp is called", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      // Initially closed
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Open
      act(() => {
        fireEvent.click(screen.getByTestId("open-btn"));
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Help Centre")).toBeInTheDocument();

      // Close
      act(() => {
        fireEvent.click(screen.getByTestId("close-btn"));
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("closes help center when Close button inside the modal is clicked", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("open-btn"));
      });
      expect(screen.getByRole("dialog")).toBeInTheDocument();

      const closeIcon = screen.getByLabelText("Close");
      act(() => {
        fireEvent.click(closeIcon);
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("propagates custom locale to the HelpCenter component", () => {
      render(
        <HelpProvider locale="es">
          <Consumer />
        </HelpProvider>
      );

      act(() => {
        fireEvent.click(screen.getByTestId("open-btn"));
      });

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Centro de Ayuda")).toBeInTheDocument();
    });
  });

  describe("Keyboard Shortcuts", () => {
    it("opens help center on Ctrl+K and prevents default", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const event = new KeyboardEvent("keydown", {
        key: "k",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("opens help center on Cmd+K (metaKey) and prevents default", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const event = new KeyboardEvent("keydown", {
        key: "K",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("opens help center on '?' key from global document", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const event = new KeyboardEvent("keydown", {
        key: "?",
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      act(() => {
        window.dispatchEvent(event);
      });

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("ignores '?' key when focused in an input element", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const input = screen.getByTestId("test-input");
      const event = new KeyboardEvent("keydown", {
        key: "?",
        bubbles: true,
        cancelable: true,
      });
      const preventDefaultSpy = vi.spyOn(event, "preventDefault");

      act(() => {
        input.dispatchEvent(event);
      });

      expect(preventDefaultSpy).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ignores '?' key when focused in a textarea element", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const textarea = screen.getByTestId("test-textarea");
      const event = new KeyboardEvent("keydown", {
        key: "?",
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        textarea.dispatchEvent(event);
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ignores '?' key when focused in a select element", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const select = screen.getByTestId("test-select");
      const event = new KeyboardEvent("keydown", {
        key: "?",
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        select.dispatchEvent(event);
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ignores '?' key when focused in a contenteditable element", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const editable = screen.getByTestId("test-editable");
      Object.defineProperty(editable, "isContentEditable", {
        value: true,
        configurable: true,
      });

      const event = new KeyboardEvent("keydown", {
        key: "?",
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        editable.dispatchEvent(event);
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("ignores '?' key if metaKey, ctrlKey, or altKey is pressed", () => {
      render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      const event = new KeyboardEvent("keydown", {
        key: "?",
        altKey: true,
        bubbles: true,
        cancelable: true,
      });

      act(() => {
        window.dispatchEvent(event);
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  describe("Event Listener Cleanup", () => {
    it("removes the keydown listener when unmounted", () => {
      const removeEventListenerSpy = vi.spyOn(window, "removeEventListener");

      const { unmount } = render(
        <HelpProvider>
          <Consumer />
        </HelpProvider>
      );

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
    });
  });
});
