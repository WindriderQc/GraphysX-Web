import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

/** Exercise the installed stdio transport as a real MCP client, without invoking a model. */
export function startGraphysXMcpClient(url) {
  const processHandle = spawn(process.execPath, [fileURLToPath(new URL('../../tools/graphysx-mcp.mjs', import.meta.url))], {
    env: { ...process.env, GRAPHYSX_URL: url }, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const pending = new Map(); let sequence = 0, stderr = '';
  processHandle.stderr.on('data', bytes => { stderr += bytes.toString(); });
  createInterface({ input: processHandle.stdout }).on('line', line => {
    try {
      const response = JSON.parse(line), entry = pending.get(response.id);
      if (!entry) return;
      pending.delete(response.id); clearTimeout(entry.timer);
      if (response.error) entry.reject(new Error(JSON.stringify(response.error))); else entry.resolve(response.result);
    } catch (error) { for (const entry of pending.values()) entry.reject(error); }
  });
  processHandle.on('exit', code => {
    for (const entry of pending.values()) { clearTimeout(entry.timer); entry.reject(new Error(`MCP exited ${code}: ${stderr}`)); }
    pending.clear();
  });
  function request(method, params = {}) {
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`MCP request timed out: ${method}`)); }, 30_000);
      pending.set(id, { resolve, reject, timer });
      processHandle.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }
  return {
    request,
    async initialize() {
      const result = await request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'graphysx-verifier', version: '1.0.0' } });
      processHandle.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return result;
    },
    call: (name, args = {}) => request('tools/call', { name, arguments: args }),
    close() { processHandle.stdin.end(); processHandle.kill(); },
  };
}
