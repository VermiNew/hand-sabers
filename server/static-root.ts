import { existsSync } from 'node:fs';
import path from 'node:path';

export function requireFrontendDist(projectRoot: string): string {
  const frontendDistDir = path.join(projectRoot, 'dist');
  if (!existsSync(path.join(frontendDistDir, 'index.html'))) {
    throw new Error('Brak zbudowanego frontendu w katalogu dist. Uruchom najpierw `npm run build`.');
  }
  return frontendDistDir;
}
