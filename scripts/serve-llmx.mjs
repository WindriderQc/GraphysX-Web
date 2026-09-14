import path from 'node:path';
import { isIP } from 'node:net';
import { startStaticServer } from './static-server.mjs';
import { createLlmXRoute } from './llmx-server.mjs';
import { createGraphysXAgentRoute } from './graphysx-agent-relay.mjs';

const host = process.env.LLMX_HOST ?? '127.0.0.1';
if (isIP(host) !== 4 || !/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) throw new Error('LLMX_HOST must be a loopback or private LAN IPv4 address');
const agentRoute = createGraphysXAgentRoute(), llmxRoute = createLlmXRoute();
const { url } = await startStaticServer({ root: path.resolve(process.argv[2] ?? 'dist'),
  port: Number(process.env.PORT ?? 4207), host, routeRequest: (request, response) => agentRoute(request, response) || llmxRoute(request, response) });
console.log(`LLMx: ${url}?app=llmx`);
