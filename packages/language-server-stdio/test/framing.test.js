import assert from 'node:assert/strict';
import test from 'node:test';

import { createLspFrameReader } from '../src/framing.js';
import { LanguageServerStdioError } from '../src/errors.js';
import { languageServerStdioLimits } from '../src/limits.js';

function framed(body, extraHeaders = []) {
  const bytes = Buffer.from(body, 'utf8');
  return Buffer.concat([
    Buffer.from([
      `Content-Length: ${bytes.length}`,
      ...extraHeaders,
      '',
      '',
    ].join('\r\n'), 'ascii'),
    bytes,
  ]);
}

function assertError(error, code) {
  assert.equal(error instanceof LanguageServerStdioError, true);
  assert.equal(error.code, code);
  assert.equal(error.fatal, true);
  return true;
}

test('reads split and combined LSP frames with supported UTF-8 content types', () => {
  const reader = createLspFrameReader();
  const first = framed('{"one":1}');
  const second = framed('{"two":2}', ['Content-Type: application/vscode-jsonrpc; charset=utf-8']);
  const third = framed('{"three":3}', ['content-type: application/vscode-jsonrpc;charset=utf8']);
  assert.deepEqual(reader.push(first.subarray(0, 8)), []);
  assert.deepEqual(reader.push(first.subarray(8)).map(String), ['{"one":1}']);
  assert.deepEqual(reader.push(Buffer.concat([second, third])).map(String), [
    '{"two":2}',
    '{"three":3}',
  ]);
  reader.finish();
  assert.throws(() => reader.push(Buffer.alloc(0)), (error) => assertError(error, 'reader_closed'));
});

test('rejects malformed, unsupported, duplicate, and non-ASCII header fields', () => {
  const cases = [
    [Buffer.from('\r\n\r\n'), 'content_length_required'],
    [Buffer.from('BadHeader\r\n\r\n'), 'invalid_header'],
    [Buffer.from(': value\r\n\r\n'), 'invalid_header'],
    [Buffer.from('Bad Name: value\r\n\r\n'), 'invalid_header'],
    [Buffer.from('Content-Length: 1\u0001\r\n\r\nx'), 'invalid_header'],
    [Buffer.from([0xff, ...Buffer.from(': 1\r\n\r\nx')]), 'invalid_header'],
    [Buffer.from('Content-Type: application/vscode-jsonrpc\r\n\r\n'), 'content_length_required'],
    [Buffer.from('Content-Length: 1\r\nContent-Length: 1\r\n\r\nx'), 'invalid_content_length'],
    [Buffer.from('Content-Length: -1\r\n\r\n'), 'invalid_content_length'],
    [Buffer.from('Content-Length: 01\r\n\r\nx'), 'invalid_content_length'],
    [Buffer.from('Content-Length: 999999999999999999999999\r\n\r\n'), 'message_too_large'],
    [Buffer.from(`Content-Length: ${languageServerStdioLimits.maxMessageBytes + 1}\r\n\r\n`), 'message_too_large'],
    [framed('{}', ['Content-Type: text/plain']), 'content_type_unsupported'],
    [framed('{}', [
      'Content-Type: application/vscode-jsonrpc',
      'Content-Type: application/vscode-jsonrpc',
    ]), 'content_type_unsupported'],
    [framed('{}', ['X-Unknown: value']), 'header_unsupported'],
  ];
  for (const [bytes, code] of cases) {
    const reader = createLspFrameReader();
    assert.throws(() => reader.push(bytes), (error) => assertError(error, code));
    assert.throws(() => reader.finish(), (error) => assertError(error, 'reader_closed'));
  }
});

test('enforces chunk, header, buffered frame, and per-chunk message limits', () => {
  const tooLargeChunk = new Uint8Array(languageServerStdioLimits.maxChunkBytes + 1);
  assert.throws(
    () => createLspFrameReader().push(tooLargeChunk),
    (error) => assertError(error, 'chunk_too_large'),
  );

  assert.throws(
    () => createLspFrameReader().push(Buffer.alloc(languageServerStdioLimits.maxHeaderBytes + 1, 0x41)),
    (error) => assertError(error, 'header_too_large'),
  );
  assert.throws(
    () => createLspFrameReader().push(Buffer.concat([
      Buffer.alloc(languageServerStdioLimits.maxHeaderBytes + 1, 0x41),
      Buffer.from('\r\n\r\n'),
    ])),
    (error) => assertError(error, 'header_too_large'),
  );

  const prefix = `Content-Length: ${languageServerStdioLimits.maxMessageBytes}`;
  const paddedHeader = `${prefix}${' '.repeat(languageServerStdioLimits.maxHeaderBytes - prefix.length)}`;
  const oversizedIncomplete = Buffer.concat([
    Buffer.from(`${paddedHeader}\r\n\r\n`, 'ascii'),
    Buffer.alloc(languageServerStdioLimits.maxMessageBytes - 3),
  ]);
  assert.throws(
    () => createLspFrameReader().push(oversizedIncomplete),
    (error) => assertError(error, 'buffer_too_large'),
  );

  const longHeaderValue = 'a'.repeat(languageServerStdioLimits.maxHeaderBytes - 'Content-Length: 2097152\r\nX: \r\n'.length);
  const incomplete = Buffer.concat([
    Buffer.from(`Content-Length: ${languageServerStdioLimits.maxMessageBytes}\r\nX: ${longHeaderValue}\r\n\r\n`, 'ascii'),
    Buffer.alloc(languageServerStdioLimits.maxMessageBytes - 3),
  ]);
  assert.throws(
    () => createLspFrameReader().push(incomplete),
    (error) => assertError(error, 'header_unsupported'),
  );

  const emptyFrame = Buffer.from('Content-Length: 0\r\n\r\n', 'ascii');
  assert.throws(
    () => createLspFrameReader().push(Buffer.concat(
      Array.from({ length: languageServerStdioLimits.maxPendingMessages + 1 }, () => emptyFrame),
    )),
    (error) => assertError(error, 'message_flood'),
  );
});

test('rejects invalid and hostile byte chunks without trusting overridden fields', () => {
  for (const value of [null, 'bytes', {}]) {
    assert.throws(
      () => createLspFrameReader().push(value),
      (error) => assertError(error, 'invalid_chunk'),
    );
  }
  assert.throws(
    () => createLspFrameReader().push(new Proxy(new Uint8Array([1]), {})),
    (error) => assertError(error, 'invalid_chunk'),
  );
  const revoked = Proxy.revocable(new Uint8Array([1]), {});
  revoked.revoke();
  assert.throws(
    () => createLspFrameReader().push(revoked.proxy),
    (error) => assertError(error, 'invalid_chunk'),
  );
  class HostileBytes extends Uint8Array {
    get buffer() {
      throw new Error('secret');
    }
  }
  assert.throws(
    () => createLspFrameReader().push(new HostileBytes(1)),
    (error) => assertError(error, 'invalid_chunk'),
  );
});

test('rejects EOF inside an incomplete header or body and closes after clean finish', () => {
  for (const bytes of [
    Buffer.from('Content-Length: 2\r\n', 'ascii'),
    Buffer.from('Content-Length: 2\r\n\r\nx', 'ascii'),
  ]) {
    const reader = createLspFrameReader();
    assert.deepEqual(reader.push(bytes), []);
    assert.throws(() => reader.finish(), (error) => assertError(error, 'unexpected_eof'));
  }
  const clean = createLspFrameReader();
  clean.finish();
  assert.throws(() => clean.finish(), (error) => assertError(error, 'reader_closed'));
});
