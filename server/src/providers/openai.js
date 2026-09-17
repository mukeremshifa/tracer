// OpenAI Chat Completions with native tool calling, temperature 0.
import { toolsForProvider, TOOL_NAMES } from '../registry.js';
import { planPrompt } from '../prompts.js';

const TIMEOUT_MS = 60_000;

async function post(body, cfg) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(cfg.baseUrl.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer ' + cfg.apiKey,
      },
      body: JSON.stringify({ model: cfg.model, temperature: 0, ...body }),
      signal: ctl.signal,
    });
    const text = await res.text();
    if (!res.ok) throw new Error('OpenAI ' + res.status + ': ' + text.slice(0, 400));
    return JSON.parse(text);
  } finally {
    clearTimeout(timer);
  }
}

function toOpenAiMessages(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      return { role: 'tool', tool_call_id: m.toolCallId, content: m.content };
    }
    if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length) {
      return {
        role: 'assistant',
        content: m.content || null,
        tool_calls: m.toolCalls.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.arguments || {}) },
        })),
      };
    }
    return { role: m.role, content: m.content || '' };
  });
}

export function createOpenAiProvider(env) {
  const cfg = {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL || 'gpt-4.1',
    baseUrl: env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  };
  if (!cfg.apiKey) throw new Error('MODEL_PROVIDER=openai but OPENAI_API_KEY is not set');

  return {
    id: 'openai',
    label: 'OpenAI ' + cfg.model,
    live: true,
    disclosure: 'Live OpenAI Chat Completions with native tool calling, temperature 0.',

    async plan({ goal, system }) {
      const data = await post(
        {
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: planPrompt(goal, TOOL_NAMES) },
          ],
          response_format: { type: 'json_object' },
        },
        cfg,
      );
      const raw = data.choices?.[0]?.message?.content || '{}';
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

    async step({ messages }) {
      const data = await post(
        {
          messages: toOpenAiMessages(messages),
          tools: toolsForProvider('openai'),
          tool_choice: 'auto',
        },
        cfg,
      );
      const msg = data.choices?.[0]?.message || {};
      const toolCalls = (msg.tool_calls || []).map((c) => {
        let args = {};
        try {
          args = JSON.parse(c.function.arguments || '{}');
        } catch {
          args = { _unparsed: c.function.arguments };
        }
        return { id: c.id, name: c.function.name, arguments: args };
      });
      return { text: msg.content || '', toolCalls, usage: data.usage || null };
    },
  };
}
