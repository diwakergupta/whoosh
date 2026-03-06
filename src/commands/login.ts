import { createInterface } from "node:readline/promises";
import { normalizeRedirectPath, parseAuthorizationCallbackUrl, validateAuthorizationCallback } from "../auth/callback";
import { createAuthorizationUrl, createOAuthClient, exchangeAuthorizationCode, type OAuthClient } from "../auth/oauth";
import { serializeTokenToml, type StoredToken, writeTokenFile } from "../auth/token-store";
import { resolveConfig, requireWhoopClientCredentials } from "../config/config";
import { AppError } from "../util/errors";
import { openBrowser } from "../util/browser";
import { htmlResponse } from "../util/http";
import { createLogger, type Logger } from "../util/logger";
import indexTemplate from "../web/index.html" with { type: "text" };
import redirectTemplate from "../web/redirect.html" with { type: "text" };
import errorTemplate from "../web/error.html" with { type: "text" };

const INDEX_TEMPLATE = String(indexTemplate);
const REDIRECT_TEMPLATE = String(redirectTemplate);
const ERROR_TEMPLATE = String(errorTemplate);

export interface LoginCliOptions {
  configPath?: string;
  credentialsFile?: string;
  debug?: string;
  noAutoOpen?: boolean;
  manual?: boolean;
  port?: string;
  redirectPath?: string;
}

function requestIdFrom(request: Request): string {
  const header = request.headers.get("x-request-id")?.trim();
  return header ? header : crypto.randomUUID();
}

function renderTemplate(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, Bun.escapeHTML(value));
  }
  return result;
}

async function exchangeAndPersistToken(params: {
  oauthClient: OAuthClient;
  callbackUrl: URL;
  expectedState: string;
  redirectUri: string;
  credentialsFile: string;
}): Promise<StoredToken> {
  const token = await exchangeAuthorizationCode({
    client: params.oauthClient,
    callbackUrl: params.callbackUrl,
    expectedState: params.expectedState,
    redirectUri: params.redirectUri,
  });

  await writeTokenFile(params.credentialsFile, token);
  return token;
}

async function promptForRedirectUrl(): Promise<string> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    return await rl.question("Paste the full redirect URL: ");
  } finally {
    rl.close();
  }
}

