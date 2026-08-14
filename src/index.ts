/**
 * Public surface of `blueberry-serde-ts`.
 *
 * Re-exports the hand-written wire-format runtime and the generated message
 * codecs. Existing `serializePacket` imports keep working; message classes
 * are also available from `blueberry-serde-ts/messages`.
 */

export * from './runtime.js';
export * from './generated/index.js';
