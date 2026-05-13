export function isGroupJid(jid?: string | null): boolean {
  if (!jid) return false;
  return jid.includes('@g.us');
}

export function safeMessageId(msg: any): string {
  return (
    msg?.key?.id ??
    msg?.id ??
    msg?.messageId ??
    `${msg?.messageTimestamp ?? Date.now()}`
  );
}