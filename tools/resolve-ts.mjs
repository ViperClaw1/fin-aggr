// Node loads the fixture sources as TypeScript, but those files import each other without a
// .ts suffix. This hook adds it. Registered from tools/build-docs.mjs before importing @fa/fixtures.
const TYPED = /\.(ts|js|mjs|cjs|json|node)$/;

export async function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith('.') || TYPED.test(specifier)) return nextResolve(specifier, context);
  try {
    return await nextResolve(`${specifier}.ts`, context);
  } catch {
    return nextResolve(`${specifier}/index.ts`, context);
  }
}
