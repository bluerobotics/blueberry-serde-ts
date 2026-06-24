/**
 * INVALID_BLOCK_INDEX (0xFFFF) deferred-block sentinel decoding.
 *
 * Ported from `blueberry-serde-python/tests/test_invalid_block_index.py`.
 * When a string/sequence's inline block index equals INVALID_BLOCK_INDEX the
 * deserializer must return an empty string / empty sequence instead of
 * dereferencing a deferred block (which would index out of bounds).
 */

import { describe, expect, test } from 'vitest';

import { deserialize, deserializeMessage, INVALID_BLOCK_INDEX } from '../src/index.js';
import type { BlueberryReader } from '../src/index.js';

const decodeString = (b: Uint8Array): string => deserialize(b, (r) => r.readString());

const decodeU16Sequence = (b: Uint8Array): number[] =>
  deserialize(b, (r) => readU16Sequence(r));

function readU16Sequence(r: BlueberryReader): number[] {
  const seq = r.beginSequence();
  const out: number[] = [];
  for (let i = 0; i < seq.count; i++) {
    out.push(seq.readElement((rr) => rr.readU16()));
  }
  return out;
}

test('INVALID_BLOCK_INDEX constant is 0xFFFF', () => {
  expect(INVALID_BLOCK_INDEX).toBe(0xffff);
});

describe('strings', () => {
  test('index 0 still decodes to empty string', () => {
    expect(decodeString(new Uint8Array([0x00, 0x00]))).toBe('');
  });

  test('INVALID_BLOCK_INDEX decodes to empty string', () => {
    expect(decodeString(new Uint8Array([0xff, 0xff]))).toBe('');
  });

  test('a real (non-sentinel) block index still dereferences', () => {
    // index points 2 bytes ahead (message-relative): [count=3]["abc"]
    // prettier-ignore
    const data = new Uint8Array([
      0x02, 0x00,             // index = 2
      0x03, 0x00, 0x00, 0x00, // count = 3
      0x61, 0x62, 0x63,       // "abc"
    ]);
    expect(decodeString(data)).toBe('abc');
  });
});

describe('sequences', () => {
  test('INVALID_BLOCK_INDEX decodes to empty list', () => {
    expect(decodeU16Sequence(new Uint8Array([0xff, 0xff, 0x00, 0x00]))).toEqual([]);
  });

  test('INVALID_BLOCK_INDEX with nonzero elem length still decodes to empty list', () => {
    // elem_byte_len is ignored when index is the sentinel.
    expect(decodeU16Sequence(new Uint8Array([0xff, 0xff, 0x02, 0x00]))).toEqual([]);
  });

  test('index 0 with zero elem length still decodes to empty list', () => {
    expect(decodeU16Sequence(new Uint8Array([0x00, 0x00, 0x00, 0x00]))).toEqual([]);
  });

  test('a real (non-sentinel) block index still dereferences', () => {
    // index = 4 (message-relative): [count=2][u16 10][u16 20]
    // prettier-ignore
    const data = new Uint8Array([
      0x04, 0x00,             // index = 4
      0x02, 0x00,             // elem_byte_len = 2
      0x02, 0x00, 0x00, 0x00, // count = 2
      0x0a, 0x00,             // 10
      0x14, 0x00,             // 20
    ]);
    expect(decodeU16Sequence(data)).toEqual([10, 20]);
  });
});

test('full message with 0xFFFF placeholders does not index out of bounds', () => {
  // device_id: u32, name: string, readings: list<u16> — all placeholders empty.
  // prettier-ignore
  const message = new Uint8Array([
    0x42, 0x00, 0x01, 0x00, // header word 0: module_message_key
    0x03, 0x00, 0x06, 0x00, // header word 1: length=3 words, max_ordinal=6
    0x64, 0x00, 0x00, 0x00, // device_id = 100
    0xff, 0xff,             // name: INVALID_BLOCK_INDEX -> ""
    0xff, 0xff, 0x00, 0x00, // readings: INVALID_BLOCK_INDEX -> []
  ]);

  const { fields } = deserializeMessage(message, (r) => ({
    deviceId: r.readU32(),
    name: r.readString(),
    readings: readU16Sequence(r),
  }));

  expect(fields.deviceId).toBe(100);
  expect(fields.name).toBe('');
  expect(fields.readings).toEqual([]);
});
