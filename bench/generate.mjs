// Writes seeded benchmark files to bench/data/. Usage: node bench/generate.mjs [name ...]
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';

const dataDir = path.join(import.meta.dirname, 'data');

let seed = 20261115;
const random = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const int = (min, max) => min + Math.floor(random() * (max - min + 1));
const pick = list => list[Math.floor(random() * list.length)];

const hex = n => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('');
const uuid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-${pick(['8', '9', 'a', 'b'])}${hex(3)}-${hex(12)}`;
const words = ['alpha', 'bravo', 'status', 'order', 'customer', 'Zürich', 'café', 'naïve', '東京', 'Ελλάδα', 'emoji 😀', 'say "hi"', 'C:\\path', 'line\nbreak', 'tab\there', 'total', 'pending', 'shipped', '£12.50', '€9'];
const text = length => {
	let s = '';
	while (s.length < length) s += pick(words) + ' ';
	return s.slice(0, length);
};
const attributeNames = Array.from({ length: 200 }, (_, i) => `${pick(['field', 'attr', 'col', 'prop'])}_${i}_${hex(4)}`);

function row(id, { attrs, longChance, longLength }) {
	const values = {};
	for (let i = int(...attrs); i > 0; i--) {
		values[pick(attributeNames)] = text(random() < longChance ? int(longLength / 2, longLength * 2) : int(3, 30));
	}
	return { ndbid: id, tableId: int(1, 40), colStructId: int(1, 500), id: uuid(), values: [[], [], [], 1.7e12 + random() * 1e10, values] };
}

const files = {
	'rows-100mb.json': { bytes: 100e6, element: id => row(id, { attrs: [10, 25], longChance: 0.03, longLength: 200 }) },
	'rows-450mb.json': { bytes: 450e6, element: id => row(id, { attrs: [10, 40], longChance: 0.12, longLength: 800 }) },
	'numbers-1m.json': { count: 1e6, element: () => pick([int(0, 1000), int(-1e6, 1e6), Math.round(random() * 1e6) / 1e3, random() * 1e-5]) },
	'strings-1m.json': { count: 1e6, element: () => text(int(1, 12)) },
	'literals-1m.json': { count: 1e6, element: () => pick([true, false, null]) },
	'one-32mb-element.json': { count: 1, element: () => ({ blob: text(32 * 1024 * 1024) }) },
};

async function write(name, { bytes = Infinity, count = Infinity, element }, fileSeed) {
	seed = fileSeed;
	const file = path.join(dataDir, name);
	const out = fs.createWriteStream(file);
	let written = 0;
	const put = async s => {
		written += Buffer.byteLength(s);
		if (!out.write(s)) await once(out, 'drain');
	};
	await put('[\n');
	for (let n = 0; n < count && written < bytes; n++) await put((n ? ',\n' : '') + JSON.stringify(element(n)));
	await put('\n]\n');
	out.end();
	await once(out, 'finish');
	console.log(`${name}: ${(written / 1e6).toFixed(1)}MB`);
}

fs.mkdirSync(dataDir, { recursive: true });
const names = process.argv.slice(2);
for (const [i, [name, spec]] of Object.entries(files).entries()) {
	if (!names.length || names.includes(name)) await write(name, spec, 1000 + i);
}
