import { describe, expect, it, vi } from "vitest";
import { DEFAULT_MCP_SCOPES, MCP_SCOPES, McpInvalidParams, argDate, argUuid, handleMcp, handleMcpText, mayUseMcp, mcpToolSpecs, negotiateVersion, normalizeScopes, type McpServer, type McpTool, visibleTools } from "./mcp";
import type { PraWamRole } from "./roles";

type Who = { roles: PraWamRole[] };
const bod: Who = { roles: ["bod"] };
const peserta: Who = { roles: [] };

/** The real tool catalog, each answering with its own name (or failing on purpose). */
const tools: McpTool<Who>[] = mcpToolSpecs.map(spec => ({
  ...spec,
  run: async args => {
    if (args.boom) throw new Error("rahasia di dalam");
    if (args.bad) throw new McpInvalidParams("tanggal harus tanggal YYYY-MM-DD.");
    return { tool: spec.name };
  },
}));
const server = (overrides: Partial<McpServer<Who>> = {}): McpServer<Who> => ({ tools, scopes: [...MCP_SCOPES], context: bod, ...overrides });
const call = (id: number, method: string, params?: unknown) => ({ jsonrpc: "2.0", id, method, ...(params === undefined ? {} : { params }) });

describe("MCP scopes", () => {
  it("grant everything but personal profiles by default", () => {
    expect(DEFAULT_MCP_SCOPES).not.toContain("peserta");
    expect(DEFAULT_MCP_SCOPES).toHaveLength(MCP_SCOPES.length - 1);
  });
  it("keep known scopes once, in order", () => {
    expect(normalizeScopes(["survei", "x", "ringkasan", "survei"])).toEqual(["ringkasan", "survei"]);
  });
  it("give every tool a scope and its own name", () => {
    expect(new Set(mcpToolSpecs.map(tool => tool.name)).size).toBe(mcpToolSpecs.length);
    for (const tool of mcpToolSpecs) expect(MCP_SCOPES).toContain(tool.scope);
  });
});

describe("initialize", () => {
  it("echoes a version we speak and falls back to the newest", async () => {
    for (const version of ["2025-06-18", "2025-03-26", "2024-11-05"]) {
      const reply = await handleMcp(call(1, "initialize", { protocolVersion: version, capabilities: {}, clientInfo: { name: "t", version: "1" } }), server());
      expect(reply.status).toBe(200);
      expect((reply.body as { result: { protocolVersion: string } }).result.protocolVersion).toBe(version);
    }
    expect(negotiateVersion("2099-01-01")).toBe("2025-06-18");
    expect(negotiateVersion(undefined)).toBe("2025-06-18");
  });
  it("tells the client who we are and that we only have tools", async () => {
    const reply = await handleMcp(call(1, "initialize", {}), server());
    expect(reply.body).toMatchObject({
      jsonrpc: "2.0", id: 1,
      result: { capabilities: { tools: { listChanged: false } }, serverInfo: { name: "wam-werkudara", title: "WAM Werkudara", version: "1.0.0" } },
    });
    expect(typeof (reply.body as { result: { instructions: string } }).result.instructions).toBe("string");
  });
});

describe("tools/list", () => {
  const names = async (options: Partial<McpServer<Who>>) =>
    ((await handleMcp(call(2, "tools/list"), server(options))).body as { result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] } }).result.tools;

  it("lists only the tools the key's scopes allow", async () => {
    const listed = await names({ scopes: ["sesi", "booking"] });
    expect(listed.map(tool => tool.name)).toEqual(["daftar_sesi", "detail_sesi", "booking_ruang"]);
    expect(listed.every(tool => tool.annotations.readOnlyHint)).toBe(true);
  });
  it("leaves profiles out of the default grant", async () => {
    const listed = (await names({ scopes: DEFAULT_MCP_SCOPES })).map(tool => tool.name);
    expect(listed).not.toContain("daftar_peserta");
    expect(listed).not.toContain("profil_peserta");
    expect(listed).toContain("ringkasan");
  });
  it("also follows the app's roles: a peserta does not get the BOD-only tools", async () => {
    const listed = (await names({ context: peserta })).map(tool => tool.name);
    expect(listed).toEqual(visibleTools(mcpToolSpecs, MCP_SCOPES, peserta).map(tool => tool.name));
    expect(listed).toContain("daftar_sesi");
    expect(listed).not.toContain("ringkasan");
    expect(listed).not.toContain("hasil_survei");
  });
});

