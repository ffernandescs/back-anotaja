import type { Request } from 'express';

/**
 * Host do tenant (domínio white-label) a partir dos headers da requisição.
 */
export function getRequestHost(req: Request): string | undefined {
  const tenantHost = req.headers['x-tenant-host'];
  if (typeof tenantHost === 'string' && tenantHost.trim()) {
    return tenantHost.trim().toLowerCase().split(':')[0];
  }

  const forwarded = req.headers['x-forwarded-host'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim().toLowerCase().split(':')[0];
  }

  const host = req.headers.host;
  if (typeof host === 'string' && host.trim()) {
    return host.trim().toLowerCase().split(':')[0];
  }

  return undefined;
}
