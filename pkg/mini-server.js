import http from "http";
import { promisify } from "util";
import { log } from "./utils.js";
/** represents a higher level incoming request */
export class Request {
    constructor(raw, body) {
        this.raw = raw;
        this.body = body;
        Object.assign(this, raw);
    }
    json() {
        return JSON.parse(this.body);
    }
}
/** represents a higher level incoming reply */
export class Reply {
    constructor(raw) {
        this.raw = raw;
        this.statusCode = null;
    }
    json(value) {
        this.raw.setHeader("Content-Type", "application/json");
        this.raw.write(JSON.stringify(value));
    }
}
/** A teensy HTTP server with built in support for :gasp: routes :gasp: */
export class MiniServer {
    constructor(routes) {
        this.routes = routes;
        this.closed = false;
    }
    add(path, handler) {
        this.routes[path] = handler;
    }
    async dispatch(request, reply) {
        const handler = this.routes[request.raw.url];
        if (!handler) {
            log.error(`404: ${request.raw.url}`);
            reply.statusCode = 404;
        }
        else {
            try {
                await handler(request, reply);
                if (reply.statusCode)
                    reply.raw.statusCode = reply.statusCode;
            }
            catch (error) {
                if (!this.closed)
                    log.error("Error processing handler", error);
                reply.raw.statusCode = 500;
            }
        }
        reply.raw.end();
    }
    async start(host, port) {
        this.server = http.createServer((req, res) => {
            const chunks = [];
            req
                .on("error", (err) => log.debug("Error processing request", err))
                .on("data", (chunk) => chunks.push(chunk))
                .on("end", () => {
                const request = new Request(req, Buffer.concat(chunks).toString("utf-8"));
                const reply = new Reply(res);
                void this.dispatch(request, reply);
            });
        });
        await promisify(this.server.listen.bind(this.server))(host, port);
        log.debug(`Started HTTP server on ${this.server.address()}`);
    }
    close() {
        this.closed = true;
        this.server?.close();
    }
}
//# sourceMappingURL=mini-server.js.map