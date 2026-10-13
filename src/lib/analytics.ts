// Optional usage statistics are disabled. Re-enabling requires a separate
// consent/retention implementation, not just a build-time flag.
export async function logEvent(_name: string, _properties: Record<string, unknown> = {}) {
  return;
}
