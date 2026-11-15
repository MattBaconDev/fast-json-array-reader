export class JsonArraySplitError extends Error {
	/** Byte position in the input where the problem was found */
	readonly offset: number;
	/** Index of the element the problem is in, when it is in one */
	readonly elementIndex: number | undefined;

	constructor(message: string, offset: number, elementIndex?: number, options?: ErrorOptions) {
		super(message, options);
		this.name = 'JsonArraySplitError';
		this.offset = offset;
		this.elementIndex = elementIndex;
	}
}
