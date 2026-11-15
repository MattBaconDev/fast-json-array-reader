// Streams a JSON array ("[{...},{...}]"), parsing each top-level element with JSON.parse on its own.
//
// How it works:
// - Inside an element, it only tracks strings, escapes and bracket depth to find where the element ends.
//   The element's bytes then go to JSON.parse, which checks everything inside it.
// - Between elements, it checks the array structure itself: one '[' at the start, a ',' between
//   elements, a ']' at the end and nothing after it but whitespace. A file cut off anywhere, empty,
//   or with anything extra throws, as JSON.parse of the whole file would.
// - It only looks at ASCII structural bytes. UTF-8 multibyte sequences are all bytes >= 0x80, so they
//   can't be mistaken for them, and an element split across chunks is joined as bytes before decoding.
//
// Differences from JSON.parse of the whole file:
// - With `primitives: false`, only object and array elements are emitted. Primitive elements are checked, then skipped.
// - A leading UTF-8 byte order mark is allowed.

import { JsonArraySplitError } from './errors.js';

const QUOTE = 0x22, BACKSLASH = 0x5c, COMMA = 0x2c;
const OPEN_OBJ = 0x7b, CLOSE_OBJ = 0x7d, OPEN_ARR = 0x5b, CLOSE_ARR = 0x5d;
const BOM = [0xef, 0xbb, 0xbf];

// Where we are in the top-level array, outside any element
const START = 0, FIRST_ELEMENT_OR_END = 1, ELEMENT = 2, COMMA_OR_END = 3, DONE = 4;
// The kind of top-level element being read
const NONE = 0, CONTAINER = 1, STRING = 2, BARE = 3;

const isWhitespace = (b: number) => b === 0x20 || b === 0x0a || b === 0x0d || b === 0x09;
// First byte of a number, true, false or null
const isBareStart = (b: number) => (b >= 0x30 && b <= 0x39) || b === 0x2d || b === 0x74 || b === 0x66 || b === 0x6e;
// Any byte of a number, true, false or null (JSON.parse checks the exact form)
const isBareByte = (b: number) => (b >= 0x30 && b <= 0x39) || (b >= 0x61 && b <= 0x7a) || b === 0x2d || b === 0x2b || b === 0x2e || b === 0x45;

// Fast paths for primitive elements, which would otherwise cost a JSON.parse call each.
// Anything they don't recognise goes to JSON.parse, which gives the error.
function parseBare(bytes: Buffer, start: number, end: number): unknown {
	const length = end - start;
	const first = bytes[start];
	if (length === 4 && first === 0x6e && bytes[start + 1] === 0x75 && bytes[start + 2] === 0x6c && bytes[start + 3] === 0x6c) return null;
	if (length === 4 && first === 0x74 && bytes[start + 1] === 0x72 && bytes[start + 2] === 0x75 && bytes[start + 3] === 0x65) return true;
	if (length === 5 && first === 0x66 && bytes[start + 1] === 0x61 && bytes[start + 2] === 0x6c && bytes[start + 3] === 0x73 && bytes[start + 4] === 0x65) return false;
	// Bare elements are all ASCII
	return JSON.parse(bytes.toString('latin1', start, end));
}

function parseString(bytes: Buffer, start: number, end: number): unknown {
	for (let i = start + 1; i < end - 1; i++) {
		// Escapes need decoding, and raw control characters must be rejected as JSON.parse does
		if (bytes[i]! < 0x20 || bytes[i] === BACKSLASH) return JSON.parse(bytes.toString('utf8', start, end));
	}
	return bytes.toString('utf8', start + 1, end - 1);
}

const describe = (b: number) => (b >= 0x21 && b <= 0x7e ? `'${String.fromCharCode(b)}'` : `byte 0x${b.toString(16).padStart(2, '0')}`);

/** @param index the element's position in the array, counting skipped primitives */
export type OnItem<T = any> = (value: T, index: number) => boolean | void;

export interface SplitterOptions {
	/** Emit numbers, strings, booleans and null as well as objects and arrays. Default true */
	primitives?: boolean;
}

export interface JsonArraySplitter {
	/** @returns false once onItem has asked to stop */
	push(chunk: Uint8Array | string): boolean;
	/** Throws a JsonArraySplitError unless the array was complete (or onItem asked to stop) */
	end(): void;
	readonly stopped: boolean;
}

/**
 * @param onItem called with each element; return false to stop
 */
