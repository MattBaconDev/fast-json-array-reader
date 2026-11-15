# fast-json-array-reader

Stream a large JSON array (`[{…},{…},…]`) and get its elements one at a time, without loading the whole file. On arrays of real-sized objects it is about **3× faster** than the popular streaming JSON parsers, uses no more memory, and is just as strict about broken input.

```js
import { splitJsonArray } from 'fast-json-array-reader';

for await (const row of splitJsonArray(fs.createReadStream('rows.json'))) {
	// row is the parsed element
}
```

Zero dependencies. Node.js ≥ 20.19. ESM, and `require()` works too.

## Why it exists

It was written for a document store that keeps each partition's rows as one big JSON array file, up to about 500MB. Loading those files had two bad options:

- **`JSON.parse` the whole file.** Fast, but the whole text and the whole object graph are in memory at once, and a file over about 512MB can't even be turned into one string (V8's maximum string length).
- **A streaming JSON parser** (stream-json, JSONStream, @streamparser/json). Memory stays flat, but they tokenize every character in JavaScript, so they're about 3× slower than `JSON.parse`.

Most of a streaming parser's work is wasted when all you want is the elements of one top-level array. To find where an element ends you only need to track strings, escapes and bracket depth. The element's bytes can then go to V8's native `JSON.parse`, which is far faster than any JavaScript tokenizer and checks everything inside the element. This library does exactly that, and checks the array structure between elements itself, so broken input still throws.

## Where it fits

