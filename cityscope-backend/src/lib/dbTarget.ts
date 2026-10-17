// Guard for scripts that write to a database. They name the target they are
// about to change, so a run against production is never a silent accident.

export function requireDbTarget(env: NodeJS.ProcessEnv = process.env): string {
  const target = env.CITYSCOPE_DB_TARGET?.trim();
  if (!target) {
    throw new Error('Set CITYSCOPE_DB_TARGET (e.g. reach-dev, production) before writing to a database');
  }
  return target;
}

// Host only: the user and password in a connection string are never printed.
export function describeDatabase(url: string | undefined): string {
  if (!url) {
    return '(no DATABASE_URL)';
  }
  try {
    return new URL(url).host;
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}

export function announceTarget(): string {
  const target = requireDbTarget();
  const line = `Writing to ${target} (${describeDatabase(process.env.DATABASE_URL)})`;
  console.log(line);
  return line;
}
