import { Transform, type TransformCallback } from 'node:stream';
import { createJsonArraySplitter, type JsonArraySplitter, type SplitterOptions } from './splitter.js';

export interface IndexedValue<T = any> {
	index: number;
	value: T;
}

/**
 * Bytes in, elements out (object mode).
 * An object-mode stream can't emit null, so with `primitives` on (the default) each element comes as
 * `{ index, value }`. With `primitives: false` the objects and arrays come as they are.
 */
export class JsonArraySplitStream extends Transform {
	readonly #splitter: JsonArraySplitter;

	constructor(options: SplitterOptions = {}) {
		super({ readableObjectMode: true, writableObjectMode: false });
		const wrap = options.primitives !== false;
		this.#splitter = createJsonArraySplitter((value, index) => { this.push(wrap ? { index, value } : value); }, options);
	}

	override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
		try {
			this.#splitter.push(chunk);
		}
		catch (err) {
			return callback(err as Error);
		}
		callback();
	}

	override _flush(callback: TransformCallback): void {
		try {
			this.#splitter.end();
		}
		catch (err) {
			return callback(err as Error);
		}
		callback();
	}
}
