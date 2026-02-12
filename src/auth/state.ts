import { randomState } from "openid-client";

export function generateOAuthState(): string {
  return randomState();
}
