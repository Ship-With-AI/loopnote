import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import renameMap from './rename-map.json' with { type: 'json' };

import {
  assertCanonicalTokenSet,
  canonicalRootCss,
  parseTokenRoot,
} from './css-token-contract.mjs';

const VIRTUAL_ID = `virtual:${renameMap.slug}-tokens`;
const RESOLVED_ID = `\0${VIRTUAL_ID}`;

export function tokenRootPlugin(repositoryRoot) {
  return {
    name: `${renameMap.slug}-token-root`,
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    configureServer(server) {
      const sourcePath = resolve(repositoryRoot, 'src/web/styles.css');
      server.watcher.add(sourcePath);
      server.watcher.on('change', (file) => {
        if (file !== sourcePath) return;
        for (const environment of Object.values(server.environments)) {
          const module = environment.moduleGraph.getModuleById(RESOLVED_ID);
          if (module !== undefined) environment.moduleGraph.invalidateModule(module);
        }
      });
    },
    load(id) {
      if (id !== RESOLVED_ID) {
        return undefined;
      }

      const sourcePath = resolve(repositoryRoot, 'src/web/styles.css');
      this.addWatchFile(sourcePath);
      const root = canonicalRootCss(readFileSync(sourcePath, 'utf8'), 'src/web/styles.css');
      assertCanonicalTokenSet(parseTokenRoot(root));

      return `export const TOKEN_ROOT_CSS = ${JSON.stringify(root)};\n`;
    },
  };
}
