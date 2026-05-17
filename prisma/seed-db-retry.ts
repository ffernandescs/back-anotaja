/** Retry para quedas temporárias de conexão PostgreSQL durante o seed longo. */

export function isDbConnectionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  return (
    /connection error/i.test(message) ||
    /not queryable/i.test(message) ||
    /ECONNRESET/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /Connection terminated/i.test(message) ||
    /timeout/i.test(message)
  );
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 5,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isDbConnectionError(error) || attempt === maxAttempts) {
        throw error;
      }
      const waitMs = 2000 * attempt;
      console.warn(
        `⚠️ Conexão DB (${label}) — tentativa ${attempt}/${maxAttempts}: ${error instanceof Error ? error.message : error}. Aguardando ${waitMs}ms...`,
      );
      await sleep(waitMs);
    }
  }

  throw lastError;
}
