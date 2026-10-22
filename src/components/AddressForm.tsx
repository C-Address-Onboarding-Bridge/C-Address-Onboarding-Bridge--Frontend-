'use client';

import React, { useState, useCallback, useId } from 'react';
import { loadAddressBook } from '@/lib/addressBook';
import { validateStellarAddress } from '@/lib/addressValidation';
import { useHydrated } from '@/hooks/useHydrated';

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
 *
 * Note (#924): this component did not compile (`useHydrated` was called but
 * never imported) and, since it is rendered only in its own tests, that went
 * unnoticed. It is now fixed and safe to render, including two instances on
 * one page (ids are now per-instance via `useId`). It still isn't rendered
 * from the bridge (`src/app/bridge/page.tsx`), CEX (`src/components/routes/cex-page.tsx`)
 * or onramp (`src/components/routes/onramp-page.tsx`) destination inputs, so
 * the address-book-page.tsx (#466) doc comment claiming recipients are
 * "surfaced as autocomplete suggestions in `AddressForm`" is still aspirational
 * — wiring those three destination inputs to this component (or to
 * `loadAddressBook()` directly) is tracked as follow-up work, since each of
 * those pages embeds its own address <input> inside a larger multi-field form
 * and swapping it for this standalone `<form>` needs its own review rather
 * than a blind swap bundled into this compile fix.
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
  // Unique per instance (#924) so two AddressForms on the same page (e.g. a
  // batch-funding list) don't collide on a hard-coded "stellar-address" id.
  const inputId = useId();
  const errorId = useId();
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
        htmlFor={inputId}
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
          id={inputId}
          type="text"
          value={address}
          onChange={handleChange}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          data-testid="address-input"
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
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
          id={errorId}
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
