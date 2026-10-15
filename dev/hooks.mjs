// Node module hooks: resolve the platform's `sdk` imports to the local stand-ins.
const map = { sdk: new URL('./sdk/index.js', import.meta.url).href, 'sdk/db': new URL('./sdk/db.js', import.meta.url).href };
export async function resolve(specifier, context, next) {
  if (map[specifier]) return { url: map[specifier], shortCircuit: true };
  return next(specifier, context);
}
