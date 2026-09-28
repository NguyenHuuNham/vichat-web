const isDevelopment = Boolean(import.meta.env?.DEV);

function redactText(value) {
  return String(value || '')
    .replace(/(?:authorization|cookie|set-cookie|password|token|secret|api[-_]?key|signature)(?:\s*[:=]\s*|\s+)[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/https?:\/\/[^\s)]+/gi, '[URL]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 400);
}

function safeDetails(value) {
  if (!value) return undefined;
  if (value instanceof Error) {
    return {
      name: String(value.name || 'Error').slice(0, 80),
      message: redactText(value.message),
      code: value.code ? redactText(value.code) : undefined,
      status: Number.isFinite(Number(value.status)) ? Number(value.status) : undefined,
    };
  }
  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object') return redactText(value);
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 12)
      .map(([key, item]) => [key, typeof item === 'string' ? redactText(item) : item])
      .filter(([, item]) => item !== undefined),
  );
}

function write(level, event, details) {
  if (!isDevelopment || typeof console === 'undefined') return;
  const method = console[level];
  if (typeof method !== 'function') return;
  method.call(console, `[ViChat] ${event}`, safeDetails(details));
}

export const clientLogger = Object.freeze({
  warn(event, details) {
    write('warn', event, details);
  },
  error(event, details) {
    write('error', event, details);
  },
});
