// A local stand-in for the provider APIs, for unit tests and the Playwright run: Anthropic Messages
// (streamed), OpenAI Responses (streamed), jev /v1/systemone and the Graph Copilot Chat API. It
// answers structured-output calls with a value built from the request's JSON schema, simulates the
// prompt cache on the stable prefix, and records request metadata (never shown anywhere else).
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export interface RecordedRequest {
  path: string;
  model: string | null;
  /** The credential the request carried (x-api-key or bearer). */
  credential: string | null;
  at: number;
  body: Record<string, unknown>;
}

export interface Failure {
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface MockProviders {
  url: string;
  requests: RecordedRequest[];
  /** Fails the next request to a path prefix ("/v1/messages", "/v1/systemone", …). */
  failNext(pathPrefix: string, failure: Failure): void;
  /** Delay before the first streamed byte, per request. */
  firstByteDelayMs: number;
  /** jev noul answers use this P(yes). */
  noul: number;
  close(): Promise<void>;
}

/** A value that satisfies a strict JSON schema: first enum member, 0.995 for numbers, true, "ok". */
export function sampleFromSchema(schema: unknown): unknown {
  const s = (schema ?? {}) as Record<string, unknown>;
  if (Array.isArray(s.enum)) return s.enum[0];
  if (s.const !== undefined) return s.const;
  if (Array.isArray(s.anyOf)) return sampleFromSchema(s.anyOf[0]);
  const type = Array.isArray(s.type) ? s.type[0] : s.type;
  switch (type) {
    case "object": {
      const props = (s.properties ?? {}) as Record<string, unknown>;
      return Object.fromEntries(Object.entries(props).map(([k, v]) => [k, sampleFromSchema(v)]));
    }
    case "array":
      return [];
    case "number":
      return 0.995;
    case "integer":
      return 1;
    case "boolean":
      return true;
    case "null":
      return null;
    default:
      return "ok";
  }
}

const tokens = (text: string) => Math.ceil(text.length / 4);

export async function startMockProviders(): Promise<MockProviders> {
  const requests: RecordedRequest[] = [];
  const failures = new Map<string, Failure[]>();
  const cachedPrefixes = new Set<string>();
  let seq = 0;

  const state: MockProviders = {
    url: "",
    requests,
    firstByteDelayMs: 0,
    noul: 0.97,
    failNext(prefix, failure) {
      failures.set(prefix, [...(failures.get(prefix) ?? []), failure]);
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };

  const takeFailure = (path: string): Failure | undefined => {
    for (const [prefix, list] of failures) {
      if (path.startsWith(prefix) && list.length > 0) return list.shift();
    }
    return undefined;
  };

  const readBody = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    return text ? (JSON.parse(text) as Record<string, unknown>) : {};
  };

  const sse = (res: ServerResponse, headers: Record<string, string>) => {
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", ...headers });
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const server: Server = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? "").replace(/\?.*$/, "");
      const body = await readBody(req);
      const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? null;
      const credential = (req.headers["x-api-key"] as string | undefined) ?? auth;
      requests.push({ path, model: typeof body.model === "string" ? body.model : null, credential, at: Date.now(), body });

      const failure = takeFailure(path);
      if (failure) {
        res.writeHead(failure.status, { "content-type": "application/json", ...(failure.headers ?? {}) });
        res.end(JSON.stringify(failure.body ?? { type: "error", error: { type: "api_error", message: "mock failure" } }));
        return;
      }

      const id = `req_mock_${++seq}`;
      if (path.endsWith("/v1/messages")) return anthropic(res, body, id);
      if (path.endsWith("/v1/responses")) return openai(res, body, id);
      if (path.endsWith("/v1/systemone")) return jev(res, body, id);
      if (path.endsWith("/copilot/conversations")) return json(res, { id: `conv-${seq}` }, id);
      if (/\/copilot\/conversations\/[^/]+\/chat$/.test(path)) {
        const text = ((body.message as { text?: string } | undefined)?.text ?? "").length > 0 ? "ok" : "";
        return json(res, { id: "conv", messages: [{ id: "m1", text: "(prompt)" }, { id: "m2", text }] }, id);
      }
      res.writeHead(404).end();
    })().catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  const json = (res: ServerResponse, value: unknown, id: string) => {
    res.writeHead(200, { "content-type": "application/json", "request-id": id, "x-typesafe-request-id": id });
    res.end(JSON.stringify(value));
  };

  const anthropic = async (res: ServerResponse, body: Record<string, unknown>, id: string) => {
    const messages = body.messages as { content: { text: string; cache_control?: unknown }[] }[];
    const blocks = messages[0]?.content ?? [];
    let input = 0;
    let cacheRead = 0;
    let cacheWrite = 0;
    for (const b of blocks) {
      if (b.cache_control) {
        if (cachedPrefixes.has(b.text)) cacheRead += tokens(b.text);
        else cacheWrite += tokens(b.text);
      } else input += tokens(b.text);
    }
    const format = (body.output_config as { format?: { schema?: unknown } } | undefined)?.format;
    const text = format ? JSON.stringify(sampleFromSchema(format.schema)) : "ok";
    sse(res, { "request-id": id });
    const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    await sleep(state.firstByteDelayMs);
    send("message_start", {
      type: "message_start",
      message: {
        id: `msg_${id}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [],
        stop_reason: null,
        stop_sequence: null,
        usage: { input_tokens: input, output_tokens: 1, cache_read_input_tokens: cacheRead, cache_creation_input_tokens: cacheWrite },
      },
    });
    // The cache entry is readable once the response starts streaming.
    for (const b of blocks) if (b.cache_control) cachedPrefixes.add(b.text);
    send("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } });
    send("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } });
    send("content_block_stop", { type: "content_block_stop", index: 0 });
    send("message_delta", {
      type: "message_delta",
      delta: { stop_reason: "end_turn", stop_sequence: null },
      usage: { output_tokens: tokens(text) },
    });
    send("message_stop", { type: "message_stop" });
    res.end();
  };

  const openai = async (res: ServerResponse, body: Record<string, unknown>, id: string) => {
    const input = body.input as { content: { text: string; prompt_cache_breakpoint?: unknown }[] }[];
    const blocks = input[0]?.content ?? [];
    let total = 0;
    let cached = 0;
    let written = 0;
    for (const b of blocks) {
      total += tokens(b.text);
      if (b.prompt_cache_breakpoint) {
        if (cachedPrefixes.has(b.text)) cached += tokens(b.text);
        else written += tokens(b.text);
      }
    }
    const format = (body.text as { format?: { schema?: unknown } } | undefined)?.format;
    const text = format ? JSON.stringify(sampleFromSchema(format.schema)) : "ok";
    const response = (status: string) => ({
      id: `resp_${id}`,
      object: "response",
      created_at: Math.floor(Date.now() / 1000),
      model: body.model,
      status,
      output:
        status === "completed"
          ? [{ type: "message", id: `msg_${id}`, role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] }]
          : [],
      usage:
        status === "completed"
          ? {
              input_tokens: total,
              input_tokens_details: { cached_tokens: cached, cache_write_tokens: written },
              output_tokens: tokens(text),
              output_tokens_details: { reasoning_tokens: 0 },
              total_tokens: total + tokens(text),
            }
          : null,
      incomplete_details: null,
      error: null,
    });
    sse(res, { "x-request-id": id });
    await sleep(state.firstByteDelayMs);
    let n = 0;
    const send = (data: Record<string, unknown>) =>
      res.write(`event: ${String(data.type)}\ndata: ${JSON.stringify({ ...data, sequence_number: n++ })}\n\n`);
    send({ type: "response.created", response: response("in_progress") });
    for (const b of blocks) if (b.prompt_cache_breakpoint) cachedPrefixes.add(b.text);
    send({ type: "response.output_text.delta", item_id: `msg_${id}`, output_index: 0, content_index: 0, delta: text });
    send({ type: "response.completed", response: response("completed") });
    res.end();
  };

  const jev = (res: ServerResponse, body: Record<string, unknown>, id: string) => {
    const questions = body.questions as Record<string, { type: string; criteria?: unknown }>;
    const answers: Record<string, unknown> = {};
    for (const [name, q] of Object.entries(questions)) {
      if (q.type === "noul") answers[name] = { type: "noul", noul: state.noul };
      else if (q.type === "choice") {
        const labels = Object.keys(q.criteria as Record<string, unknown>);
        const probabilities = Object.fromEntries(labels.map((l, i) => [l, i === 0 ? 0.9 : 0.1 / (labels.length - 1)]));
        answers[name] = { type: "choice", choice: labels[0], confidence: 0.85, probabilities };
      } else {
        const levels = q.criteria as unknown[];
        const probabilities = Object.fromEntries(levels.map((_, i) => [String(i), i === levels.length - 1 ? 0.8 : 0.2 / (levels.length - 1)]));
        const legend = Object.fromEntries(levels.map((l, i) => [String(i), l]));
        answers[name] = { type: "score", score: levels.length - 1.2, confidence: 0.7, legend, probabilities };
      }
    }
    const stateText = typeof body.state === "string" ? body.state : JSON.stringify(body.state);
    json(res, { model: body.model, answers, usage: { input_tokens: tokens(stateText) + 20 * Object.keys(questions).length, output_tokens: 0 } }, id);
  };

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  state.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return state;
}
