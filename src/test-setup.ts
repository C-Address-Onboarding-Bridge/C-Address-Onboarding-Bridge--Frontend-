import { Buffer } from 'node:buffer';
import '@testing-library/jest-dom';

/**
 * Realign the typed-array constructors with Node's. (#332)
 *
 * Vitest's jsdom environment builds `window` inside its own realm and copies
 * that realm's globals over the Node ones, so the global `Uint8Array` a test
 * sees is jsdom's — a different constructor from the one `Buffer` subclasses.
 * `Buffer.from([1]) instanceof Uint8Array` is therefore `false`, and any library
 * that type-checks a byte array that way rejects a Buffer outright.
 *
 * That is what made four test files fail to collect: `Keypair.random()` feeds a
 * Buffer into `@noble/curves`, whose `abytes` guard checks
 * `instanceof Uint8Array` and throws "private key must be hex string or
 * Uint8Array".
 *
 * `Buffer` is imported from `node:buffer` rather than read off the global so it
 * is Node's own class whatever the environment has overwritten, and its
 * prototype chain is the only remaining handle on Node's `Uint8Array`.
 */
const NodeUint8Array: Uint8ArrayConstructor =
  Object.getPrototypeOf(Buffer.prototype).constructor;

if (globalThis.Uint8Array !== NodeUint8Array) {
  // ArrayBuffer moves with it: a Node Uint8Array's `.buffer` is a Node
  // ArrayBuffer, so leaving jsdom's in place would relocate the same
  // cross-realm mismatch one level down.
  const NodeArrayBuffer = new NodeUint8Array(0).buffer.constructor;

  Object.defineProperty(globalThis, 'Uint8Array', {
    value: NodeUint8Array,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'ArrayBuffer', {
    value: NodeArrayBuffer,
    configurable: true,
    writable: true,
  });
}
