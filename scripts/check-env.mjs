// Friendly post-install note. Never fails the install.
import { existsSync } from 'node:fs';
const provider = process.env.MODEL_PROVIDER || 'simulated';
if (!existsSync(new URL('../.env', import.meta.url))) {
  console.log('\n  Tracer: no .env found. Running with the deterministic simulated model provider.');
  console.log('  Copy .env.example to .env to enable a live provider (openai | vertex).\n');
} else {
  console.log('\n  Tracer: .env present. MODEL_PROVIDER=' + provider + '\n');
}
