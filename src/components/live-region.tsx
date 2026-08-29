import React, { memo } from "react";

/**
 * LiveRegion — a visually hidden ARIA live region for screen-reader-only
 * status notifications.
 *
 * The app's notifications (copy feedback, fetch errors, redirect confirmations,
 * transaction status) are conveyed visually by swapping icons, colors and inline
 * text. None of that reaches a screen reader on its own: the DOM change happens
 * away from the user's cursor, so the update is silent. A live region is the
 * mechanism that makes those changes audible.
 *
 * Usage rules that this component exists to enforce:
 *
 *  1. **Keep it mounted.** Mount the region unconditionally and pass an empty
 *     string when there is nothing to announce. Some assistive technologies
 *     never register a live region that is inserted into the DOM at the same
 *     moment it receives its text, so `{condition && <LiveRegion .../>}` is
 *     unreliable — the first announcement is the one most likely to be lost.
 *
 *  2. **Don't flip `politeness` on an existing region.** Several AT cache the
 *     politeness value from when the region was first registered. When a screen
 *     can produce both kinds of message, mount two regions and leave the
 *     inactive one empty, so only one ever holds text.
 *
 * `aria-atomic="true"` makes AT re-read the whole region rather than diffing it,
 * which keeps partial-word announcements from leaking through on text changes.
 *
 * @example
 *   // One polite region, empty while idle.
 *   <LiveRegion message={copied ? "Address copied to clipboard." : ""} />
 *
 * @example
 *   // Both kinds of message: two regions, only one non-empty at a time.
 *   <LiveRegion message={politeMessage} />
 *   <LiveRegion politeness="assertive" message={errorMessage} />
 */
export interface LiveRegionProps {
  /** Text to announce. Pass "" when there is nothing to say. */
  message: string;
  /**
   * `"polite"` (default) waits for a pause in speech; `"assertive"` interrupts
   * and should be reserved for errors and other messages the user must hear now.
   */
  politeness?: "polite" | "assertive";
}

function LiveRegion({ message, politeness = "polite" }: LiveRegionProps) {
  return (
    <div aria-live={politeness} aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

export default memo(LiveRegion);
