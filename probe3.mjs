import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const t = new StdioClientTransport({ command: process.execPath, args:['adapters/mcp/bin/tracer-proxy.mjs','--config','demo/tiers.json'], stderr:'ignore' });
const c = new Client({ name:'p', version:'1'},{capabilities:{}});
await c.connect(t);
const l = await c.listTools();
const tool = l.tools.find(x=>x.name==='filesystem.read_text_file');
console.log('republished outputSchema:', JSON.stringify(tool.outputSchema));
try {
  const r = await c.callTool({name:'filesystem.read_text_file', arguments:{path:'D:/tracer/demo/workspace/notes.md'}});
  console.log('ok keys', Object.keys(r), JSON.stringify(r.structuredContent).slice(0,120));
} catch(e){ console.log('ERR', e.message); }
try {
  const r2 = await c.request({method:'tools/call', params:{name:'filesystem.read_text_file', arguments:{path:'D:/tracer/demo/workspace/notes.md'}}}, (await import('@modelcontextprotocol/sdk/types.js')).CallToolResultSchema);
  console.log('raw keys', Object.keys(r2));
  console.log('raw structuredContent:', JSON.stringify(r2.structuredContent).slice(0,300));
} catch(e){ console.log('RAW ERR', e.message); }
process.exit(0);
