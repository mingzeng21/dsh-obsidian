/** A value that can be represented losslessly as JSON. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
