/**
 * Shared accessibility assertions for the unit test suite. (#347)
 *
 * A11y coverage in this repo was ad hoc: navbar-a11y.test.tsx hand-rolled its
 * own checks, contrast.test.ts and reduced-motion.test.ts covered only CSS, and
 * every other rendered component had no a11y assertions at all. This module is
 * the shared harness — deliberately dependency-free (no axe-core), so it runs
 * in the existing jsdom setup with no new packages and no CI slowdown.
 *
 * Each rule maps to a specific WCAG success criterion and only reports things
 * that are unambiguously wrong in a static DOM, so it is safe to assert
 * `toEqual([])` on real components without fighting false positives.
 */

export interface A11yViolation {
  /** Stable rule id, e.g. "image-alt". */
  rule: string;
  /** WCAG success criterion the rule enforces. */
  criterion: string;
  /** Human-readable description of what is wrong. */
  message: string;
  /** Outer HTML of the offending element, truncated for readable failures. */
  element: string;
}

const FOCUSABLE_SELECTOR =
  'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

const INTERACTIVE_SELECTOR = 'a[href], button, [role="button"], [role="link"]';

function describe(element: Element): string {
  const html = element.outerHTML ?? `<${element.tagName.toLowerCase()}>`;
  return html.length > 160 ? `${html.slice(0, 157)}...` : html;
}

/**
 * Approximates the accessible name of an element from the sources that matter
 * in this codebase: aria-label, aria-labelledby, visible text, alt text on a
 * nested image, and title. Enough to tell "has a name" from "has no name".
 */
export function accessibleName(element: Element): string {
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();
    if (text) return text;
  }

  const text = (element.textContent ?? "").trim();
  if (text) return text;

  const nestedAlt = element.querySelector("img[alt]")?.getAttribute("alt");
  if (nestedAlt && nestedAlt.trim()) return nestedAlt.trim();

  const title = element.getAttribute("title");
  if (title && title.trim()) return title.trim();

  return "";
}

/** WCAG 1.1.1 — every image needs alt text (`alt=""` is valid for decorative images). */
function checkImageAlt(root: ParentNode): A11yViolation[] {
  return Array.from(root.querySelectorAll("img"))
    .filter((img) => !img.hasAttribute("alt"))
    .map((img) => ({
      rule: "image-alt",
      criterion: "WCAG 1.1.1 Non-text Content",
      message: "<img> has no alt attribute (use alt=\"\" if decorative)",
      element: describe(img),
    }));
}

/** WCAG 4.1.2 — interactive controls must expose a name to assistive tech. */
function checkInteractiveNames(root: ParentNode): A11yViolation[] {
  return Array.from(root.querySelectorAll(INTERACTIVE_SELECTOR))
    .filter((el) => el.getAttribute("aria-hidden") !== "true")
    .filter((el) => !accessibleName(el))
    .map((el) => ({
      rule: "interactive-name",
      criterion: "WCAG 4.1.2 Name, Role, Value",
      message: "Interactive element has no accessible name (add text or aria-label)",
      element: describe(el),
    }));
}

/** WCAG 3.3.2 / 4.1.2 — form fields need a label, aria-label or aria-labelledby. */
function checkFormLabels(root: ParentNode): A11yViolation[] {
  const fields = Array.from(root.querySelectorAll("input, select, textarea")).filter(
    (el) => el.getAttribute("type") !== "hidden",
  );
  if (fields.length === 0) return [];

  // Collected by walking label[for] rather than building a selector per field:
  // CSS.escape is absent in the jsdom build this suite runs on, and an
  // unescaped id would break the selector on any non-trivial id.
  const labelledIds = new Set(
    Array.from(fields[0].ownerDocument.querySelectorAll("label[for]")).map((label) =>
      label.getAttribute("for"),
    ),
  );

  return fields
    .filter((field) => {
      if (field.getAttribute("aria-label")?.trim()) return false;
      if (field.getAttribute("aria-labelledby")?.trim()) return false;
      const id = field.getAttribute("id");
      if (id && labelledIds.has(id)) return false;
      if (field.closest("label")) return false;
      // A field that is hidden from AT *and* out of the tab order is never
      // reached by the users this rule protects — it is a proxy the visible
      // control drives, like the file input behind an "Upload" button. Both
      // attributes are required: aria-hidden alone would still leave it
      // tabbable, and tabindex="-1" alone would still leave it announced.
      if (isHiddenProxyField(field)) return false;
      return true;
    })
    .map((field) => ({
      rule: "form-label",
      criterion: "WCAG 3.3.2 Labels or Instructions",
      message: "Form field has no associated label",
      element: describe(field),
    }));
}

