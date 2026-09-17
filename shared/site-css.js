// The fake publication's stylesheet. Shared by the static range and the Arena
// so a visitor-submitted page is visually indistinguishable from a range page.

export const SITE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: #ffffff; color: #1b1a17;
    font: 16px/1.62 Georgia, 'Iowan Old Style', 'Times New Roman', serif;
    -webkit-font-smoothing: antialiased;
  }
  .masthead {
    border-bottom: 2px solid #1b1a17; padding: 14px 28px 10px;
    display: flex; align-items: baseline; gap: 16px; flex-wrap: wrap;
  }
  .masthead .wordmark {
    font: 700 21px/1 'Iowan Old Style', Georgia, serif; letter-spacing: .14em;
    text-transform: uppercase;
  }
  .masthead nav { font: 11px/1 -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em;
    text-transform: uppercase; color: #6b6558; display: flex; gap: 14px; }
  main { max-width: 44rem; margin: 0 auto; padding: 30px 28px 72px; position: relative; }
  .kicker { font: 600 11px/1 -apple-system, 'Segoe UI', system-ui, sans-serif;
    letter-spacing: .16em; text-transform: uppercase; color: #9a3412; margin: 0 0 10px; }
  h1 { font: 700 34px/1.18 'Iowan Old Style', Georgia, serif; margin: 0 0 12px; letter-spacing: -.01em; }
  .dek { font: 400 19px/1.5 Georgia, serif; color: #504a3f; margin: 0 0 18px; }
  .byline { font: 11px/1 -apple-system, 'Segoe UI', system-ui, sans-serif; letter-spacing: .1em;
    text-transform: uppercase; color: #6b6558; border-top: 1px solid #e2ded3;
    border-bottom: 1px solid #e2ded3; padding: 10px 0; margin: 0 0 24px; }
  p { margin: 0 0 17px; }
  h3 { font: 700 15px/1.3 -apple-system, 'Segoe UI', system-ui, sans-serif; margin: 28px 0 10px; }
  pre { background: #f6f4ef; border: 1px solid #e2ded3; border-radius: 4px; padding: 14px;
    overflow-x: auto; font: 12.5px/1.6 ui-monospace, 'SF Mono', Menlo, Consolas, monospace; }
  code { font: inherit; }
  figure { margin: 24px 0; }
  img { max-width: 100%; height: auto; display: block; border-radius: 3px; }
  .ledger-caption { font: 12px/1.5 -apple-system, 'Segoe UI', system-ui, sans-serif; color: #6b6558; }
  .ledger-banner { border-left: 3px solid #b45309; background: #fffbf3; padding: 12px 14px;
    margin: 22px 0; font: 14px/1.55 -apple-system, 'Segoe UI', system-ui, sans-serif; }
  .ledger-editor-note { color: #504a3f; border-left: 2px solid #e2ded3; padding-left: 14px; }
  .ledger-reviews { border-top: 1px solid #e2ded3; margin-top: 30px; padding-top: 8px; }
  .review { border-bottom: 1px solid #efece4; padding: 12px 0;
    font: 14px/1.55 -apple-system, 'Segoe UI', system-ui, sans-serif; }
  .review .stars { color: #b45309; letter-spacing: .12em; }
  .review .who { color: #8a8371; font-size: 12px; margin: 4px 0 0; }
  .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  footer { border-top: 1px solid #e2ded3; margin-top: 40px; padding-top: 14px;
    font: 11px/1.6 -apple-system, 'Segoe UI', system-ui, sans-serif; color: #8a8371; }
`;
