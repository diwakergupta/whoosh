import { AppError } from "../util/errors";

export function normalizeRedirectPath(value: string | undefined): string {
  const pathValue = value && value.length > 0 ? value : "/redirect";
  if (pathValue.startsWith("/")) {
    return pathValue;
  }
  return `/${pathValue}`;
}

export function parseAuthorizationCallbackUrl(value: string): URL {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new AppError("Redirect URL cannot be empty.", "VALIDATION");
  }

  try {
    return new URL(trimmed);
  } catch (error) {
    throw new AppError("Redirect URL is invalid. Paste the full URL shown in your browser.", "VALIDATION", {
      cause: error,
    });
  }
}

export function validateAuthorizationCallback(params: {
  callbackUrl: URL;
  expectedState: string;
  expectedPath: string;
}): void {
  if (params.callbackUrl.pathname !== params.expectedPath) {
    throw new AppError(`Callback URL path mismatch. Expected ${params.expectedPath}.`, "VALIDATION");
  }

  const callbackState = params.callbackUrl.searchParams.get("state");
  if (!callbackState || callbackState !== params.expectedState) {
    throw new AppError("State validation failed. Please retry login.", "AUTH");
  }

  const code = params.callbackUrl.searchParams.get("code");
  if (!code) {
    throw new AppError("Missing authorization code from Whoop callback.", "AUTH");
  }
}
