// Resolve HERE API key from profile-specific vars first, then legacy fallback.
// EXPO_PUBLIC_* keys are public in the client bundle, so this is for separation
// and key-rotation hygiene, not for storing secrets.

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

export function getHereApiKey(): string {
  const env = process.env;
  const preferred = __DEV__
    ? clean(env.EXPO_PUBLIC_HERE_API_KEY_DEV)
    : clean(env.EXPO_PUBLIC_HERE_API_KEY_PROD);

  if (preferred) return preferred;
  return clean(env.EXPO_PUBLIC_HERE_API_KEY);
}
