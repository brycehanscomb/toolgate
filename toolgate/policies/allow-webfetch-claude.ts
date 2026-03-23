import { allow, next, type ToolCall } from "../../src";

/**
 * Allow WebFetch requests to *.claude.com URLs.
 */
export default async function allowWebFetchClaude(call: ToolCall) {
  if (call.tool !== "WebFetch") {
    return next();
  }

  const url = call.args.url;
  if (typeof url !== "string") {
    return next();
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname === "claude.com" || parsed.hostname.endsWith(".claude.com")) {
      return allow();
    }
  } catch {
    // invalid URL, pass through
  }

  return next();
}