describe("tools/call", () => {
  it("answers with text and structured content, and logs the call", async () => {
    const onCall = vi.fn();
    const reply = await handleMcp(call(3, "tools/call", { name: "ringkasan", arguments: {} }), server({ onCall }));
    const result = (reply.body as { result: { content: { type: string; text: string }[]; structuredContent: unknown } }).result;
    expect(result.structuredContent).toEqual({ tool: "ringkasan" });
    expect(JSON.parse(result.content[0].text)).toEqual({ tool: "ringkasan" });
    expect(onCall).toHaveBeenCalledWith("ringkasan", {}, true);
  });
  it("refuses a tool outside the scopes as bad params", async () => {
    const reply = await handleMcp(call(4, "tools/call", { name: "profil_peserta", arguments: {} }), server({ scopes: DEFAULT_MCP_SCOPES }));
    expect((reply.body as { error: { code: number } }).error.code).toBe(-32602);
  });
  it("turns bad arguments into -32602 and a failure into isError without leaking its message", async () => {
    const onCall = vi.fn();
    const bad = await handleMcp(call(5, "tools/call", { name: "booking_ruang", arguments: { bad: true } }), server({ onCall }));
    expect((bad.body as { error: { code: number; message: string } }).error).toEqual({ code: -32602, message: "tanggal harus tanggal YYYY-MM-DD." });
    const boom = await handleMcp(call(6, "tools/call", { name: "booking_ruang", arguments: { boom: true } }), server({ onCall }));
    const result = (boom.body as { result: { isError: boolean; content: { text: string }[] } }).result;
    expect(result.isError).toBe(true);
    expect(result.content[0].text).not.toContain("rahasia");
    expect(onCall).toHaveBeenLastCalledWith("booking_ruang", { boom: true }, false);
  });
  it("needs a tool name and object arguments", async () => {
    expect(((await handleMcp(call(7, "tools/call", {}), server())).body as { error: { code: number } }).error.code).toBe(-32602);
    expect(((await handleMcp(call(8, "tools/call", { name: "ringkasan", arguments: [1] }), server())).body as { error: { code: number } }).error.code).toBe(-32602);
  });
});

describe("JSON-RPC", () => {
  it("answers ping with an empty result", async () => {
    expect((await handleMcp(call(9, "ping"), server())).body).toEqual({ jsonrpc: "2.0", id: 9, result: {} });
  });
  it("answers an unknown method with -32601", async () => {
    const reply = await handleMcp(call(10, "resources/list"), server());
    expect((reply.body as { error: { code: number } }).error.code).toBe(-32601);
  });
  it("sends nothing back for a notification (202)", async () => {
    expect(await handleMcp({ jsonrpc: "2.0", method: "notifications/initialized" }, server())).toEqual({ status: 202, body: null });
  });
  it("answers a batch, leaving the notifications out", async () => {
    const reply = await handleMcp([call(11, "ping"), { jsonrpc: "2.0", method: "notifications/initialized" }, call(12, "nope")], server());
    expect(reply.status).toBe(200);
    const answers = reply.body as { id: number; result?: unknown; error?: { code: number } }[];
    expect(answers.map(answer => answer.id)).toEqual([11, 12]);
    expect(answers[1].error?.code).toBe(-32601);
    expect(await handleMcp([{ jsonrpc: "2.0", method: "notifications/initialized" }], server())).toEqual({ status: 202, body: null });
  });
  it("refuses an empty batch, a message that is not JSON-RPC, and a body that is not JSON", async () => {
    expect(((await handleMcp([], server())).body as { error: { code: number } }).error.code).toBe(-32600);
    expect(((await handleMcp({ id: 1, method: "ping" }, server())).body as { error: { code: number } }).error.code).toBe(-32600);
    expect(((await handleMcp({ jsonrpc: "2.0", id: { a: 1 }, method: "ping" }, server())).body as { error: { code: number } }).error.code).toBe(-32600);
    const parse = await handleMcpText("{nope", server());
    expect(parse.status).toBe(400);
    expect((parse.body as { error: { code: number } }).error.code).toBe(-32700);
  });
});

describe("arguments", () => {
  it("reads dates and ids strictly", () => {
    expect(argDate({ tanggal: "2026-11-06" }, "tanggal", true)).toBe("2026-11-06");
    expect(() => argDate({ tanggal: "2026-02-31" }, "tanggal", true)).toThrow(McpInvalidParams);
    expect(() => argDate({}, "tanggal", true)).toThrow(McpInvalidParams);
    expect(argDate({}, "dari")).toBeNull();
    expect(argUuid({ id: "2F1C6A4E-8B7D-4C3A-9E21-5D6F7A8B9C0D" }, "id", true)).toBe("2f1c6a4e-8b7d-4c3a-9e21-5d6f7a8b9c0d");
    expect(() => argUuid({ id: "1; drop table" }, "id", true)).toThrow(McpInvalidParams);
  });
});

describe("mayUseMcp", () => {
  it("is for BOD and Admin WAM only", () => {
    expect(mayUseMcp({ roles: ["bod"] })).toBe(true);
    expect(mayUseMcp({ roles: ["admin"] })).toBe(true);
    expect(mayUseMcp({ roles: ["panitia"] })).toBe(false);
    expect(mayUseMcp({ roles: [] })).toBe(false);
  });
});
