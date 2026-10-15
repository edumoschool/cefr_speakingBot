// node --import ./dev/register.mjs …  → `import … from 'sdk'` works locally.
import { register } from 'node:module';
register('./hooks.mjs', import.meta.url);
