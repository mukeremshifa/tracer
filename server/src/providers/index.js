import { createSimulatedProvider } from './simulated.js';

const cache = new Map();

/**
 * Providers are swappable because the defence never looks inside the model.
 * If a provider fails to construct (missing key, bad project), we fall back to
 * the simulated one and say so loudly rather than failing the request -- a
 * broken key must never take the public link down mid-demo.
 */
export async function getProvider(requested, env = process.env) {
  const id = (requested || env.MODEL_PROVIDER || 'simulated').toLowerCase();
  if (cache.has(id)) return cache.get(id);

  let provider;
  try {
    if (id === 'openai') {
      const { createOpenAiProvider } = await import('./openai.js');
      provider = createOpenAiProvider(env);
    } else if (id === 'vertex' || id === 'gemini' || id === 'google') {
      const { createVertexProvider } = await import('./vertex.js');
      provider = createVertexProvider(env);
    } else {
      provider = createSimulatedProvider();
    }
  } catch (err) {
    provider = createSimulatedProvider();
    provider.fallbackFrom = id;
    provider.fallbackReason = String(err && err.message ? err.message : err);
  }

  cache.set(id, provider);
  return provider;
}

export function availableProviders(env = process.env) {
  return [
    { id: 'simulated', label: 'Simulated model (deterministic)', ready: true },
    { id: 'openai', label: 'OpenAI ' + (env.OPENAI_MODEL || 'gpt-4.1'), ready: !!env.OPENAI_API_KEY },
    {
      id: 'vertex',
      label: 'Google ' + (env.VERTEX_MODEL || 'gemini-2.5-pro'),
      ready: !!(env.GEMINI_API_KEY || env.GOOGLE_CLOUD_PROJECT),
    },
  ];
}
