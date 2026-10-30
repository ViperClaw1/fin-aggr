/**
 * Route segment for an institution id. A colon is illegal in a Windows build path.
 * `_` in the id is escaped as `__`, then each `:` becomes a single `_`, so the two directions
 * are inverses for every id (`fdic:5821` stays `fdic_5821`; a suffix underscore does not look like
 * another colon).
 */
export function bankParam(id: string): string {
  return id.replaceAll('_', '__').replaceAll(':', '_');
}

/** Inverse of bankParam. A single `_` is a colon; `__` is an underscore that was in the id. */
export function bankIdFromParam(param: string): string {
  let out = '';
  for (let i = 0; i < param.length; i += 1) {
    if (param.startsWith('__', i)) {
      out += '_';
      i += 1;
    } else {
      out += param.charAt(i) === '_' ? ':' : param.charAt(i);
    }
  }
  return out;
}

export const bankPath = (id: string): string => `/banks/${bankParam(id)}`;
