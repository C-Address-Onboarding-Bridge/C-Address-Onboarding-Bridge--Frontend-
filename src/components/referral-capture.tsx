"use client";

/**
 * Captures `?ref=CODE` on any route into network-scoped, TTL'd storage, then
 * strips it from the URL. (#936)
 *
 * Mounted once in AppChrome so a referral link landing on any page - not
 * just the referrals page itself - gets captured.
 */
import { useEffect } from "react";
import { captureReferralFromUrl } from "@/lib/referrals";
import { currentNetwork } from "@/lib/addressBook";

export function ReferralCapture() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stripped = captureReferralFromUrl(window.location.href, currentNetwork());
    if (stripped !== null) {
      window.history.replaceState(window.history.state, "", stripped);
    }
    // Capture is a one-time, mount-only side effect per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
