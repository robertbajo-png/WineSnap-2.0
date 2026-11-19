export function publicWineSharingAllowed(origin: string | null, ownedBackend: boolean) {
  if (!origin || ownedBackend) return false;
  try {
    const url = new URL(origin);
    return (
      url.origin === origin &&
      url.protocol === "https:" &&
      /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(url.hostname) &&
      !/\.(?:invalid|test|local|localhost)$/.test(url.hostname)
    );
  } catch {
    return false;
  }
}
