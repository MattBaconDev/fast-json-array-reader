// Times each parser on each file in bench/data/, each run in its own child process.
// Usage: node bench/run.mjs [file-name-filter] [parser-name-filter]  (run `npm run build` and bench/generate.mjs first)
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const dataDir = path.join(import.meta.dirname, 'data');
const RUNS = 3;
const read = file => fs.createReadStream(file, { highWaterMark: 64 * 1024 });
const sink = onRow => new Writable({ objectMode: true, write(value, _encoding, callback) { onRow(value); callback(); } });

const parsers = {
	async 'JSON.parse (whole file)'(file, onRow) {
		for (const value of JSON.parse(fs.readFileSync(file, 'utf8'))) onRow(value);
	},
	async 'splitter (core)'(file, onRow) {
		const { createJsonArraySplitter } = await import('../dist/index.js');
		const splitter = createJsonArraySplitter(onRow);
		for await (const chunk of read(file)) splitter.push(chunk);
		splitter.end();
	},
	async 'splitter (iterator)'(file, onRow) {
		const { splitJsonArray } = await import('../dist/index.js');
		for await (const value of splitJsonArray(read(file))) onRow(value);
	},
	async 'splitter (stream)'(file, onRow) {
		const { JsonArraySplitStream } = await import('../dist/index.js');
		await pipeline(read(file), new JsonArraySplitStream(), sink(({ value }) => onRow(value)));
	},
	async 'stream-json'(file, onRow) {
		const { default: streamArray } = await import('stream-json/streamers/stream-array.js');
		await pipeline(read(file), streamArray.withParserAsStream(), sink(({ value }) => onRow(value)));
	},
	async JSONStream(file, onRow) {
		const { default: JSONStream } = await import('JSONStream');
		await pipeline(read(file), JSONStream.parse('*'), sink(onRow));
	},
	async '@streamparser/json'(file, onRow) {
		const { JSONParser } = await import('@streamparser/json');
		const parser = new JSONParser({ paths: ['$.*'], keepStack: false });
		parser.onValue = ({ value }) => onRow(value);
		for await (const chunk of read(file)) parser.write(chunk);
		if (!parser.isEnded) parser.end();
	},
	async '@datastream/json'(file, onRow) {
		const { jsonParseStream } = await import('@datastream/json');
		const nullValue = Symbol.for('@datastream/null');
		const stream = jsonParseStream();
		await pipeline(read(file), stream, sink(value => onRow(value === nullValue ? null : value)));
		const errors = Object.values(stream.result().value);
		if (errors.length) throw new Error('reported errors: ' + JSON.stringify(errors));
	},
	async jsonarrayfs(file, onRow) {
		const { JsonArrayStream } = await import('jsonarrayfs');
		await pipeline(read(file), new JsonArrayStream('utf-8'), sink(value => onRow(value === JsonArrayStream.NULL ? null : value)));
	},
};

async function child(parserName, file, hash) {
	let peakHeap = 0;
	const sample = () => { peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed); };
	const timer = setInterval(sample, 20);
	const sha1 = createHash('sha1');
	let rows = 0;
	const onRow = hash ? value => { rows++; sha1.update(JSON.stringify(value) + '\n'); } : () => { rows++; };
	const started = process.hrtime.bigint();
	let error;
	try {
		await parsers[parserName](file, onRow);
	}
	catch (err) {
		error = err.message.slice(0, 200);
	}
	const ms = Number(process.hrtime.bigint() - started) / 1e6;
	clearInterval(timer);
	sample();
	process.stdout.write(JSON.stringify({ ms, rows, sha1: hash ? sha1.digest('hex') : undefined, peakHeap, maxRSS: process.resourceUsage().maxRSS * 1024, error }));
}

function runChild(parserName, file, hash) {
	const out = execFileSync(process.execPath, [import.meta.filename, '--child', parserName, file, hash ? 'hash' : ''], { encoding: 'utf8', maxBuffer: 1e6 });
	return JSON.parse(out);
}

const mb = bytes => `${Math.round(bytes / 1024 / 1024)}MB`;
const seconds = ms => (ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`);

async function main() {
	const [fileFilter = '', parserFilter = ''] = process.argv.slice(2);
	const files = fs.readdirSync(dataDir).filter(name => name.endsWith('.json') && name.includes(fileFilter)).sort();
	const lines = [`Node ${process.version}, ${os.cpus()[0].model}, ${os.cpus().length} cores, ${os.platform()} ${os.arch()}. 64KB chunks, best of ${RUNS}.`, ''];
	for (const name of files) {
		const file = path.join(dataDir, name);
		lines.push(`### ${name} (${mb(fs.statSync(file).size)})`, '', '| Parser | Time | Rows | Peak heap | Peak RSS | Same rows as stream-json |', '|---|---|---|---|---|---|');
		const reference = runChild('stream-json', file, true);
		for (const parserName of Object.keys(parsers).filter(p => p.includes(parserFilter))) {
			const check = parserName === 'stream-json' ? reference : runChild(parserName, file, true);
			let best = check;
			if (!check.error) {
				for (let i = 0; i < RUNS; i++) {
					const run = runChild(parserName, file, false);
					if (run.ms < best.ms) best = { ...run, sha1: check.sha1 };
				}
			}
			const output = check.error ? `error: ${check.error}` : check.sha1 === reference.sha1 && check.rows === reference.rows ? 'yes' : '**no**';
			const line = `| ${parserName} | ${check.error ? '-' : seconds(best.ms)} | ${check.rows} | ${mb(best.peakHeap)} | ${mb(best.maxRSS)} | ${output} |`;
			console.error(name, line);
			lines.push(line);
		}
		lines.push('');
	}
	fs.writeFileSync(path.join(import.meta.dirname, 'results.md'), lines.join('\n'));
	console.log(lines.join('\n'));
}

if (process.argv[2] === '--child') await child(process.argv[3], process.argv[4], process.argv[5] === 'hash');
else await main();
