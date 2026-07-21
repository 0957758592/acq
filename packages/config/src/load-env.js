import { existsSync } from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

let loadedPath = '';

function findRootEnv(startDirectory) {
  let current = path.resolve(startDirectory || process.cwd());
  while (true) {
    const candidate = path.join(current, '.env');
    if (existsSync(candidate)) return candidate;

    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return path.resolve(startDirectory || process.cwd(), '../../.env');
}

export function loadRootEnv({ cwd = process.cwd(), override = false } = {}) {
  if (loadedPath && !override) return loadedPath;

  const envPath = findRootEnv(cwd);
  dotenv.config({ path: envPath, override });
  loadedPath = envPath;
  return envPath;
}
