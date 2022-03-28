/// <reference types="node" />
import http from "http";
/** represents a higher level incoming request */
export declare class Request {
    readonly raw: http.IncomingMessage;
    readonly body: string;
    constructor(raw: http.IncomingMessage, body: string);
    json(): any;
}
/** represents a higher level incoming reply */
export declare class Reply {
    readonly raw: http.ServerResponse;
    statusCode: number | null;
    constructor(raw: http.ServerResponse);
    json(value: any): void;
}
export declare type RouteHandler = (request: Request, reply: any) => Promise<void> | void;
/** A teensy HTTP server with built in support for :gasp: routes :gasp: */
export declare class MiniServer {
    readonly routes: Record<string, RouteHandler>;
    server?: http.Server;
    closed: boolean;
    constructor(routes: Record<string, RouteHandler>);
    add(path: string, handler: RouteHandler): void;
    dispatch(request: Request, reply: Reply): Promise<void>;
    start(host: string, port?: number): Promise<void>;
    close(): void;
}
