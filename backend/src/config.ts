export interface AppConfig {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  corsOrigin: string;
  bcryptRounds: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';

  const jwtSecret = env.JWT_SECRET;
  if (!jwtSecret) {
    if (nodeEnv === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL must be set');
  }

  return {
    nodeEnv,
    port: Number(env.PORT ?? 4000),
    databaseUrl: env.DATABASE_URL,
    jwtSecret: jwtSecret ?? 'dev-only-change-me',
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '12h',
    corsOrigin: env.CORS_ORIGIN ?? 'http://localhost:5173',
    bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 10),
  };
}
