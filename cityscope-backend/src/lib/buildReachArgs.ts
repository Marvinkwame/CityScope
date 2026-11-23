import path from 'node:path';

export type BuildMethod = 'network' | 'estimate';

export interface BuildOptions {
  cityId: string;
  ghslDir: string;
  dryRun: boolean;
  method: BuildMethod;
}

/** Reads reach:build's arguments; null when they are malformed. */
export function parseBuildArgs(argv: readonly string[], defaultGhslDir: string): BuildOptions | null {
  let cityId: string | null = null;
  let ghslDir = defaultGhslDir;
  let dryRun = false;
  let method: BuildMethod = 'network';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--ghsl') {
      const value = argv[++i];
      if (value === undefined) return null;
      ghslDir = path.resolve(value);
    } else if (arg === '--method') {
      const value = argv[++i];
      if (value !== 'network' && value !== 'estimate') return null;
      method = value;
    } else if (arg.startsWith('--') || cityId !== null) {
      return null;
    } else {
      cityId = arg;
    }
  }

  return cityId === null ? null : { cityId, ghslDir, dryRun, method };
}
