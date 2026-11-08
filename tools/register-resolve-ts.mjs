// Node's type strip does not resolve extensionless relative imports (`./db`).
// The ingest CLIs use that specifier style. Register the hook before the entry loads.
import { register } from 'node:module';

await register(new globalThis.URL('./resolve-ts.mjs', import.meta.url));
