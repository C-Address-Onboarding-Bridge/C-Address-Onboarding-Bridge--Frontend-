import { StrKey } from '@stellar/stellar-sdk';

/**
 * Validates a Stellar public key (G... address), distinguishing the specific
 * ways a paste can go wrong so the message tells the user what to fix rather
 * than just that something is wrong. A wrong destination address is
 * unrecoverable once funds are sent, so precise feedback here is a safety
 * feature, not polish. (#488)
 */
export function validateStellarAddress(address: string): {
  valid: boolean;
  error?: string;
} {
  const trimmed = address.trim();

  if (!trimmed) {
    return { valid: false, error: 'Address is required' };
  }

  // The most common source of misdirected funds: a Soroban smart-account
  // (C-address) pasted where a classic G-address is required. Naming this
  // explicitly instead of falling through to "must start with G" turns the
  // project's central premise — G vs C — from a confusing generic error into
  // an actionable one.
  if (StrKey.isValidContract(trimmed)) {
    return {
      valid: false,
      error:
        'This is a C-address (Soroban smart account) — this field needs a G-address (classic Stellar account) instead.',
    };
  }

  if (!trimmed.startsWith('G')) {
    return { valid: false, error: 'Stellar addresses must start with G' };
  }

  if (trimmed.length < 56) {
    return {
      valid: false,
      error: `Address looks cut off — it's ${trimmed.length} of 56 characters. Check the paste didn't get truncated.`,
    };
  }

  if (trimmed.length > 56) {
    return {
      valid: false,
      error: `Address is too long — Stellar addresses are exactly 56 characters (this one has ${trimmed.length}).`,
    };
  }

  try {
    if (!StrKey.isValidEd25519PublicKey(trimmed)) {
      return {
        valid: false,
        error: 'Invalid address — the checksum does not match. Double-check for a mistyped or altered character.',
      };
    }
  } catch {
    return { valid: false, error: 'Invalid Stellar address format' };
  }

  return { valid: true };
}
