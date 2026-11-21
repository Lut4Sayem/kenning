export interface Config {
  port: number
  secret: string
  /** The app's own origin; a WebSocket from any other page is refused (cross-site WebSocket hijacking). */
  appOrigin: string
  springUrl: string
}

export function loadConfig(env: Record<string, string | undefined>): Config {
  const secret = env.COLLAB_SECRET ?? ''
  const appOrigin = env.APP_ORIGIN ?? ''
  if (!secret) throw new Error('COLLAB_SECRET is not set')
  if (!appOrigin) throw new Error('APP_ORIGIN is not set')
  return {
    port: Number(env.PORT ?? 1234),
    secret,
    appOrigin,
    springUrl: env.SPRING_INTERNAL_URL ?? 'http://localhost:8080',
  }
}
