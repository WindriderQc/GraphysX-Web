import { mergeConfig } from 'vite';
import worldEmbed from './vite.diskx.config';

// Reuse the existing single-file world packaging (CSS included, no editor or
// webfonts). This build never embeds a LAN address or a browser credential.
export default mergeConfig(worldEmbed, {
  define: {
    'import.meta.env.VITE_LLMX_AGENTX_ORIGIN': JSON.stringify(''),
    'import.meta.env.VITE_LLMX_CORE_HOSTED': JSON.stringify('1'),
  },
  build: { lib: { entry: 'src/llmx-core-entry.ts', fileName: () => 'llmx-room.js' } },
});
