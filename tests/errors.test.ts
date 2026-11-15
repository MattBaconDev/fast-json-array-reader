import assert from 'node:assert';
import { test } from 'vitest';
import { createJsonArraySplitter, JsonArraySplitError } from '../src/index.js';

function errorFrom(text: string) {
	const splitter = createJsonArraySplitter(() => {});
	try {
		splitter.push(text);
		splitter.end();
	}
	catch (err) {
		return err;
	}
	assert.fail('expected an error for ' + text);
}

test('Every kind of error is a JsonArraySplitError with its offset and element', () => {
	const cases: [string, RegExp, number, number | undefined][] = [
		['x', /Expected '\[' but found 'x' at byte 0/, 0, undefined],
		['[{"a":1},{"b":}]', /Invalid JSON in element 1 \(byte 9\)/, 9, 1],
		['[{"a":1},,]', /Expected an array element but found ',' at byte 9/, 9, 1],
		['[{"a":1} {"b":2}]', /Expected ',' or ']' after element 0 but found '\{' at byte 9/, 9, undefined],
		['[{"a":1}]x', /Unexpected 'x' after the end of the array at byte 9/, 9, undefined],
		['', /Unexpected end of JSON array \(no '\[' found\) at byte 0/, 0, undefined],
		['[{"a":1},', /Unexpected end of JSON array \(after 1 element\(s\)\) at byte 9/, 9, undefined],
		['[{"a":1},{"b"', /Unexpected end of JSON array \(after 1 element\(s\)\) at byte 13/, 13, 1],
	];
	for (const [text, message, offset, elementIndex] of cases) {
		const err = errorFrom(text);
		assert.ok(err instanceof JsonArraySplitError, text);
		assert.ok(err instanceof Error, text);
		assert.strictEqual(err.name, 'JsonArraySplitError', text);
		assert.match(err.message, message, text);
		assert.strictEqual(err.offset, offset, text);
		assert.strictEqual(err.elementIndex, elementIndex, text);
	}
});

test('Invalid JSON in an element keeps the JSON.parse error as its cause', () => {
	const err = errorFrom('[1, {"a":}]');
	assert.ok(err instanceof JsonArraySplitError);
	assert.ok(err.cause instanceof SyntaxError);
	assert.ok(err.message.endsWith(err.cause.message));
});

test('An error thrown by onItem passes through unchanged, then sticks', () => {
	const thrown = new TypeError('from onItem');
	const splitter = createJsonArraySplitter(() => { throw thrown; });
	assert.throws(() => splitter.push('[{"a":1}'), err => err === thrown);
	assert.throws(() => splitter.push(']'), err => err === thrown);
	assert.throws(() => splitter.end(), err => err === thrown);
});
