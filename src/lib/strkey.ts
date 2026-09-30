const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const VERSION_ED25519_PUBLIC_KEY = 6 << 3;
const VERSION_CONTRACT = 2 << 3;

/** Decode a canonical Stellar StrKey and check its version and CRC16-XModem. */
function hasStrKeyVersion(value: string, expectedVersion: number): boolean {
  if (value.length !== 56) return false;

  const bytes = new Uint8Array(35);
  let buffer = 0;
  let bits = 0;
  let outputIndex = 0;

  for (const character of value) {
    const digit = BASE32_ALPHABET.indexOf(character);
    if (digit < 0) return false;
    buffer = (buffer << 5) | digit;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      if (outputIndex >= bytes.length) return false;
      bytes[outputIndex++] = (buffer >> bits) & 0xff;
    }
  }

  if (outputIndex !== bytes.length || bits !== 0 || bytes[0] !== expectedVersion) {
    return false;
  }

  let checksum = 0;
  for (let index = 0; index < bytes.length - 2; index += 1) {
    checksum ^= bytes[index] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      checksum = (checksum & 0x8000) !== 0
        ? ((checksum << 1) ^ 0x1021) & 0xffff
        : (checksum << 1) & 0xffff;
    }
  }

  // StrKey stores the CRC16 in little-endian order.
  return bytes[33] === (checksum & 0xff) && bytes[34] === (checksum >> 8);
}

export function isValidEd25519PublicKey(value: string): boolean {
  return hasStrKeyVersion(value, VERSION_ED25519_PUBLIC_KEY);
}

export function isValidContract(value: string): boolean {
  return hasStrKeyVersion(value, VERSION_CONTRACT);
}
