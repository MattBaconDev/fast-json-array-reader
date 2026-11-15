import { createJsonArraySplitter, type SplitterOptions } from './splitter.js';

/**
 * Yields each element of the JSON array read from `source`.
 * Breaking out of the loop closes the source (a Node Readable is destroyed).
 */
export async function* splitJsonArray<T = any>(
	source: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>,
	options?: SplitterOptions,
): AsyncGenerator<T, void, undefined> {
	let values: T[] = [];
	const splitter = createJsonArraySplitter<T>(value => { values.push(value); }, options);
	const take = () => {
		const taken = values;
		values = [];
		return taken;
	};
	for await (const chunk of source) {
		try {
			splitter.push(chunk);
		}
		catch (err) {
			// Elements before the error are still given, as the core gives them to onItem
			yield* take();
			throw err;
		}
		yield* take();
	}
	splitter.end();
}
