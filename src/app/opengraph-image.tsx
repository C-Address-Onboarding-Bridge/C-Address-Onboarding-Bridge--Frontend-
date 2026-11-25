import { ImageResponse } from "next/og";

/**
 * #1003: every layout pointed its Open Graph / Twitter image at
 * /og-image.png, which never existed in public/. Next generates this route
 * (and the matching twitter-image) at build time instead, so the URLs the
 * metadata resolves to always exist.
 */
export const alt = "C-Address Bridge - Fund Soroban Smart Accounts";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #0b1020 0%, #1b2a4a 100%)",
          color: "#ffffff",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
          C-Address Bridge
        </div>
        <div style={{ fontSize: 36, marginTop: 24, color: "#9fb3d1" }}>
          Fund any Soroban smart account (C-address) directly
        </div>
        <div style={{ fontSize: 28, marginTop: 16, color: "#6f86a8" }}>
          CEX withdrawal · credit card · existing G-address
        </div>
      </div>
    ),
    size
  );
}
