import assert from 'node:assert';
import { Readable, Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'vitest';
import { JsonArraySplitError, JsonArraySplitStream, splitJsonArray, type SplitterOptions } from '../src/index.js';
import { chunksOf, objectsOnly, randomArrays, tricky, trickyJson } from './helpers.js';

async function iterateAll(source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>, options?: SplitterOptions) {
	const got = [];
	for await (const value of splitJsonArray(source, options)) got.push(value);
	return got;
}

async function streamAll(chunks: Buffer[], options?: SplitterOptions) {
	const got: unknown[] = [];
	await pipeline(Readable.from(chunks), new JsonArraySplitStream(options), new Writable({
		objectMode: true,
		write(value, _encoding, callback) {
			got.push(value);
			callback();
		},
	}));
	return got;
}

/** A Readable of `[{"n":0},{"n":1},…` that never ends, counting the bytes read from it */
function endlessArray() {
	let bytes = 0;
	const source = Readable.from((function* () {
		yield Buffer.from('[');
		for (let n = 0; ; n++) {
			const chunk = Buffer.from(`{"n":${n}},`);
			bytes += chunk.length;
			yield chunk;
		}
	})());
	return { source, bytesRead: () => bytes };
}

test('Iterator and stream give the same elements as JSON.parse on random arrays', async () => {
	for (const [n, { text, buffer, chunkSize }] of randomArrays(20261115, 200).entries()) {
		const expected: unknown[] = JSON.parse(text);
		const chunks = chunksOf(buffer, chunkSize);
		assert.deepStrictEqual(await iterateAll(chunks), expected, 'iterator, case ' + n);
		assert.deepStrictEqual(await iterateAll(Readable.from(chunks), { primitives: false }), objectsOnly(expected), 'iterator, objects only, case ' + n);
		assert.deepStrictEqual(await streamAll(chunks), expected.map((value, index) => ({ index, value })), 'stream, case ' + n);
		assert.deepStrictEqual(await streamAll(chunks, { primitives: false }), objectsOnly(expected), 'stream, objects only, case ' + n);
	}
});

test('Iterator takes string chunks, and gives elements before an error', async () => {
	assert.deepStrictEqual(await iterateAll([trickyJson.toString('utf8')]), tricky);
	const got: unknown[] = [];
	await assert.rejects(async () => {
		for await (const value of splitJsonArray(['[1, 2, {"a":}]'])) got.push(value);
	}, JsonArraySplitError);
	assert.deepStrictEqual(got, [1, 2]);
});

test('Errors reach the for await loop and the pipeline', async () => {
	for (const text of ['[{"a":1},{"b":}]', '[{"a":1},', '[{"a":1}] x']) {
		const chunks = chunksOf(Buffer.from(text), 3);
		await assert.rejects(iterateAll(Readable.from(chunks)), JsonArraySplitError, text);
		await assert.rejects(streamAll(chunks), JsonArraySplitError, text);
	}
});

test('Breaking out of the loop destroys the source', async () => {
	const { source } = endlessArray();
	for await (const value of splitJsonArray(source)) {
		if (value.n === 5) break;
	}
	assert.strictEqual(source.destroyed, true);
});

test('A slow consumer holds back the source', async () => {
	const { source, bytesRead } = endlessArray();
	let consumed = 0;
	const consumer = new Writable({
		objectMode: true,
		highWaterMark: 1,
		write(_value, _encoding, callback) {
			consumed++;
			setTimeout(callback, 2);
		},
	});
	const done = pipeline(source, new JsonArraySplitStream(), consumer).catch(() => {});
	await sleep(100);
	const early = bytesRead();
	await sleep(200);
	source.destroy();
	await done;
	assert.ok(consumed > 10, `consumed ${consumed}`);
	// The streams' buffers fill up first (64KB by default), then reading only keeps pace with the consumer
	assert.ok(bytesRead() < 256 * 1024, `read ${bytesRead()} bytes`);
	assert.ok(bytesRead() - early < 100 * 20, `read ${bytesRead() - early} more bytes while ${consumed} were consumed`);
});

test('Reads a web ReadableStream of Uint8Array chunks', async () => {
	const web = Readable.toWeb(Readable.from(chunksOf(trickyJson, 5).map(c => new Uint8Array(c))));
	assert.deepStrictEqual(await iterateAll(web), tricky);
	let pulls = 0;
	const endless = new ReadableStream<Uint8Array>({
		pull(controller) {
			controller.enqueue(new TextEncoder().encode(pulls++ ? `{"n":${pulls}},` : '['));
		},
	});
	for await (const value of splitJsonArray(endless)) {
		if (value.n > 3) break;
	}
	assert.ok(pulls < 20);
});
