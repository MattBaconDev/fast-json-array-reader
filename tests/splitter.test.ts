import assert from 'node:assert';
import { test } from 'vitest';
import { createJsonArraySplitter } from '../src/index.js';
import { objectsOnly, randomArrays, splitAll, streamJsonAll, tricky, trickyJson } from './helpers.js';

test('Matches JSON.parse whatever the chunk boundaries', () => {
	// Small chunks split elements, escapes and multibyte characters at every possible point
	for (let size = 1; size <= 17; size++) {
		assert.deepStrictEqual(splitAll(trickyJson, size), tricky, 'chunk size ' + size);
	}
	assert.deepStrictEqual(splitAll(trickyJson), tricky);
	assert.deepStrictEqual(splitAll(Buffer.from('[]'), 1), []);
	assert.deepStrictEqual(splitAll(Buffer.from(' \r\n\t[ \n ] \n'), 1), []);
});

test('Accepts string chunks', () => {
	const got: unknown[] = [];
	const splitter = createJsonArraySplitter(item => { got.push(item); });
	splitter.push(trickyJson.toString('utf8'));
	splitter.end();
	assert.deepStrictEqual(got, tricky);
});

test('Stops when the callback returns false', () => {
	const got: unknown[] = [];
	const splitter = createJsonArraySplitter(item => { got.push(item); return got.length < 2; });
	assert.strictEqual(splitter.push(trickyJson), false);
	assert.strictEqual(splitter.stopped, true);
	assert.strictEqual(splitter.push(Buffer.from('{"more":1}')), false);
	splitter.end(); // no throw once stopped, even with a partial element left
	assert.strictEqual(got.length, 2);
});

test('Throws on a file cut off at any point', () => {
	const end = trickyJson.lastIndexOf(']') + 1;
	for (let length = 0; length < end; length++) {
		const prefix = trickyJson.subarray(0, length);
		for (const size of [1, 7, length || 1]) {
			assert.throws(() => splitAll(prefix, size), /Unexpected end of JSON array/, `cut off after ${length} bytes, chunk size ${size}`);
		}
	}
});

// Each of these must be rejected by stream-json and the splitter, and is invalid JSON or not an array
const malformed: Record<string, string> = {
	'empty file': '',
	'whitespace only': ' \n ',
	'only [': '[',
	'cut off between elements': '[{"a":1},{"b":2}',
	'cut off after a comma': '[{"a":1},',
	'missing comma': '[{"a":1}{"b":2}]',
	'junk between elements': '[{"a":1}, oops, {"b":2}]',
	'leading comma': '[,{"a":1}]',
	'double comma': '[{"a":1},,{"b":2}]',
	'trailing comma': '[{"a":1},]',
	'second array after the first': '[{"a":1}] [{"b":2}]',
	'junk after the array': '[{"a":1}] x',
	'extra closing bracket': '[{"a":1}]]',
	'top-level object': '{"rows":[{"a":1}]}',
	'top-level string': '"[{}]"',
	'mismatched brackets in an element': '[{"a":1]]',
	'unclosed object in an element': '[{"a":{"b":1},{"c":2}]',
	'invalid escape': '[{"s":"\\x41"}]',
	'leading zero': '[{"n":01}]',
	'bad primitive element': '[tru, {"a":1}]',
	'two primitives without comma': '[1 2]',
	'unterminated string element': '["abc]',
	'BOM after the start': ' ﻿[{"a":1}]',
};

test('Rejects malformed arrays, like stream-json', async () => {
	for (const [name, text] of Object.entries(malformed)) {
		const buffer = Buffer.from(text);
		assert.throws(() => { if (!Array.isArray(JSON.parse(text))) throw new Error('not an array'); }, Error, `JSON.parse should reject: ${name}`);
		await assert.rejects(streamJsonAll(buffer), Error, `stream-json should reject: ${name}`);
		for (const size of [1, 3, buffer.length || 1]) {
			assert.throws(() => splitAll(buffer, size), Error, `splitter should reject: ${name} (chunk size ${size})`);
		}
	}
});

test('Checks primitive elements but only emits objects and arrays', async () => {
	const text = '[1, "x,]}\\"", {"a":1}, null, true, false, -2.5e+3, [2], 0]';
	for (const size of [1, 2, 5, text.length]) {
		assert.deepStrictEqual(splitAll(Buffer.from(text), size), [{ a: 1 }, [2]], 'chunk size ' + size);
	}
	assert.deepStrictEqual(objectsOnly(await streamJsonAll(Buffer.from(text))), [{ a: 1 }, [2]]);
	for (const bad of ['[-]', '[nul]', '[1.]', '[01]', '[1e]', '["\\u12"]']) {
		assert.throws(() => splitAll(Buffer.from(bad)), /Invalid JSON in element 0/, bad);
	}
});

test('Allows a UTF-8 byte order mark at the start', () => {
	assert.deepStrictEqual(splitAll(Buffer.from('﻿[{"a":1}]'), 1), [{ a: 1 }]);
});

test('Errors name the element and byte, and stick', () => {
	const splitter = createJsonArraySplitter(() => {});
	assert.throws(() => splitter.push(Buffer.from('[{"a":1},{"b":}]')), /Invalid JSON in element 1 \(byte 9\)/);
	// Later input or end() report the same error rather than carrying on from an unknown position
	assert.throws(() => splitter.push(Buffer.from(']')), /Invalid JSON in element 1/);
	assert.throws(() => splitter.end(), /Invalid JSON in element 1/);
	assert.throws(() => splitAll(Buffer.from('[{"a":1} {"b":2}]')), /Expected ',' or ']' after element 0 but found '\{' at byte 9/);
	assert.throws(() => splitAll(Buffer.from('[{"a":1}]x')), /Unexpected 'x' after the end of the array at byte 9/);
});

test('An element spanning many chunks costs linear time', () => {
	// Joining the element's chunks on every new chunk made a 32MB row take ~18x longer in 64KB chunks than in one
	const big = Buffer.from('[{"blob":"' + 'x'.repeat(32 * 1024 * 1024) + '"},{"b":1}]');
	const time = (chunkSize: number) => {
		const started = process.hrtime.bigint();
		const got = splitAll(big, chunkSize);
		assert.strictEqual(got.length, 2);
		return Number(process.hrtime.bigint() - started) / 1e6;
	};
	time(big.length); // warm up
	const whole = time(big.length);
	const chunked = time(64 * 1024);
	assert.ok(chunked < whole * 5 + 50, `64KB chunks took ${Math.round(chunked)}ms vs ${Math.round(whole)}ms in one chunk`);
});

test('Matches JSON.parse and stream-json on random arrays', async () => {
	for (const [n, { text, buffer, chunkSize }] of randomArrays(20261114, 400).entries()) {
		const expected = objectsOnly(JSON.parse(text));
		assert.deepStrictEqual(objectsOnly(await streamJsonAll(buffer, chunkSize)), expected, 'stream-json, case ' + n);
		for (const size of [1, 3, chunkSize]) {
			assert.deepStrictEqual(splitAll(buffer, size), expected, `case ${n}, chunk size ${size}`);
		}
	}
});
