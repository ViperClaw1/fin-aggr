/** Postgres `bigint` arrives as a string. Identity values fit in a safe integer. */
export function integerId(value: unknown): number {
  const text =
    typeof value === 'number' && Number.isInteger(value) && value >= 0 ? String(value) : value;
  if (typeof text !== 'string' || !/^(0|[1-9][0-9]{0,14})$/.test(text)) {
    throw new Error('database id is not an integer');
  }
  let id = 0;
  for (const char of text) id = id * 10 + (char.charCodeAt(0) - 48);
  return id;
}
