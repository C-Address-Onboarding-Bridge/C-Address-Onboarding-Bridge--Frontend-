import { useEffect, useRef, useState } from "react";

/** Human-readable name for each bridge step, used in screen-reader announcements. */
const STEP_LABELS: Record<string, string> = {
  form: "Enter bridge details",
  review: "Review transaction",
  confirm: "Transaction result",
};

/**
 * Drives accessible step transitions for the bridge flow.
 *
 * On every step change (but never on the initial mount, so we don't yank focus
 * or announce on first paint) it:
 *  - moves keyboard focus to the new step's heading, and
 *  - returns a polite announcement string for the live region.
 *
 * The returned `headingRef` must be attached to whichever step heading is
 * currently rendered; because only one step mounts at a time, a single ref is
 * enough to follow the active heading across transitions. (#476)
 */
export function useStepTransition(step: string) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const isInitial = useRef(true);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    setAnnouncement(`Step changed to ${STEP_LABELS[step] ?? step}.`);
    headingRef.current?.focus();
  }, [step]);

  return { headingRef, announcement };
}
