import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  ClientSecretPost,
  Configuration,
  randomState,
  refreshTokenGrant,
} from "openid-client";
import { AppError } from "../util/errors";
import type { StoredToken } from "./token-store";

export const WHOOP_AUTHORIZATION_URL = "https://api.prod.whoop.com/oauth/oauth2/auth";
export const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";
export const WHOOP_SCOPES = [
  "offline",
  "read:recovery",
  "read:cycles",
  "read:workout",
  "read:sleep",
  "read:profile",
  "read:body_measurement",
].join(" ");

export interface OAuthClient {
  config: Configuration;
}

function mapTokenResponse(tokenResponse: Record<string, unknown>): StoredToken {
  const accessToken = tokenResponse.access_token;
  if (typeof accessToken !== "string" || accessToken.length < 1) {
    throw new AppError("Authorization response did not include access_token.", "AUTH");
  }

  const expiresIn = typeof tokenResponse.expires_in === "number" ? tokenResponse.expires_in : undefined;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : undefined;

  return {
    access_token: accessToken,
    token_type: typeof tokenResponse.token_type === "string" ? tokenResponse.token_type : "Bearer",
    refresh_token: typeof tokenResponse.refresh_token === "string" ? tokenResponse.refresh_token : undefined,
    scope: typeof tokenResponse.scope === "string" ? tokenResponse.scope : undefined,
    expires_in: expiresIn,
    expires_at: expiresAt,
  };
}

function extractStatus(error: unknown): number | undefined {
  const candidate = error as Record<string, unknown>;

  if (typeof candidate.status === "number") {
    return candidate.status;
  }

  const response = candidate.response as Record<string, unknown> | undefined;
  if (response && typeof response.status === "number") {
    return response.status;
  }

  const cause = candidate.cause as Record<string, unknown> | undefined;
  if (cause && typeof cause.status === "number") {
    return cause.status;
  }

  return undefined;
}

function classifyOAuthError(error: unknown): AppError {
  const status = extractStatus(error);
  const text = error instanceof Error ? error.message.toLowerCase() : "";

  if (status === 401 || status === 403) {
    return new AppError("Whoop authentication failed.", "AUTH", { status, cause: error });
  }

  if (status === 400 && (text.includes("invalid_grant") || text.includes("invalid_client") || text.includes("invalid_token"))) {
    return new AppError("Whoop credentials or refresh token are invalid.", "AUTH", { status, cause: error });
  }

  if (status === 429 || (typeof status === "number" && status >= 500)) {
    return new AppError("Token endpoint temporarily unavailable.", "RETRYABLE", {
      retryable: true,
      status,
      cause: error,
    });
  }

  if (error instanceof Error && (text.includes("fetch") || text.includes("network") || text.includes("timeout"))) {
    return new AppError("Network error while contacting token endpoint.", "RETRYABLE", {
      retryable: true,
      cause: error,
    });
  }

  return new AppError("OAuth request failed.", "FATAL", { status, cause: error });
}

export function createOAuthClient(clientId: string, clientSecret: string): OAuthClient {
  const config = new Configuration(
    {
      issuer: "https://api.prod.whoop.com",
      authorization_endpoint: WHOOP_AUTHORIZATION_URL,
      token_endpoint: WHOOP_TOKEN_URL,
    },
    clientId,
    { client_secret: clientSecret },
    ClientSecretPost(clientSecret),
  );

  return { config };
}

export function createAuthorizationUrl(client: OAuthClient, redirectUri: string): { url: URL; state: string } {
  const state = randomState();
  const url = buildAuthorizationUrl(client.config, {
    redirect_uri: redirectUri,
    scope: WHOOP_SCOPES,
    state,
  });

  return { url, state };
}

export async function exchangeAuthorizationCode(params: {
  client: OAuthClient;
  callbackUrl: URL;
  expectedState: string;
  redirectUri: string;
}): Promise<StoredToken> {
  try {
    const tokenResponse = await authorizationCodeGrant(
      params.client.config,
      params.callbackUrl,
      {
        expectedState: params.expectedState,
      },
      {
        redirect_uri: params.redirectUri,
      },
    );

    return mapTokenResponse(tokenResponse as unknown as Record<string, unknown>);
  } catch (error) {
    throw classifyOAuthError(error);
  }
}

export async function refreshAccessToken(params: {
  client: OAuthClient;
  refreshToken: string;
}): Promise<StoredToken> {
  try {
    const tokenResponse = await refreshTokenGrant(params.client.config, params.refreshToken, {
      scope: WHOOP_SCOPES,
    });

    return mapTokenResponse(tokenResponse as unknown as Record<string, unknown>);
  } catch (error) {
    throw classifyOAuthError(error);
  }
}
