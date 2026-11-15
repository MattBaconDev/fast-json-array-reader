// Feeds broken and awkward arrays to each parser, one byte per chunk, and prints a markdown table.
// Usage: node bench/strictness.mjs  (run `npm run build` first)
import assert from 'node:assert';
import { Readable } from 'node:stream';
import { parsers } from './parsers.mjs';

const broken = {
	'Empty input': '',
	'Whitespace only': ' \n ',
	'Cut off inside an element': '[{"a":1},{"b":',
	'Cut off between elements': '[{"a":1},{"b":2}',
	'Missing comma': '[{"a":1}{"b":2}]',
	'Leading comma': '[,{"a":1}]',
	'Double comma': '[{"a":1},,{"b":2}]',
	'Trailing comma': '[{"a":1},]',
	'Data after `]`': '[{"a":1}] x',
	'Second array after the first': '[{"a":1}] [{"b":2}]',
	'Top-level object': '{"rows":[{"a":1}]}',
	'Top-level string': '"[{}]"',
	'Invalid JSON in an element': '[{"n":01}]',
};

const awkward = {
	'`null` elements': '[null,{"a":null},null]',
	'Big integers': '[{"n":12345678901234567890}]',
	'`__proto__` keys': '[{"__proto__":{"x":1}}]',
	'Multi-byte characters split across chunks': '[{"s":"£€😀 Zürich 東京"}]',
	'Primitive elements': '[1,"a",true,-0.5e3]',
};

const bytesOf = text => [...Buffer.from(text)].map(b => Buffer.of(b));

async function run(parse, text) {
	const rows = [];
	try {
		await parse(Readable.from(bytesOf(text)), row => rows.push(row));
		return { rows };
	}
	catch (err) {
		return { rows, error: err };
	}
}

const names = Object.keys(parsers);
const header = `| Input | ${names.join(' | ')} |\n|---|${names.map(() => '---').join('|')}|`;
const lines = ['Broken input (✅ = throws an error, 📝 = reports an error but doesn\'t throw, ❌ = accepts it):', '', header];
for (const [label, text] of Object.entries(broken)) {
	const cells = [];
	for (const name of names) {
		const { error } = await run(parsers[name], text);
		cells.push(!error ? '❌' : error.reported ? '📝' : '✅');
	}
	lines.push(`| ${label} | ${cells.join(' | ')} |`);
}
lines.push('', 'Valid input (✅ = same values as `JSON.parse`, ❌ = different values or an error):', '', header);
for (const [label, text] of Object.entries(awkward)) {
	const cells = [];
	for (const name of names) {
		const { rows, error } = await run(parsers[name], text);
		let same = !error;
		try {
			assert.deepStrictEqual(rows, JSON.parse(text));
		}
		catch {
			same = false;
		}
		cells.push(same ? '✅' : '❌');
	}
	lines.push(`| ${label} | ${cells.join(' | ')} |`);
}
console.log(lines.join('\n'));
