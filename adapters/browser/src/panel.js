// ---------------------------------------------------------------------------
// The popup. What this tab's page hid from you, and what Tracer decided.
// ---------------------------------------------------------------------------

const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

const $ = (id) => document.getElementById(id);
let xrayOn = false;

async function refresh() {
  const session = await chrome.runtime.sendMessage({ type: 'tracer:session', tabId: tab.id });

  $('spans').textContent = session.spans.length;
  const concealed = session.concealed.filter((s) => s.instructionLike);
  $('concealed').textContent = concealed.length;
  $('concealed').classList.toggle('hot', concealed.length > 0);

  const list = $('concealed-list');
  list.replaceChildren();
  if (!concealed.length) {
    list.append(el('div', 'empty', 'Nothing on this page was concealed from you.'));
  }
  for (const span of concealed.slice(0, 8)) {
    const node = el('div', 'span', (span.decoded || span.text || '').slice(0, 220));
    node.title = 'Show me where this is';
    node.addEventListener('click', () => {
      chrome.tabs.sendMessage(tab.id, { type: 'tracer:focus-span', localId: span.local || span.id });
      window.close();
    });
    list.append(node);
  }

  const log = $('log');
  log.replaceChildren();
  if (!session.log.length) {
    log.append(el('div', 'empty', 'No tool calls proposed yet.'));
  }
  for (const entry of session.log.slice(0, 10)) {
    const item = el('div', 'item');
    item.append(el('div', 'verdict ' + entry.decision, entry.decision));
    item.append(el('div', 'tool', entry.name));
    if (entry.explain && entry.explain[0]) item.append(el('div', 'why', entry.explain[0]));
    log.append(item);
  }
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

$('xray').addEventListener('click', async () => {
  xrayOn = !xrayOn;
  $('xray').setAttribute('aria-pressed', String(xrayOn));
  $('xray').textContent = xrayOn ? 'hide it again' : 'show me what the agent read';
  await chrome.tabs.sendMessage(tab.id, { type: 'tracer:xray', on: xrayOn });
});

await refresh();
