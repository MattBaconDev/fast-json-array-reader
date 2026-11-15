// Each parser reads a JSON array from a Node Readable and calls onRow with each element
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const sink = onRow => new Writable({ objectMode: true, write(value, _encoding, callback) { onRow(value); callback(); } });

export const parsers = {
	async 'JSON.parse (whole file)'(source, onRow) {
		const chunks = [];
		for await (const chunk of source) chunks.push(chunk);
		const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
		if (!Array.isArray(value)) throw new Error('not an array');
		for (const element of value) onRow(element);
	},
	async 'splitter (core)'(source, onRow) {
		const { createJsonArraySplitter } = await import('../dist/index.js');
		const splitter = createJsonArraySplitter(onRow);
		for await (const chunk of source) splitter.push(chunk);
		splitter.end();
	},
	async 'splitter (iterator)'(source, onRow) {
		const { splitJsonArray } = await import('../dist/index.js');
		for await (const value of splitJsonArray(source)) onRow(value);
	},
	async 'splitter (stream)'(source, onRow) {
		const { JsonArraySplitStream } = await import('../dist/index.js');
		await pipeline(source, new JsonArraySplitStream(), sink(({ value }) => onRow(value)));
	},
	async 'stream-json'(source, onRow) {
		const { default: streamArray } = await import('stream-json/streamers/stream-array.js');
		await pipeline(source, streamArray.withParserAsStream(), sink(({ value }) => onRow(value)));
	},
	async JSONStream(source, onRow) {
		const { default: JSONStream } = await import('JSONStream');
		await pipeline(source, JSONStream.parse('*'), sink(onRow));
	},
	async '@streamparser/json'(source, onRow) {
		const { JSONParser } = await import('@streamparser/json');
		const parser = new JSONParser({ paths: ['$.*'], keepStack: false });
		parser.onValue = ({ value }) => onRow(value);
		for await (const chunk of source) parser.write(chunk);
		// It ends itself when the root array closes
		if (!parser.isEnded) parser.end();
	},
	async '@datastream/json'(source, onRow) {
		const { jsonParseStream } = await import('@datastream/json');
		const nullValue = Symbol.for('@datastream/null');
		const stream = jsonParseStream();
		await pipeline(source, stream, sink(value => onRow(value === nullValue ? null : value)));
		// It reports bad input here rather than throwing
		const errors = Object.values(stream.result().value);
		if (errors.length) throw Object.assign(new Error('reported: ' + errors.map(e => e.message).join(', ')), { reported: true });
	},
	async jsonarrayfs(source, onRow) {
		const { JsonArrayStream } = await import('jsonarrayfs');
		await pipeline(source, new JsonArrayStream('utf-8'), sink(value => onRow(value === JsonArrayStream.NULL ? null : value)));
	},
};
