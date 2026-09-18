// Google Gemini with function calling, temperature 0.
//
// Two auth routes, because teams have whichever one they have:
//   - GEMINI_API_KEY        -> the Generative Language endpoint (simplest)
//   - Application Default   -> Vertex AI on your own GCP project
//                             (`gcloud auth application-default login`)
import { toolsForProvider, TOOL_NAMES } from '../registry.js';
import { planPrompt } from '../prompts.js';

// Gemini 2.5 Pro spends thinking tokens before it answers, and a contended
// quota adds queueing on top. 60s was tight enough that a slow step aborted
// mid-eval and read as a failed run.
const TIMEOUT_MS = 180_000;
const RETRIES = 5;
const BACKOFF_MS = 2_000;

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
      // Gemini requires a model turn carrying N functionCall parts to be
      // answered by ONE user turn carrying N functionResponse parts. Emitting a
      // turn per tool result is a 400 the moment the model batches two calls,
      // so consecutive tool messages coalesce into the turn already open.
      const open = contents[contents.length - 1];
      const part = {
        functionResponse: {
          name: m.name,
          response: { content: m.content },
        },
      };
      if (open && open.role === 'user' && open.parts.every((p) => p.functionResponse)) {
        open.parts.push(part);
      } else {
        contents.push({ role: 'user', parts: [part] });
      }
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

    // A 429 is the expected steady state on a default Vertex quota, not an
    // exceptional one: the eval fires dozens of runs back to back. Without a
    // retry the call throws, the loop catches it into an empty plan, and the
    // scorecard records NOT ATTEMPTED -- an exhausted quota reading as a clean
    // sheet. Backing off is what keeps a live column honest.
    let attempt = 0;
    for (;;) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      let res;
      let text;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ generationConfig: { temperature: 0 }, ...body }),
          signal: ctl.signal,
        });
        text = await res.text();
      } finally {
        clearTimeout(timer);
      }

      if (res.ok) return JSON.parse(text);

      const retryable = res.status === 429 || res.status === 503;
      if (!retryable || attempt >= RETRIES) {
        throw new Error('Gemini ' + res.status + ': ' + text.slice(0, 400));
      }
      // 2s, 4s, 8s, 16s, 32s -- plus jitter, so parallel callers do not
      // resynchronise onto the same retry instant.
      const wait = BACKOFF_MS * 2 ** attempt + Math.floor(Math.random() * 500);
      await new Promise((r) => setTimeout(r, wait));
      attempt += 1;
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