export function createJsonArraySplitter<T = any>(onItem: OnItem<T>, { primitives = true }: SplitterOptions = {}): JsonArraySplitter {
	let state = START;
	let kind = NONE;
	let depth = 0; // 1 = inside the top-level array, 2+ = inside a container element
	let inString = false;
	let escaped = false;
	let stopped = false;
	/** once set, the splitter is unusable */
	let failure: unknown = null;
	let offset = 0; // bytes in earlier chunks
	let bomLength = 0;
	let index = 0; // index of the next element in the array
	let elementOffset = 0; // byte offset of the current element
	/** bytes of the current element from earlier chunks */
	let parts: Buffer[] = [];

	function fail(message: string, at: number, elementIndex?: number): never {
		throw new JsonArraySplitError(`${message} at byte ${at} of JSON array`, at, elementIndex);
	}

	/** Parses the element ending at `end` (exclusive) in `chunk`. @returns false to stop */
	function endElement(chunk: Buffer, start: number, end: number): boolean {
		if (parts.length) {
			// Joined once here, not per chunk, so a huge element costs linear time
			chunk = Buffer.concat([...parts, chunk.subarray(start, end)]);
			start = 0;
			end = chunk.length;
			parts = [];
		}
		const elementIndex = index++;
		const elementKind = kind;
		kind = NONE;
		state = COMMA_OR_END;
		let value;
		try {
			value = elementKind === BARE ? parseBare(chunk, start, end)
				: elementKind === STRING ? parseString(chunk, start, end)
				: JSON.parse(chunk.toString('utf8', start, end));
		}
		catch (err) {
			throw new JsonArraySplitError(`Invalid JSON in element ${elementIndex} (byte ${elementOffset}) of JSON array: ${(err as Error).message}`, elementOffset, elementIndex, { cause: err });
		}
		if (elementKind !== CONTAINER && !primitives) return true;
		return onItem(value, elementIndex) !== false;
	}

	return {
		get stopped() {
			return stopped;
		},
		push(input) {
			if (failure) throw failure;
			if (stopped) return false;
			const chunk = typeof input === 'string' ? Buffer.from(input)
				: Buffer.isBuffer(input) ? input
				: Buffer.from(input.buffer, input.byteOffset, input.byteLength);
			let start = kind === NONE ? -1 : 0; // start of the current element within this chunk
			try {
				for (let i = 0; i < chunk.length; i++) {
					if (inString) {
						if (escaped) {
							escaped = false;
							continue;
						}
						// Jump to the next quote natively rather than looking at each byte of the string.
						// It's escaped if an odd number of backslashes come just before it.
						const quote = chunk.indexOf(QUOTE, i);
						const stop = quote === -1 ? chunk.length : quote;
						let backslashes = 0;
						while (stop - backslashes > i && chunk[stop - backslashes - 1] === BACKSLASH) backslashes++;
						if (quote === -1) {
							escaped = backslashes % 2 === 1;
							break;
						}
						i = quote;
						if (backslashes % 2 === 1) continue;
						inString = false;
						if (kind === STRING) {
							if (!endElement(chunk, start, i + 1)) return (stopped = true, false);
							start = -1;
						}
						continue;
					}
					const b = chunk[i]!;
					if (depth > 1) {
						// Inside a container element: JSON.parse checks its contents, we only find its end
						if (b === QUOTE) inString = true;
						else if (b === OPEN_OBJ || b === OPEN_ARR) depth++;
						else if (b === CLOSE_OBJ || b === CLOSE_ARR) {
							if (--depth === 1) {
								if (!endElement(chunk, start, i + 1)) return (stopped = true, false);
								start = -1;
							}
						}
						continue;
					}
					if (kind === BARE) {
						if (isBareByte(b)) continue;
						// This byte ends the number/true/false/null; it's then handled as structure below
						if (!endElement(chunk, start, i)) return (stopped = true, false);
						start = -1;
					}
					if (isWhitespace(b)) continue;
					switch (state) {
						case START:
							if (b === OPEN_ARR) {
								depth = 1;
								state = FIRST_ELEMENT_OR_END;
							}
							else if (offset + i === bomLength && bomLength < BOM.length && b === BOM[bomLength]) bomLength++;
							else fail(`Expected '[' but found ${describe(b)}`, offset + i);
							break;
						case FIRST_ELEMENT_OR_END:
							if (b === CLOSE_ARR) {
								depth = 0;
								state = DONE;
								break;
							}
						// falls through
						case ELEMENT:
							start = i;
							elementOffset = offset + i;
							if (b === OPEN_OBJ || b === OPEN_ARR) {
								kind = CONTAINER;
								depth = 2;
							}
							else if (b === QUOTE) {
								kind = STRING;
								inString = true;
							}
							else if (isBareStart(b)) kind = BARE;
							else fail(`Expected an array element but found ${describe(b)}`, offset + i, index);
							break;
						case COMMA_OR_END:
							if (b === COMMA) state = ELEMENT;
							else if (b === CLOSE_ARR) {
								depth = 0;
								state = DONE;
							}
							else fail(`Expected ',' or ']' after element ${index - 1} but found ${describe(b)}`, offset + i);
							break;
						default:
							fail(`Unexpected ${describe(b)} after the end of the array`, offset + i);
					}
				}
				// Copy rather than keep a view, so the rest of the chunk can be freed
				if (kind !== NONE) parts.push(Buffer.from(chunk.subarray(start)));
				offset += chunk.length;
				return true;
			}
			catch (err) {
				// Includes errors thrown by onItem: the position in this chunk is lost, so no more input is accepted
				failure = err;
				throw err;
			}
		},
		end() {
			if (failure) throw failure;
			if (stopped || state === DONE) return;
			failure = new JsonArraySplitError(`Unexpected end of JSON array (${state === START ? "no '[' found" : `after ${index} element(s)`}) at byte ${offset}`, offset, kind === NONE ? undefined : index);
			throw failure;
		}
	};
}
