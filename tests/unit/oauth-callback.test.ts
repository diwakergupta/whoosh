import { describe, expect, it } from "bun:test";
import {
  normalizeRedirectPath,
  parseAuthorizationCallbackUrl,
  validateAuthorizationCallback,
} from "../../src/auth/callback";

describe("oauth callback helpers", () => {
  it("normalizes redirect path", () => {
    expect(normalizeRedirectPath(undefined)).toBe("/redirect");
    expect(normalizeRedirectPath("redirect")).toBe("/redirect");
    expect(normalizeRedirectPath("/custom")).toBe("/custom");
  });

  it("parses callback url text", () => {
    const callbackUrl = parseAuthorizationCallbackUrl("https://example.com/redirect?code=abc&state=xyz");
    expect(callbackUrl.pathname).toBe("/redirect");
    expect(callbackUrl.searchParams.get("code")).toBe("abc");
  });

  it("rejects invalid callback url text", () => {
    expect(() => parseAuthorizationCallbackUrl("not a url")).toThrow(
      "Redirect URL is invalid. Paste the full URL shown in your browser.",
    );
  });

  it("validates callback path, state, and code", () => {
    const callbackUrl = new URL("https://example.com/redirect?code=abc&state=expected");
    expect(() =>
      validateAuthorizationCallback({
        callbackUrl,
        expectedState: "expected",
        expectedPath: "/redirect",
      }),
    ).not.toThrow();
  });

  it("rejects callbacks with mismatched path", () => {
    const callbackUrl = new URL("https://example.com/wrong?code=abc&state=expected");
    expect(() =>
      validateAuthorizationCallback({
        callbackUrl,
        expectedState: "expected",
        expectedPath: "/redirect",
      }),
    ).toThrow("Callback URL path mismatch. Expected /redirect.");
  });

  it("rejects callbacks with bad state", () => {
    const callbackUrl = new URL("https://example.com/redirect?code=abc&state=wrong");
    expect(() =>
      validateAuthorizationCallback({
        callbackUrl,
        expectedState: "expected",
        expectedPath: "/redirect",
      }),
    ).toThrow("State validation failed. Please retry login.");
  });

  it("rejects callbacks without authorization code", () => {
    const callbackUrl = new URL("https://example.com/redirect?state=expected");
    expect(() =>
      validateAuthorizationCallback({
        callbackUrl,
        expectedState: "expected",
        expectedPath: "/redirect",
      }),
    ).toThrow("Missing authorization code from Whoop callback.");
  });
});
