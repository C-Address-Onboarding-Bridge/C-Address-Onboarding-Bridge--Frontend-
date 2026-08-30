"use client";

import { useEffect, useRef, useState } from "react";

/**
 * QrCode — renders a QR code for `value` onto an HTML canvas entirely
 * client-side. No data is sent to any external service. (#460)
 *
 * The `qrcode` package is loaded dynamically on first render so it doesn't
 * bloat the initial bundle for users who never visit the "Request funds" view.
 */
export interface QrCodeProps {
  /** The string to encode. */
  value: string;
  /** Canvas size in pixels (both width and height). Defaults to 256. */
  size?: number;
  /** Accessible label for the QR code image. */
  label?: string;
}

export default function QrCode({ value, size = 256, label = "QR code" }: QrCodeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!value || !canvasRef.current) return;

    let cancelled = false;

    import("qrcode")
      .then((QRCode) => {
        if (cancelled || !canvasRef.current) return;
        QRCode.toCanvas(canvasRef.current, value, {
          width: size,
          margin: 2,
          color: {
            dark: "#000000",
            light: "#ffffff",
          },
        }).catch((err: unknown) => {
          if (!cancelled) {
            setError(err instanceof Error ? err.message : "Failed to generate QR code");
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load QR code library");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <div
        role="img"
        aria-label={label}
        className="flex items-center justify-center bg-[var(--surface-2)] rounded-lg text-xs text-[var(--text-muted)] p-4"
        style={{ width: size, height: size }}
      >
        Unable to render QR code
      </div>
    );
  }

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      width={size}
      height={size}
      className="rounded-lg"
    />
  );
}
