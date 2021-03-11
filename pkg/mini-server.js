"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiniServer = exports.Reply = exports.Request = void 0;
const http_1 = __importDefault(require("http"));
const util_1 = require("util");
const utils_1 = require("./utils");
/** represents a higher level incoming request */
class Request {
    constructor(raw, body) {
        this.raw = raw;
        this.body = body;
        Object.assign(this, raw);
    }
    json() {
        return JSON.parse(this.body);
    }
}
exports.Request = Request;
/** represents a higher level incoming reply */
class Reply {
    constructor(raw) {
        this.raw = raw;
        this.statusCode = null;
    }
    async json(value) {
        this.raw.setHeader("Content-Type", "application/json");
        this.raw.write(JSON.stringify(value));
    }
}
exports.Reply = Reply;
/** A teensy HTTP server with built in support for :gasp: routes :gasp: */
class MiniServer {
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
            utils_1.log.error(`404: ${request.raw.url}`);
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
                    utils_1.log.error("Error processing handler", error);
                reply.raw.statusCode = 500;
            }
        }
        reply.raw.end();
    }
    async start(host, port) {
        this.server = http_1.default.createServer((req, res) => {
            const chunks = [];
            req
                .on("error", (err) => utils_1.log.debug("Error processing request", err))
                .on("data", (chunk) => chunks.push(chunk))
                .on("end", () => {
                const request = new Request(req, Buffer.concat(chunks).toString("utf-8"));
                const reply = new Reply(res);
                void this.dispatch(request, reply);
            });
        });
        await util_1.promisify(this.server.listen.bind(this.server))(host, port);
        utils_1.log.debug(`Started HTTP server on ${this.server.address()}`);
    }
    close() {
        this.closed = true;
        this.server?.close();
    }
}
exports.MiniServer = MiniServer;
//# sourceMappingURL=mini-server.js.map