async function runManualLoginFlow(params: {
  logger: Logger;
  oauthClient: OAuthClient;
  authUrl: URL;
  expectedState: string;
  redirectPath: string;
  redirectUri: string;
  credentialsFile: string;
  noAutoOpen: boolean;
}): Promise<void> {
  const authUrlText = params.authUrl.toString();

  params.logger.info("Manual OAuth mode enabled.");
  params.logger.info("Open this URL in a browser on your local machine:");
  process.stdout.write(`${authUrlText}\n`);

  if (!params.noAutoOpen) {
    try {
      openBrowser(authUrlText);
    } catch (error) {
      params.logger.warn("Unable to auto-open browser.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    params.logger.info("Auto-open disabled. Copy the URL above into your browser.");
  }

  params.logger.info("After authentication, your browser may show a 404 or connection error. This is expected.");
  const callbackInput = await promptForRedirectUrl();
  const callbackUrl = parseAuthorizationCallbackUrl(callbackInput);
  validateAuthorizationCallback({
    callbackUrl,
    expectedState: params.expectedState,
    expectedPath: params.redirectPath,
  });

  await exchangeAndPersistToken({
    oauthClient: params.oauthClient,
    callbackUrl,
    expectedState: params.expectedState,
    redirectUri: params.redirectUri,
    credentialsFile: params.credentialsFile,
  });

  params.logger.info("Login complete", {
    credentialsFile: params.credentialsFile,
  });
}

async function runLocalServerLoginFlow(params: {
  logger: Logger;
  oauthClient: OAuthClient;
  authUrl: URL;
  expectedState: string;
  redirectPath: string;
  redirectUri: string;
  credentialsFile: string;
  baseUrl: string;
  port: number;
  noAutoOpen: boolean;
}): Promise<void> {
  let resolveDone: (() => void) | undefined;
  let rejectDone: ((error: unknown) => void) | undefined;
  let settled = false;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const uncaughtHandler = (error: unknown): void => {
    params.logger.error("Login server uncaught exception", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!settled) {
      settled = true;
      rejectDone?.(error);
    }
    setTimeout(() => server.stop(true), 250);
  };

  const unhandledRejectionHandler = (error: unknown): void => {
    params.logger.error("Login server unhandled rejection", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!settled) {
      settled = true;
      rejectDone?.(error);
    }
    setTimeout(() => server.stop(true), 250);
  };

  process.once("uncaughtException", uncaughtHandler);
  process.once("unhandledRejection", unhandledRejectionHandler);

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: params.port,
    fetch: async (request) => {
      const reqId = requestIdFrom(request);
      const started = Date.now();
      const url = new URL(request.url);
      const requestLogger = params.logger.child({
        reqId,
        method: request.method,
        path: url.pathname,
      });

      requestLogger.info("HTTP request started");

      try {
        if (url.pathname === "/") {
          const response = htmlResponse(renderTemplate(INDEX_TEMPLATE, { AUTH_URL: params.authUrl.toString() }));
          requestLogger.info("HTTP request completed", { statusCode: response.status, durationMs: Date.now() - started });
          return response;
        }

        if (url.pathname === params.redirectPath) {
          try {
            validateAuthorizationCallback({
              callbackUrl: url,
              expectedState: params.expectedState,
              expectedPath: params.redirectPath,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const body = renderTemplate(ERROR_TEMPLATE, {
              STATUS_CODE: "400",
              ERROR_MESSAGE: message,
            });
            const response = htmlResponse(body, 400);
            requestLogger.warn("OAuth callback validation failed", {
              statusCode: response.status,
              durationMs: Date.now() - started,
              error: message,
            });
            return response;
          }

          try {
            const token = await exchangeAndPersistToken({
              oauthClient: params.oauthClient,
              callbackUrl: url,
              expectedState: params.expectedState,
              redirectUri: params.redirectUri,
              credentialsFile: params.credentialsFile,
            });

            const body = renderTemplate(REDIRECT_TEMPLATE, {
              CREDENTIALS_FILE: params.credentialsFile,
              TOKEN_BODY: serializeTokenToml(token),
            });

            if (!settled) {
              settled = true;
              resolveDone?.();
              setTimeout(() => server.stop(true), 250);
            }

            const response = htmlResponse(body, 200);
            requestLogger.info("HTTP request completed", { statusCode: response.status, durationMs: Date.now() - started });
            return response;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const body = renderTemplate(ERROR_TEMPLATE, {
              STATUS_CODE: "500",
              ERROR_MESSAGE: message,
            });

            if (!settled) {
              settled = true;
              rejectDone?.(error);
              setTimeout(() => server.stop(true), 250);
            }

            const response = htmlResponse(body, 500);
            requestLogger.error("OAuth token exchange failed", {
              statusCode: response.status,
              durationMs: Date.now() - started,
              error: message,
            });
            return response;
          }
        }

        const response = new Response("Not Found", { status: 404 });
        requestLogger.info("HTTP request completed", { statusCode: response.status, durationMs: Date.now() - started });
        return response;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        requestLogger.error("HTTP request crashed", {
          statusCode: 500,
          durationMs: Date.now() - started,
          error: message,
        });
        return htmlResponse(renderTemplate(ERROR_TEMPLATE, {
          STATUS_CODE: "500",
          ERROR_MESSAGE: "Internal server error",
        }), 500);
      }
    },
  });

  params.logger.info("Login server started", {
    url: params.baseUrl,
    redirectUri: params.redirectUri,
    credentialsFile: params.credentialsFile,
  });

  if (!params.noAutoOpen) {
    try {
      openBrowser(params.baseUrl);
    } catch (error) {
      params.logger.warn("Unable to auto-open browser.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    params.logger.info(`Open ${params.baseUrl} in your browser to authenticate.`);
  }

  try {
    await done;
  } finally {
    process.removeListener("uncaughtException", uncaughtHandler);
    process.removeListener("unhandledRejection", unhandledRejectionHandler);
  }
}

export async function runLoginCommand(cli: LoginCliOptions): Promise<void> {
  const config = await resolveConfig({
    command: "login",
    cli: {
      configPath: cli.configPath,
      credentialsFile: cli.credentialsFile,
      debug: cli.debug,
    },
  });

  const logger = createLogger(config.debug);
  const { clientId, clientSecret } = requireWhoopClientCredentials(config);

  const port = cli.port ? Number.parseInt(cli.port, 10) : 8080;
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    throw new AppError("--port must be between 1 and 65535.", "VALIDATION");
  }

  const redirectPath = normalizeRedirectPath(cli.redirectPath);
  const baseUrl = `http://localhost:${port}`;
  const redirectUri = `${baseUrl}${redirectPath}`;

  const oauthClient = createOAuthClient(clientId, clientSecret);
  const { url: authUrl, state } = createAuthorizationUrl(oauthClient, redirectUri);

  if (cli.manual) {
    await runManualLoginFlow({
      logger,
      oauthClient,
      authUrl,
      expectedState: state,
      redirectPath,
      redirectUri,
      credentialsFile: config.credentialsFile,
      noAutoOpen: cli.noAutoOpen ?? false,
    });
    return;
  }

  await runLocalServerLoginFlow({
    logger,
    oauthClient,
    authUrl,
    expectedState: state,
    redirectPath,
    redirectUri,
    credentialsFile: config.credentialsFile,
    baseUrl,
    port,
    noAutoOpen: cli.noAutoOpen ?? false,
  });
}
