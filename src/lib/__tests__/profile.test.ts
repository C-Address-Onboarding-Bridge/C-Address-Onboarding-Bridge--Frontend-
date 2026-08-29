import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DISPLAY_NAME_MAX_LENGTH,
  clearDisplayName,
  displayNameStorageKey,
  isRenderableDisplayName,
  loadDisplayName,
  saveDisplayName,
  shortenAddress,
  validateDisplayName,
} from '../profile';

/**
 * Unit tests for the profile store backing the Profile Page. (#325)
 *
 * The interesting cases are the ones the page cannot easily exercise: values
 * that arrive from user-writable `localStorage` in a shape the UI would render
 * badly, and the failure paths where storage is unavailable or full.
 */

const ADDRESS = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRST';

describe('profile store (#325)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('displayNameStorageKey', () => {
    it('namespaces the key per address', () => {
      expect(displayNameStorageKey(ADDRESS)).toBe(`profile:${ADDRESS}:name`);
      expect(displayNameStorageKey('GOTHER')).not.toBe(displayNameStorageKey(ADDRESS));
    });
  });

  describe('validateDisplayName', () => {
    it('accepts a normal name and returns it trimmed', () => {
      const result = validateDisplayName('  Ada Lovelace  ');
      expect(result).toEqual({ ok: true, value: 'Ada Lovelace' });
    });

    it('rejects an empty or whitespace-only name', () => {
      expect(validateDisplayName('').ok).toBe(false);
      expect(validateDisplayName('   ').ok).toBe(false);
    });

    it('rejects a name over the length limit', () => {
      const result = validateDisplayName('x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1));
      expect(result.ok).toBe(false);
      expect(result.ok === false && result.error).toContain(String(DISPLAY_NAME_MAX_LENGTH));
    });

    it('accepts a name exactly at the length limit', () => {
      expect(validateDisplayName('x'.repeat(DISPLAY_NAME_MAX_LENGTH)).ok).toBe(true);
    });

    it('measures length after trimming, so padding cannot push a name over', () => {
      const padded = `  ${'x'.repeat(DISPLAY_NAME_MAX_LENGTH)}  `;
      expect(validateDisplayName(padded).ok).toBe(true);
    });

    it('rejects line breaks and other control characters', () => {
      expect(validateDisplayName('Ada\nLovelace').ok).toBe(false);
      expect(validateDisplayName('Ada\tLovelace').ok).toBe(false);
      // Bidi override — would reorder the surrounding text if rendered.
      expect(validateDisplayName('Ada‮Lovelace').ok).toBe(false);
    });

    it('accepts non-ASCII names', () => {
      expect(validateDisplayName('Ада Лавлейс').ok).toBe(true);
      expect(validateDisplayName('中本聡').ok).toBe(true);
      expect(validateDisplayName('🚀 rocket').ok).toBe(true);
    });

    // --- Unicode / code-point boundary tests (#458) ---

    it('counts each emoji as 1 character, not 2', () => {
      // 🚀 is U+1F680, a single code point that occupies 2 UTF-16 code units.
      // 32 emoji must be accepted; 33 must be rejected.
      const exactly32 = '🚀'.repeat(32);
      const over32    = '🚀'.repeat(33);

      expect(validateDisplayName(exactly32).ok).toBe(true);

      const result = validateDisplayName(over32);
      expect(result.ok).toBe(false);
      // The error must report 33 (code points), not 66 (UTF-16 code units).
      expect(result.ok === false && result.error).toContain('33');
    });

    it('counts astral-plane characters (𝄞 U+1D11E) as 1 each', () => {
      // Musical symbol G-CLEF — U+1D11E — lives outside the BMP.
      const exactly32 = '𝄞'.repeat(32);
      const over32    = '𝄞'.repeat(33);

      expect(validateDisplayName(exactly32).ok).toBe(true);
      expect(validateDisplayName(over32).ok).toBe(false);
    });

    it('counts a combining-mark sequence as its constituent code points', () => {
      // "e\u0301" is two code points (LATIN SMALL LETTER E + COMBINING ACUTE
      // ACCENT) that render as one glyph "é". The limit applies to code points,
      // so 16 of these pairs = 32 code points → accepted; 17 pairs = 34 → rejected.
      const e_acute = 'e\u0301'; // 2 code points
      const exactly32 = e_acute.repeat(16); // 16 × 2 = 32 code points
      const over32    = e_acute.repeat(17); // 17 × 2 = 34 code points

      expect(validateDisplayName(exactly32).ok).toBe(true);
      expect(validateDisplayName(over32).ok).toBe(false);
    });

    it('reports the code-point count in the error, not the UTF-16 length', () => {
      // A name of 33 emoji: code-point length 33, UTF-16 length 66.
      const name = '😀'.repeat(33);
      const result = validateDisplayName(name);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        // Must mention 33 (actual code-point count), not 66 (UTF-16 units).
        expect(result.error).toContain('33');
        expect(result.error).not.toContain('66');
      }
    });

    it('accepts a mixed ASCII + emoji name within the code-point limit', () => {
      // "Hi 🎉🎉🎉" = 3 + 1 + 3 = 7 code points — well within 32.
      expect(validateDisplayName('Hi 🎉🎉🎉').ok).toBe(true);
    });
  });

  describe('isRenderableDisplayName', () => {
    it('rejects non-strings', () => {
      expect(isRenderableDisplayName(null)).toBe(false);
      expect(isRenderableDisplayName(42)).toBe(false);
      expect(isRenderableDisplayName(undefined)).toBe(false);
    });

    it('rejects an untrimmed value, which was never written by this module', () => {
      expect(isRenderableDisplayName(' Ada ')).toBe(false);
    });

    it('accepts a value in the exact shape saveDisplayName writes', () => {
      expect(isRenderableDisplayName('Ada Lovelace')).toBe(true);
    });
  });

  describe('saveDisplayName / loadDisplayName', () => {
    it('round-trips a valid name', () => {
      expect(saveDisplayName(ADDRESS, 'Ada Lovelace')).toBe(true);
      expect(loadDisplayName(ADDRESS)).toBe('Ada Lovelace');
    });

    it('stores the trimmed value, not the raw input', () => {
      saveDisplayName(ADDRESS, '  Ada Lovelace  ');
      expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS))).toBe('Ada Lovelace');
    });

    it('refuses to store an invalid name', () => {
      expect(saveDisplayName(ADDRESS, '')).toBe(false);
      expect(saveDisplayName(ADDRESS, 'x'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(false);
      expect(window.localStorage.getItem(displayNameStorageKey(ADDRESS))).toBeNull();
    });

    it('keeps names for different addresses separate', () => {
      saveDisplayName(ADDRESS, 'Ada');
      saveDisplayName('GOTHERADDRESS0000000000', 'Grace');

      expect(loadDisplayName(ADDRESS)).toBe('Ada');
      expect(loadDisplayName('GOTHERADDRESS0000000000')).toBe('Grace');
    });

    it('no-ops without an address', () => {
      expect(saveDisplayName(null, 'Ada')).toBe(false);
      expect(saveDisplayName(undefined, 'Ada')).toBe(false);
      expect(loadDisplayName(null)).toBeNull();
      expect(loadDisplayName('')).toBeNull();
    });

    it('returns null for a value hand-written into storage in a bad shape', () => {
      // localStorage is user-writable, so reads are re-validated.
      window.localStorage.setItem(displayNameStorageKey(ADDRESS), 'x'.repeat(500));
      expect(loadDisplayName(ADDRESS)).toBeNull();

      window.localStorage.setItem(displayNameStorageKey(ADDRESS), 'Ada\nLovelace');
      expect(loadDisplayName(ADDRESS)).toBeNull();
    });

    // Spied on the prototype, not the instance: the storage accessors reached
    // through `window.localStorage` resolve on Storage.prototype, so an
    // own-property spy on the instance is bypassed.
    it('reports failure instead of throwing when the write is rejected', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });

      expect(saveDisplayName(ADDRESS, 'Ada')).toBe(false);
    });

    it('returns null instead of throwing when the read is rejected', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(loadDisplayName(ADDRESS)).toBeNull();
    });
  });

  describe('clearDisplayName', () => {
    it('removes the stored name', () => {
      saveDisplayName(ADDRESS, 'Ada');
      clearDisplayName(ADDRESS);

      expect(loadDisplayName(ADDRESS)).toBeNull();
    });

    it('leaves other addresses untouched', () => {
      saveDisplayName(ADDRESS, 'Ada');
      saveDisplayName('GOTHERADDRESS0000000000', 'Grace');

      clearDisplayName(ADDRESS);

      expect(loadDisplayName('GOTHERADDRESS0000000000')).toBe('Grace');
    });

    it('swallows a removal failure', () => {
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new Error('SecurityError');
      });

      expect(() => clearDisplayName(ADDRESS)).not.toThrow();
    });
  });

  describe('shortenAddress', () => {
    it('elides the middle of a full Stellar address', () => {
      expect(shortenAddress(ADDRESS)).toBe('GABCDE…OPQRST');
    });

    it('leaves a short string alone', () => {
      expect(shortenAddress('GABC')).toBe('GABC');
      expect(shortenAddress('GABCDEFGHIJK')).toBe('GABCDEFGHIJK');
    });

    it('returns an empty string for no address', () => {
      expect(shortenAddress(null)).toBe('');
      expect(shortenAddress(undefined)).toBe('');
    });
  });
});
