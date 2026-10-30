/** Route segment for an institution id. A colon is illegal in a Windows build path. */
export function bankParam(id: string): string {
  return id.replaceAll(':', '_');
}

/** Inverse of bankParam. Institution ids have one colon (`fdic:123`, `ncua:456`). */
export function bankIdFromParam(param: string): string {
  const split = param.indexOf('_');
  if (split === -1) return param;
  return `${param.slice(0, split)}:${param.slice(split + 1)}`;
}

export const bankPath = (id: string): string => `/banks/${bankParam(id)}`;
