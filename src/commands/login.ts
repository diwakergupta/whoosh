import { createAuthorizationUrl, createOAuthClient, exchangeAuthorizationCode } from "../auth/oauth";
import { serializeTokenToml, writeTokenFile } from "../auth/token-store";
import { resolveConfig, requireWhoopClientCredentials } from "../config/config";
import { AppError } from "../util/errors";
import { openBrowser } from "../util/browser";
import { htmlResponse } from "../util/http";
import { createLogger } from "../util/logger";
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
  port?: string;
  redirectPath?: string;
}

function renderTemplate(template: string, replacements: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(`{{${key}}}`, Bun.escapeHTML(value));
  }
  return result;
}

function normalizeRedirectPath(value: string | undefined): string {
  const pathValue = value && value.length > 0 ? value : "/redirect";
  if (pathValue.startsWith("/")) {
    return pathValue;
  }
  return `/${pathValue}`;
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
  let resolveDone: (() => void) | undefined;
  let rejectDone: ((error: unknown) => void) | undefined;
  let settled = false;

  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  const server = Bun.serve({
    hostname: "127.0.0.1",
    port,
    fetch: async (request) => {
      const url = new URL(request.url);

      if (url.pathname === "/") {
        return htmlResponse(renderTemplate(INDEX_TEMPLATE, { AUTH_URL: authUrl.toString() }));
      }

      if (url.pathname === redirectPath) {
        const callbackState = url.searchParams.get("state");
        if (!callbackState || callbackState !== state) {
          const body = renderTemplate(ERROR_TEMPLATE, {
            STATUS_CODE: "400",
            ERROR_MESSAGE: "State validation failed. Please retry login.",
          });
          return htmlResponse(body, 400);
        }

        const code = url.searchParams.get("code");
        if (!code) {
          const body = renderTemplate(ERROR_TEMPLATE, {
            STATUS_CODE: "400",
            ERROR_MESSAGE: "Missing authorization code from Whoop callback.",
          });
          return htmlResponse(body, 400);
        }

        try {
          const token = await exchangeAuthorizationCode({
            client: oauthClient,
            callbackUrl: url,
            expectedState: state,
            redirectUri,
          });

          await writeTokenFile(config.credentialsFile, token);

          const body = renderTemplate(REDIRECT_TEMPLATE, {
            CREDENTIALS_FILE: config.credentialsFile,
            TOKEN_BODY: serializeTokenToml(token),
          });

          if (!settled) {
            settled = true;
            resolveDone?.();
            setTimeout(() => server.stop(true), 250);
          }

          return htmlResponse(body, 200);
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

          return htmlResponse(body, 500);
        }
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  logger.info("Login server started", {
    url: baseUrl,
    redirectUri,
    credentialsFile: config.credentialsFile,
  });

  if (!cli.noAutoOpen) {
    try {
      openBrowser(baseUrl);
    } catch (error) {
      logger.warn("Unable to auto-open browser.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    logger.info(`Open ${baseUrl} in your browser to authenticate.`);
  }

  await done;
}
