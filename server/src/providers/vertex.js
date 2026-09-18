// Google Gemini with function calling, temperature 0.
//
// Two auth routes, because teams have whichever one they have:
//   - GEMINI_API_KEY        -> the Generative Language endpoint (simplest)
//   - Application Default   -> Vertex AI on your own GCP project
//                             (`gcloud auth application-default login`)
import { toolsForProvider, TOOL_NAMES } from '../registry.js';
import { planPrompt } from '../prompts.js';

const TIMEOUT_MS = 60_000;

async function accessToken() {
  const { GoogleAuth } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: 'https://www.googleapis.com/auth/cloud-platform' });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  return typeof token === 'string' ? token : token.token;
}

function toContents(messages) {
  const contents = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              name: m.name,
              response: { content: m.content },
            },
          },
        ],
      });
      continue;
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      contents.push({
        role: 'model',
        parts: m.toolCalls.map((c) => ({
          functionCall: { name: c.name, args: c.arguments || {} },
        })),
      });
      continue;
    }
    contents.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content || '' }] });
  }
  return contents;
}

export function createVertexProvider(env) {
  const model = env.VERTEX_MODEL || 'gemini-2.5-pro';
  const apiKey = env.GEMINI_API_KEY;
  const project = env.GOOGLE_CLOUD_PROJECT;
  const location = env.GOOGLE_CLOUD_LOCATION || 'us-central1';

  if (!apiKey && !project) {
    throw new Error(
      'MODEL_PROVIDER=vertex needs either GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT (with application-default credentials)',
    );
  }

  async function generate(body) {
    let url;
    const headers = { 'content-type': 'application/json' };

    if (apiKey) {
      url =
        'https://generativelanguage.googleapis.com/v1beta/models/' +
        model +
        ':generateContent?key=' +
        encodeURIComponent(apiKey);
    } else {
      url =
        'https://' +
        location +
        '-aiplatform.googleapis.com/v1/projects/' +
        project +
        '/locations/' +
        location +
        '/publishers/google/models/' +
        model +
        ':generateContent';
      headers.authorization = 'Bearer ' + (await accessToken());
    }

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ generationConfig: { temperature: 0 }, ...body }),
        signal: ctl.signal,
      });
      const text = await res.text();
      if (!res.ok) throw new Error('Gemini ' + res.status + ': ' + text.slice(0, 400));
      return JSON.parse(text);
    } finally {
      clearTimeout(timer);
    }
  }

  function parts(data) {
    return data.candidates?.[0]?.content?.parts || [];
  }

  return {
    id: 'vertex',
    model,
    label: 'Google ' + model + (apiKey ? ' (API key)' : ' (Vertex AI)'),
    live: true,
    disclosure: 'Live Gemini function calling, temperature 0.',

    async plan({ goal, system, tools }) {
      const data = await generate({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: 'user', parts: [{ text: planPrompt(goal, tools || TOOL_NAMES) }] }],
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      });
      const raw = parts(data).map((p) => p.text || '').join('');
      let parsed = {};
      try {
        parsed = JSON.parse(raw);
      } catch {
        parsed = {};
      }
      return {
        steps: Array.isArray(parsed.steps) ? parsed.steps : [],
        rationale: parsed.rationale || '',
        raw,
      };
    },

    async step({ messages, system, registry }) {
      const data = await generate({
        systemInstruction: { parts: [{ text: system }] },
        contents: toContents(messages),
        tools: registry ? registry.declarations('vertex') : toolsForProvider('vertex'),
      });
      const ps = parts(data);
      const toolCalls = ps
        .filter((p) => p.functionCall)
        .map((p, i) => ({
          id: 'g' + Date.now() + '-' + i,
          name: p.functionCall.name,
          arguments: p.functionCall.args || {},
        }));
      return {
        text: ps.map((p) => p.text || '').join(''),
        toolCalls,
        usage: data.usageMetadata || null,
      };
    },
  };
}
