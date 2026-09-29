// Transport-independent RPC client and server over the §4.2 contract. Every payload is validated
// on receipt: the server checks params (and its own results), the client checks results and events.
// The transport is swappable: MessagePort in the desktop app, in-memory in tests, WebSocket later.
import type { z } from "zod";
import {
  RpcMessage,
  events,
  methods,
  type EventName,
  type EventPayload,
  type MethodName,
  type MethodParams,
  type MethodResult,
  type RpcErrorCode,
} from "./rpc";

export interface Transport {
  send(message: unknown): void;
  /** Registers the single receive handler. */
  onMessage(handler: (message: unknown) => void): void;
  /**
   * Registers a handler for the far end going away (port closed, engine restarted). The client
   * rejects its pending requests with `closed`; the server stops sending events to this transport.
   */
  onClose?(handler: () => void): void;
  close?(): void;
}

/** A known RPC-layer code, or a domain code a handler chose (e.g. "not_found", "spend_cap"). */
export type ErrorCode = RpcErrorCode | (string & {});

export class RpcError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = "RpcError";
    this.code = code;
  }
}

/** Issue paths and messages only: never the offending values, which may be client content (§10.3). */
function describeIssues(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
}

function isMethod(name: string): name is MethodName {
  return Object.hasOwn(methods, name);
}

function isEvent(name: string): name is EventName {
  return Object.hasOwn(events, name);
}

// ---- server (engine side) ----------------------------------------------------------------------

export type Handler<M extends MethodName> = (params: z.output<(typeof methods)[M]["params"]>) =>
  | MethodResult<M>
  | Promise<MethodResult<M>>;
export type Handlers = { [M in MethodName]?: Handler<M> };

export interface RpcServerOptions {
  /**
   * Called when a handler throws something other than an RpcError. The UI only ever sees
   * "internal error": messages of unexpected errors can carry client paths or content (§10.3).
   */
  onInternalError?: (method: MethodName, error: unknown) => void;
}

export interface RpcServer {
  /** Serves requests arriving on a transport. Returns a function that detaches it. */
  attach(transport: Transport): () => void;
  /** Sends an event to every attached transport. */
  emit<E extends EventName>(event: E, payload: EventPayload<E>): void;
}

/**
 * One server per engine process: handlers and their state are shared, and each UI connection
 * (a new port after a reload or an engine restart) is attached to it.
 */
export function createRpcServer(handlers: Handlers, options: RpcServerOptions = {}): RpcServer {
  const transports = new Set<Transport>();

  const serve = (transport: Transport) => {
    const reply = (id: number, body: { ok: true; result: unknown } | { ok: false; code: ErrorCode; message: string }) => {
      if (!transports.has(transport)) return; // detached while the handler ran
      transport.send(
        body.ok
          ? { type: "response", id, ok: true, result: body.result }
          : { type: "response", id, ok: false, error: { code: body.code, message: body.message } },
      );
    };

    transport.onMessage(async (raw) => {
      const parsed = RpcMessage.safeParse(raw);
      if (!parsed.success || parsed.data.type !== "request") {
        return; // Not a request we can answer; without an id there is nobody to reply to.
      }
      const { id, method, params } = parsed.data;
      if (!isMethod(method)) {
        return reply(id, { ok: false, code: "unknown_method", message: `unknown method ${method}` });
      }
      const spec = methods[method];
      const p = spec.params.safeParse(params);
      if (!p.success) {
        return reply(id, { ok: false, code: "invalid_params", message: describeIssues(p.error) });
      }
      const handler = handlers[method] as ((params: unknown) => unknown) | undefined;
      if (!handler) {
        return reply(id, { ok: false, code: "not_implemented", message: `${method} is not implemented yet` });
      }
      let result: unknown;
      try {
        result = await handler(p.data);
      } catch (err) {
        if (err instanceof RpcError) {
          return reply(id, { ok: false, code: err.code, message: err.message });
        }
        options.onInternalError?.(method, err);
        return reply(id, { ok: false, code: "internal", message: "internal error" });
      }
      const r = spec.result.safeParse(result);
      if (!r.success) {
        return reply(id, { ok: false, code: "invalid_result", message: describeIssues(r.error) });
      }
      reply(id, { ok: true, result: r.data });
    });
  };

  return {
    attach(transport) {
      transports.add(transport);
      serve(transport);
      const detach = () => {
        transports.delete(transport);
      };
      transport.onClose?.(detach);
      return detach;
    },
    emit(event, payload) {
      const message = { type: "event", event, payload: events[event].parse(payload) };
      for (const transport of transports) {
        try {
          transport.send(message);
        } catch {
          transports.delete(transport);
        }
      }
    },
  };
}

// ---- client (UI side) --------------------------------------------------------------------------

export interface RpcClient {
  request<M extends MethodName>(method: M, params: MethodParams<M>, options?: { timeoutMs?: number }): Promise<MethodResult<M>>;
  /** Subscribes to an event; returns an unsubscribe function. */
  on<E extends EventName>(event: E, handler: (payload: EventPayload<E>) => void): () => void;
  close(): void;
}

