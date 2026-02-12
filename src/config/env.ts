import type { EnvConfig } from "./types";

export function readEnv(env: NodeJS.ProcessEnv = process.env): EnvConfig {
  return {
    whoopClientId: env.WHOOP_CLIENT_ID,
    whoopClientSecret: env.WHOOP_CLIENT_SECRET,
    credentialsFile: env.WHOOP_CREDENTIALS_FILE,
  };
}