/** WCAG 2.4.3 — positive tabindex overrides DOM order and breaks keyboard flow. */
function checkNoPositiveTabIndex(root: ParentNode): A11yViolation[] {
  return Array.from(root.querySelectorAll("[tabindex]"))
    .filter((el) => Number(el.getAttribute("tabindex")) > 0)
    .map((el) => ({
      rule: "positive-tabindex",
      criterion: "WCAG 2.4.3 Focus Order",
      message: "Positive tabindex overrides natural focus order",
      element: describe(el),
    }));
}

/**
 * True for a form control that is both hidden from assistive tech and removed
 * from the tab order — the "hidden proxy" pattern, where a visible button is the
 * real control and this element only exists for the browser to drive (a file
 * input behind an Upload button, for example). Neither the label rule nor the
 * aria-hidden-focusable rule applies to it: no user can reach it directly.
 */
function isHiddenProxyField(el: Element): boolean {
  return el.getAttribute("aria-hidden") === "true" && el.getAttribute("tabindex") === "-1";
}

/** WCAG 4.1.2 — a focusable element hidden from AT is a keyboard trap for screen reader users. */
function checkAriaHiddenFocusable(root: ParentNode): A11yViolation[] {
  return Array.from(root.querySelectorAll('[aria-hidden="true"]'))
    // Exempt only a leaf hidden proxy. A hidden *container* that wraps focusable
    // content is still a trap, so it keeps being reported.
    .filter((el) => !(isHiddenProxyField(el) && !el.querySelector(FOCUSABLE_SELECTOR)))
    .filter((el) => el.matches(FOCUSABLE_SELECTOR) || el.querySelector(FOCUSABLE_SELECTOR))
    .map((el) => ({
      rule: "aria-hidden-focusable",
      criterion: "WCAG 4.1.2 Name, Role, Value",
      message: "aria-hidden element contains focusable content",
      element: describe(el),
    }));
}

/** WCAG 4.1.1 — duplicate ids break aria-labelledby/aria-describedby and label[for]. */
function checkDuplicateIds(root: ParentNode): A11yViolation[] {
  const seen = new Set<string>();
  const violations: A11yViolation[] = [];

  for (const el of Array.from(root.querySelectorAll("[id]"))) {
    const id = el.getAttribute("id")!;
    if (seen.has(id)) {
      violations.push({
        rule: "duplicate-id",
        criterion: "WCAG 4.1.1 Parsing",
        message: `Duplicate id "${id}"`,
        element: describe(el),
      });
    }
    seen.add(id);
  }

  return violations;
}

/** WCAG 1.3.1 — heading levels must not skip (h2 → h4), which breaks document outline navigation. */
function checkHeadingOrder(root: ParentNode): A11yViolation[] {
  const violations: A11yViolation[] = [];
  let previous = 0;

  for (const heading of Array.from(root.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
    const level = Number(heading.tagName[1]);
    if (previous !== 0 && level > previous + 1) {
      violations.push({
        rule: "heading-order",
        criterion: "WCAG 1.3.1 Info and Relationships",
        message: `Heading level jumps from h${previous} to h${level}`,
        element: describe(heading),
      });
    }
    previous = level;
  }

  return violations;
}

/**
 * Security-adjacent a11y rule: `target="_blank"` without `rel="noopener"` hands
 * the opened page a `window.opener` handle back into this origin's tab. Kept
 * here because it is checked on the same rendered DOM. (#348)
 */
function checkBlankTargetRel(root: ParentNode): A11yViolation[] {
  return Array.from(root.querySelectorAll('a[target="_blank"]'))
    .filter((a) => {
      const rel = (a.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      return !rel.includes("noopener") && !rel.includes("noreferrer");
    })
    .map((a) => ({
      rule: "blank-target-rel",
      criterion: "WCAG 3.2.5 / reverse-tabnabbing",
      message: 'target="_blank" without rel="noopener" (or "noreferrer")',
      element: describe(a),
    }));
}

const RULES = [
  checkImageAlt,
  checkInteractiveNames,
  checkFormLabels,
  checkNoPositiveTabIndex,
  checkAriaHiddenFocusable,
  checkDuplicateIds,
  checkHeadingOrder,
  checkBlankTargetRel,
];

/** Runs every rule over a rendered subtree and returns all violations found. */
export function auditAccessibility(root: ParentNode): A11yViolation[] {
  return RULES.flatMap((rule) => rule(root));
}

/** Compact `rule: message` strings — what tests assert on, so failures stay readable. */
export function summarizeViolations(violations: A11yViolation[]): string[] {
  return violations.map((v) => `${v.rule}: ${v.message} — ${v.element}`);
}
