'use client';

import React, { useState, useCallback, useEffect, useId } from 'react';
import { StrKey } from '@stellar/stellar-sdk';
import { loadAddressBook, type SavedRecipient } from '@/lib/addressBook';

export interface AddressFormProps {
  onSubmit: (address: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  initialValue?: string;
}

/** Shortens an address for display: GABCDEFG…WXYZ. */
export function truncateAddress(address: string): string {
  return address.length > 12
    ? `${address.slice(0, 8)}…${address.slice(-4)}`
    : address;
}

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

/**
 * Address input form with real-time Stellar address validation.
 */
export function AddressForm({
  onSubmit,
  label = 'Stellar Address',
  placeholder = 'G...',
  disabled = false,
  initialValue = '',
}: AddressFormProps) {
  const [address, setAddress] = useState(initialValue);
  const [error, setError] = useState<string | undefined>();
  const [touched, setTouched] = useState(false);
  const [recipients, setRecipients] = useState<SavedRecipient[]>([]);
  const datalistId = useId();

  // Read from storage after mount only (#466): touching localStorage during
  // render would produce different server and client output and break
  // hydration — same guard as AvatarUpload/ProfilePage use for their stores.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRecipients(loadAddressBook());
  }, []);

  const matchedRecipient = recipients.find((r) => r.address === address.trim());

  // Validation runs on blur, not on every keystroke (#488) — showing an error
  // mid-paste or mid-type would flag characters the user hasn't finished
  // entering yet. A stale error is still cleared immediately so it doesn't
  // linger once the user starts correcting it.
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAddress(e.target.value);
    if (error) setError(undefined);
  }, [error]);

  const handleBlur = useCallback(() => {
    setTouched(true);
    // Normalise on blur/paste: trim whitespace so a trailing space or
    // newline from a paste never gets validated (or submitted) as-is.
    const trimmed = address.trim();
    if (trimmed !== address) setAddress(trimmed);
    if (trimmed) {
      const result = validateStellarAddress(trimmed);
      setError(result.error);
    } else {
      setError(undefined);
    }
  }, [address]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const result = validateStellarAddress(address);
    if (result.valid) {
      setError(undefined);
      onSubmit(address);
    } else {
      setError(result.error);
    }
  }, [address, onSubmit]);

  return (
    <form onSubmit={handleSubmit} data-testid="address-form">
      <label
        htmlFor="stellar-address"
        style={{ display: 'block', marginBottom: '8px', fontWeight: 500, fontSize: '14px' }}
      >
        {label}
      </label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          id="stellar-address"
          type="text"
          value={address}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          data-testid="address-input"
          aria-invalid={!!error}
          aria-describedby={error ? 'address-error' : undefined}
          list={recipients.length > 0 ? datalistId : undefined}
          style={{
            flex: 1,
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
            fontSize: '14px',
            fontFamily: 'monospace',
            outline: 'none',
          }}
        />
        {recipients.length > 0 && (
          <datalist id={datalistId} data-testid="address-recipients-list">
            {recipients.map((recipient) => (
              <option key={recipient.id} value={recipient.address}>
                {recipient.label}
              </option>
            ))}
          </datalist>
        )}
        <button
          type="submit"
          disabled={disabled || !!error || !address}
          data-testid="submit-button"
          style={{
            padding: '10px 20px',
            borderRadius: '8px',
            border: 'none',
            backgroundColor: disabled || !!error || !address ? '#9ca3af' : '#3b82f6',
            color: 'white',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          Submit
        </button>
      </div>
      {error && (
        <p
          id="address-error"
          data-testid="address-error"
          style={{ color: '#ef4444', fontSize: '13px', marginTop: '6px' }}
          role="alert"
        >
          {error}
        </p>
      )}
      {!error && touched && address && (
        <p
          data-testid="address-confirmation"
          style={{ color: '#16a34a', fontSize: '13px', marginTop: '6px' }}
        >
          Looks good: {truncateAddress(address)}
        </p>
      )}
      {matchedRecipient && (
        <p
          data-testid="address-recipient-label"
          style={{ color: '#6b7280', fontSize: '13px', marginTop: '4px' }}
        >
          Saved as &quot;{matchedRecipient.label}&quot;
        </p>
      )}
    </form>
  );
}

export default AddressForm;
