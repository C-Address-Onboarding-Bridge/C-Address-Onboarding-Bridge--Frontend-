'use client';

import React, { useState, useCallback, useEffect, useId } from 'react';
import { loadAddressBook, type SavedRecipient } from '@/lib/addressBook';
import { validateStellarAddress } from '@/lib/addressValidation';

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

// Moved to `src/lib/addressValidation.ts` (#721); re-exported for existing callers.
export { validateStellarAddress };

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
  const hydrated = useHydrated();
  const datalistId = useId();
  const recipients = hydrated ? loadAddressBook() : [];
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
      {/*
        Mobile-optimised layout (#487): stacked full-width input/button below
        the `sm` breakpoint so the tap target for each is comfortably wide,
        and side-by-side above it. `minHeight: 44px` on both controls meets
        the ~44px touch-target guideline on every viewport.
      */}
      <div className="flex flex-col sm:flex-row" style={{ gap: '8px' }}>
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
            padding: '12px',
            minHeight: '44px',
            borderRadius: '8px',
            border: `1px solid ${error ? '#ef4444' : '#d1d5db'}`,
            fontSize: '14px',
            fontFamily: 'monospace',
            outline: 'none',
            boxSizing: 'border-box',
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
          className="w-full sm:w-auto"
          style={{
            padding: '12px 20px',
            minHeight: '44px',
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