export interface RpcClientOptions {
  /** Timeout for methods that declare none. Long jobs (runs, digest) return quickly and report through events. */
  timeoutMs?: number;
  /** Called with invalid events or responses; default drops them silently. */
  onProtocolError?: (message: string) => void;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export function createRpcClient(transport: Transport, options: RpcClientOptions = {}): RpcClient {
  const defaultTimeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const report = options.onProtocolError ?? (() => {});
  let nextId = 1;
  let closed = false;
  const pending = new Map<
    number,
    { method: MethodName; resolve: (v: unknown) => void; reject: (e: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >();
  const listeners = new Map<EventName, Set<(payload: never) => void>>();

  const settle = (id: number) => {
    const entry = pending.get(id);
    if (entry) {
      pending.delete(id);
      clearTimeout(entry.timer);
    }
    return entry;
  };

  const rejectAll = (error: RpcError) => {
    for (const id of [...pending.keys()]) settle(id)?.reject(error);
  };

  transport.onClose?.(() => rejectAll(new RpcError("closed", "engine connection closed")));

  transport.onMessage((raw) => {
    const parsed = RpcMessage.safeParse(raw);
    if (!parsed.success) {
      // A malformed response still names its request: fail it now rather than at its timeout.
      const maybe = raw as { type?: unknown; id?: unknown } | null;
      if (maybe?.type === "response" && typeof maybe.id === "number" && pending.has(maybe.id)) {
        settle(maybe.id)?.reject(new RpcError("invalid_message", describeIssues(parsed.error)));
        return;
      }
      return report(`invalid message: ${describeIssues(parsed.error)}`);
    }
    const msg = parsed.data;
    if (msg.type === "response") {
      const entry = settle(msg.id);
      if (!entry) return report(`response for unknown request ${msg.id}`);
      if (!msg.ok) {
        return entry.reject(new RpcError(msg.error.code, msg.error.message));
      }
      const r = methods[entry.method].result.safeParse(msg.result);
      if (!r.success) {
        return entry.reject(new RpcError("invalid_result", describeIssues(r.error)));
      }
      return entry.resolve(r.data);
    }
    if (msg.type === "event") {
      if (!isEvent(msg.event)) return report(`unknown event ${msg.event}`);
      const p = events[msg.event].safeParse(msg.payload);
      if (!p.success) return report(`invalid ${msg.event} payload: ${describeIssues(p.error)}`);
      for (const handler of listeners.get(msg.event) ?? []) {
        (handler as (payload: unknown) => void)(p.data);
      }
    }
  });

  return {
    request(method, params, requestOptions) {
      if (closed) return Promise.reject(new RpcError("closed", "client is closed"));
      const spec = methods[method];
      const p = spec.params.safeParse(params);
      if (!p.success) {
        return Promise.reject(new RpcError("invalid_params", describeIssues(p.error)));
      }
      const id = nextId++;
      const timeoutMs =
        requestOptions?.timeoutMs ?? ("timeoutMs" in spec ? (spec.timeoutMs as number) : defaultTimeout);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          settle(id);
          reject(new RpcError("timeout", `${method} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, { method, resolve: resolve as (v: unknown) => void, reject, timer });
        try {
          transport.send({ type: "request", id, method, params: p.data });
        } catch {
          settle(id);
          reject(new RpcError("closed", `${method} could not be sent`));
        }
      });
    },
    on(event, handler) {
      let set = listeners.get(event);
      if (!set) {
        set = new Set();
        listeners.set(event, set);
      }
      set.add(handler as (payload: never) => void);
      return () => set.delete(handler as (payload: never) => void);
    },
    close() {
      closed = true;
      rejectAll(new RpcError("closed", "client is closed"));
      transport.close?.();
    },
  };
}

// ---- in-memory transport (tests, and the engine under plain Node) ---------------------------------

type MemoryTransport = Transport & { deliver(message: unknown): void; hangUp(): void };

/** Two connected transports. Messages are structured-cloned and delivered asynchronously, like a MessagePort. */
export function createMemoryTransportPair(): [Transport, Transport] {
  const make = () => {
    let handler: ((m: unknown) => void) | null = null;
    const closeHandlers: (() => void)[] = [];
    let open = true;
    const t: MemoryTransport & { peer?: MemoryTransport } = {
      send(message) {
        if (!open) throw new Error("transport closed");
        const copy = structuredClone(message);
        queueMicrotask(() => t.peer?.deliver(copy));
      },
      onMessage(h) {
        handler = h;
      },
      onClose(h) {
        closeHandlers.push(h);
      },
      close() {
        t.hangUp();
        t.peer?.hangUp();
      },
      deliver(m) {
        if (open) handler?.(m);
      },
      hangUp() {
        if (!open) return;
        open = false;
        for (const h of closeHandlers) h();
      },
    };
    return t;
  };
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}
