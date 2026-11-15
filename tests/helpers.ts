import { Readable, pipeline } from 'node:stream';
import streamArray from 'stream-json/streamers/stream-array.js';
import { createJsonArraySplitter, type SplitterOptions } from '../src/index.js';

export const tricky = [
	{ a: 'x}]{["\\"' },
	{ b: '£€😀 "quoted" \\', nested: { deep: [1, { e: '}' }] } },
	[1, 2, { arr: '[' }],
	{ empty: '' },
	{},
];
export const trickyJson = Buffer.from(' [ ' + tricky.map(t => JSON.stringify(t, null, 1)).join(' ,\n') + ' ] ');

export function chunksOf(buffer: Buffer, chunkSize: number): Buffer[] {
	const chunks = [];
	for (let i = 0; i < buffer.length; i += chunkSize) chunks.push(buffer.subarray(i, i + chunkSize));
	return chunks;
}

export function splitAll(buffer: Buffer, chunkSize = buffer.length || 1, options?: SplitterOptions): unknown[] {
	const got: unknown[] = [];
	const splitter = createJsonArraySplitter(item => { got.push(item); }, options);
	for (const chunk of chunksOf(buffer, chunkSize)) splitter.push(chunk);
	splitter.end();
	return got;
}

/** Every element stream-json finds in a top-level array; rejects on any JSON error */
export function streamJsonAll(buffer: Buffer, chunkSize = buffer.length || 1): Promise<unknown[]> {
	return new Promise((resolve, reject) => {
		const got: unknown[] = [];
		const parser = streamArray.withParserAsStream();
		parser.on('data', ({ value }: { value: unknown }) => got.push(value));
		pipeline(Readable.from(chunksOf(buffer, chunkSize)), parser, err => err ? reject(err) : resolve(got));
	});
}

export const objectsOnly = (items: unknown[]) => items.filter(v => v !== null && typeof v === 'object');

/** Seeded, so a failing case can be reproduced */
export function randomArrays(seed: number, count: number) {
	const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
	const pick = <T>(list: T[]) => list[Math.floor(random() * list.length)]!;
	const awkward = ['"', '\\', '{', '}', '[', ']', ',', ':', '£', '€', '😀', ' ', '\u0000', '\n', 'a', ' ', 'é', '\ud800'];
	const randomString = () => Array.from({ length: Math.floor(random() * 10) }, () => pick(awkward)).join('');
	const randomValue = (depth: number): unknown => {
		const r = random();
		if (depth > 4 || r < 0.3) return pick<() => unknown>([randomString, () => Math.round(random() * 1e6) / 100 - 5e3, () => true, () => false, () => null])();
		const size = Math.floor(random() * 5);
		if (r < 0.65) return Object.fromEntries(Array.from({ length: size }, () => [randomString(), randomValue(depth + 1)]));
		return Array.from({ length: size }, () => randomValue(depth + 1));
	};
	const whitespace = () => pick(['', ' ', '\n', '\t', '\r\n  ']);
	return Array.from({ length: count }, () => {
		const elements = Array.from({ length: Math.floor(random() * 7) }, () => randomValue(0));
		const text = whitespace() + '[' + whitespace() + elements.map(e => JSON.stringify(e, null, random() < 0.5 ? 0 : 2)).join(whitespace() + ',' + whitespace()) + whitespace() + ']' + whitespace();
		const buffer = Buffer.from(text);
		return { text, buffer, chunkSize: 1 + Math.floor(random() * buffer.length) };
	});
}
