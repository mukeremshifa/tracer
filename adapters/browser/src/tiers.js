// ---------------------------------------------------------------------------
// Default tier configuration for the browser adapter.
//
// A browser agent's tools are whatever its author gave it, so this is a
// starting point keyed on the names that keep recurring, plus globs for the
// shapes. Unmatched tools land on tier 2: a tool nobody classified still runs,
// and is still policed.
// ---------------------------------------------------------------------------

export const DEFAULT_TIERS = {
  // --- tier 0: reads untrusted content, changes nothing --------------------
  'browser.read_page': 0,
  'browser.navigate': 0,
  'browser.screenshot': 0,
  'browser.extract': 0,
  read_page: 0,
  search: 0,
  'search.*': 0,
  'fetch.*': 0,

  // --- tier 1: touches the user's private data -----------------------------
  read_email: 1,
  read_file: 1,
  'mail.read': 1,
  'mail.search': 1,
  'calendar.list': 1,
  'clipboard.read': 1,
  'browser.cookies': 1,
  'storage.read': 1,

  // --- tier 2: can move information out of the user's control --------------
  send_email: { tier: 2, destination: 'to', destinationKind: 'recipient address' },
  http_post: { tier: 2, destination: 'url', destinationKind: 'request host' },
  'mail.send': { tier: 2, destination: 'to', destinationKind: 'recipient address' },
  'browser.submit_form': { tier: 2, destination: 'action', destinationKind: 'form action' },
  'browser.navigate_with_data': { tier: 2, destination: 'url', destinationKind: 'request host' },
  'clipboard.write': { tier: 2, destination: null },
  'http.*': { tier: 2, destination: 'url', destinationKind: 'request host' },
};
