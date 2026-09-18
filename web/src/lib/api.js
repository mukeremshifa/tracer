async function call(path, options) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error('Unexpected response from ' + path + ': ' + text.slice(0, 200));
  }
  if (!res.ok) throw new Error(data.error || res.status + ' from ' + path);
  return data;
}

export const api = {
  meta: () => call('/api/meta'),
  integration: () => call('/api/integration'),
  runPair: (body) => call('/api/run-pair', { method: 'POST', body: JSON.stringify(body) }),
  run: (body) => call('/api/run', { method: 'POST', body: JSON.stringify(body) }),
  transcripts: () => call('/api/transcripts'),
  transcript: (id) => call('/api/transcripts/' + id),
  demoTranscript: () => call('/api/demo-transcript'),
  scorecard: () => call('/api/scorecard'),
  proxyEvidence: () => call('/api/proxy-evidence'),
  arenaPage: (body) => call('/api/arena/page', { method: 'POST', body: JSON.stringify(body) }),
  arenaAttempt: (body) => call('/api/arena/attempt', { method: 'POST', body: JSON.stringify(body) }),
  scoreboard: () => call('/api/arena/scoreboard'),
};
