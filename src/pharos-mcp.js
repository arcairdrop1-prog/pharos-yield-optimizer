import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ENGINE_VERSION, MCP_ALLOWLIST, MCP_URL } from "./constants.js";

function parse(result, name) {
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${name} returned no text.`);
  const value = JSON.parse(text);
  if (result.isError || value.error) throw new Error(value.error?.message || `${name} failed.`);
  return value;
}

async function retry(fn, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i += 1) try { return await fn(); } catch (error) {
    last = error;
    if (i === attempts || !/timeout|fetch|network|429|502|503|reset|session/i.test(error.message)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 250 * i));
  }
  throw last;
}

export async function withPharosMcp(operation, options = {}) {
  const client = new Client({ name: "pharos-yield-optimizer", version: ENGINE_VERSION });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), { fetch: options.fetch || ((input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(25000) })) });
  await retry(() => client.connect(transport));
  try {
    const listed = (await client.listTools()).tools.map((tool) => tool.name);
    const missing = MCP_ALLOWLIST.filter((name) => !listed.includes(name));
    if (missing.length) throw new Error(`Official MCP missing: ${missing.join(", ")}`);
    const call = (name, args = {}) => {
      if (!MCP_ALLOWLIST.includes(name)) throw new Error(`Tool ${name} is not permitted in recommendation mode.`);
      return retry(async () => parse(await client.callTool({ name, arguments: args }), name));
    };
    return await operation({ call, tools: MCP_ALLOWLIST.filter((name) => listed.includes(name)) });
  } finally {
    try { await transport.terminateSession(); } catch {}
    await client.close();
  }
}