| | Good at | Not so good at |
|---|---|---|
| **fast-json-array-reader** | Large top-level arrays of objects: fastest streaming option measured, low memory, strict, exact `JSON.parse` values | Only top-level arrays. No paths into nested data, no partial values while a huge element is still arriving |
| [`JSON.parse`](https://developer.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse) | Fastest when the file fits comfortably in memory | Holds the whole text and result at once; fails outright near 512MB |
| [stream-json](https://www.npmjs.com/package/stream-json) | Any JSON shape: filters, picks, paths, SAX-style tokens, huge single values. Maintained and strict | ~3× slower on arrays of objects, more memory; ESM-only since 3.x |
| [@streamparser/json](https://www.npmjs.com/package/@streamparser/json) | Paths into any shape; works in browsers and Deno as well as Node | ~3× slower on arrays of objects; slow and memory-hungry on single huge values; accepts some broken input |
| [JSONStream](https://www.npmjs.com/package/JSONStream) | Familiar `parse('*')` API, path patterns | Last released in 2018; accepts most broken input; drops `null` elements and `__proto__` keys, gives big integers as strings |
| [@datastream/json](https://www.npmjs.com/package/@datastream/json) | Same approach as this library, nearly as fast; part of a web-streams pipeline framework | Errors are collected in a report, not thrown, and commas aren't checked; values over 16MB are rejected by default; a Transform only, and pulls in `@datastream/core` |
| [jsonarrayfs](https://www.npmjs.com/package/jsonarrayfs) | Same idea, plus appending to a JSON array file | Garbles multi-byte characters split across chunks; accepts missing commas, truncated input and data after `]`; several times slower |
| [@discoveryjs/json-ext](https://www.npmjs.com/package/@discoveryjs/json-ext) `parseChunked` | Parses a whole value from chunks without one giant string | Builds the whole result in memory; doesn't give array elements one by one |

**Use this library when** you read big JSON arrays (logs, exports, database dumps, API responses) whose elements are objects or arrays, and you want the speed of `JSON.parse` without its memory use.

**Use something else when:**
- The array is nested inside an object (`{"data":[…]}`), or you need paths or filters into the document: use stream-json or @streamparser/json.
- The top level isn't an array, or the input is newline-delimited JSON (NDJSON).
- A single element is hundreds of MB. Each element is held whole before it's parsed (as `JSON.parse` would), so peak memory is about one element's size.
- You need it in a browser. This library uses Node's `Buffer` and streams.

## Install

```bash
npm install fast-json-array-reader
```

## Usage

The three APIs share one core and give the same values.

### Async iterator: `splitJsonArray(source, options?)`

Takes any async (or sync) iterable of chunks: a Node `Readable`, a web `ReadableStream`, an async generator, an array of Buffers.

```js
import fs from 'node:fs';
import { splitJsonArray } from 'fast-json-array-reader';

for await (const row of splitJsonArray(fs.createReadStream('rows.json'))) {
	if (row.id === wanted) break; // stops reading and destroys the stream
}

const res = await fetch(url);
for await (const item of splitJsonArray(res.body)) { … }
```

### Transform stream: `new JsonArraySplitStream(options?)`

Bytes in, elements out (object mode), with backpressure.

```js
import { pipeline } from 'node:stream/promises';
import { JsonArraySplitStream } from 'fast-json-array-reader';

await pipeline(
	fs.createReadStream('rows.json'),
	new JsonArraySplitStream({ primitives: false }),
	async function* (rows) {
		for await (const row of rows) yield JSON.stringify(transform(row)) + '\n';
	},
	fs.createWriteStream('out.ndjson'),
);
```

An object-mode Node stream can't emit `null` (it means "end of stream"), so the stream's output depends on `primitives`:
- `primitives: true` (default): each element comes as `{ index, value }`, like stream-json's `{ key, value }`.
- `primitives: false`: the objects and arrays come as they are.

### Core: `createJsonArraySplitter(onItem, options?)`

Synchronous push/end, with no stream or promise overhead. The fastest option, especially for arrays of millions of tiny values.

```js
import { createJsonArraySplitter } from 'fast-json-array-reader';

const splitter = createJsonArraySplitter((value, index) => {
	rows.push(value);
	// return false to stop
});
socket.on('data', chunk => splitter.push(chunk)); // Buffer, Uint8Array or string
socket.on('end', () => splitter.end());           // throws unless the array was complete
splitter.stopped; // true once onItem returned false
```

`index` is the element's position in the array, counting skipped primitives.

CommonJS works the same way, on Node versions that can `require()` ES modules (20.19+, 22.12+):

```js
const { splitJsonArray } = require('fast-json-array-reader');
```

## Options

| Option | Default | |
|---|---|---|
| `primitives` | `true` | Emit numbers, strings, booleans and `null` elements as well as objects and arrays. With `false`, primitive elements are still checked, then skipped. |

## Errors

Every problem with the input throws a `JsonArraySplitError`:

```js
import { JsonArraySplitError } from 'fast-json-array-reader';

try { … }
catch (err) {
	if (err instanceof JsonArraySplitError) {
		err.message;      // "Invalid JSON in element 1 (byte 9) of JSON array: Expected …"
		err.offset;       // 9: byte position in the input
		err.elementIndex; // 1: the element the problem is in, when it is in one
		err.cause;        // the SyntaxError from JSON.parse, for invalid elements
	}
}
```

Other messages look like `Expected ',' or ']' after element 0 but found '{' at byte 9 of JSON array` or `Unexpected end of JSON array (after 2 element(s)) at byte 1043`.

- Elements before the error have already been given to you, as with any streaming parser.
- After an error the splitter is unusable: `push()` and `end()` re-throw the same error.
- An error thrown by your `onItem` callback is re-thrown as it is, not wrapped, and also sticks.
- The iterator rejects its `for await` loop, and the stream passes the error to `pipeline`'s callback.

## How strict it is

It accepts exactly what `JSON.parse` accepts for a top-level array, and gives the same values, with one exception: a single leading UTF-8 byte order mark is allowed (stream-json and @streamparser/json allow it too).

Measured with [`bench/strictness.mjs`](bench/strictness.mjs), feeding each input one byte per chunk:

<!-- STRICTNESS -->

## Benchmarks

<!-- BENCHMARKS -->

## How it works

- It scans raw bytes. Inside an element it only tracks three things: whether it's in a string, whether the last byte was a backslash, and bracket depth. That's enough to find where each top-level element ends. The element's bytes then go to `JSON.parse`, which checks everything inside it.
- Between elements it checks the array structure itself: an optional BOM, whitespace, one `[`, a `,` between elements, `]`, then only whitespace. Empty input, input cut off anywhere, missing, doubled, leading or trailing commas, junk, a second array, and a top-level object or string all throw.
- UTF-8 is safe without decoding first: multi-byte sequences only use bytes ≥ 0x80, so they can never be mistaken for the ASCII bytes it looks for. An element split across chunks is joined as bytes before it's decoded.
- An element that spans chunks is kept as a list of copied pieces and joined once when it ends, so a huge element costs linear time, and the rest of each chunk can be freed.
- `true`, `false`, `null` and strings without escapes skip `JSON.parse`, which makes arrays of tiny values several times faster. Everything else goes to `JSON.parse`.

## Tests

`npm test` runs the suite with [Vitest](https://vitest.dev). It checks the splitter against `JSON.parse` and against stream-json: every chunk size from 1 byte up, input cut off at every byte, a list of malformed arrays, and hundreds of seeded random arrays full of awkward strings (quotes, backslashes, brackets, multi-byte and lone-surrogate characters).

## License

MIT
