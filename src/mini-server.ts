import http from "http";
import opentelemetry, {propagation, ROOT_CONTEXT} from "@opentelemetry/api";
import { promisify } from "util";
import { log } from "./utils";

/** represents a higher level incoming request */
export class Request {
  constructor(readonly raw: http.IncomingMessage, readonly body: string) {
    Object.assign(this, raw);
  }

  json() {
    return JSON.parse(this.body);
  }
}

/** represents a higher level incoming reply */
export class Reply {
  statusCode: number | null = null;

  constructor(readonly raw: http.ServerResponse) {}

  json(value: any) {
    this.raw.setHeader("Content-Type", "application/json");
    this.raw.write(JSON.stringify(value));
  }
}

export type RouteHandler = (request: Request, reply: any) => Promise<void> | void;

/** A teensy HTTP server with built in support for :gasp: routes :gasp: */
export class MiniServer {
  server?: http.Server;
  closed = false;

  constructor(readonly routes: Record<string, RouteHandler>) {}

  add(path: string, handler: RouteHandler) {
    this.routes[path] = handler;
  }

  async dispatch(request: Request, reply: Reply) {
    const handler = this.routes[request.raw.url!];
    if (!handler) {
      log.error(`404: ${request.raw.url}`);
      reply.statusCode = 404;
    } else {
      try {
        await handler(request, reply);
        if (reply.statusCode) reply.raw.statusCode = reply.statusCode;
      } catch (error) {
        if (!this.closed) log.error("Error processing handler", error);
        reply.raw.statusCode = 500;
      }
    }

    reply.raw.end();
  }

  async start(host: string, port?: number) {
    this.server = http.createServer((req, res) => {
      const chunks: Uint8Array[] = [];
      req
        .on("error", (err) => log.debug("Error processing request", err))
        .on("data", (chunk) => chunks.push(chunk))
        .on("end", () => {
          const request = new Request(req, Buffer.concat(chunks).toString("utf-8"));
          const reply = new Reply(res);
          void this.dispatch(request, reply);
        });
    });

    await (promisify(this.server.listen.bind(this.server)) as any)(host, port);

    log.debug(`Started HTTP server on ${this.server.address()}`);
  }

  close() {
    this.closed = true;
    this.server?.close();
  }
}
