import * as opentelemetry from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter, InMemorySpanExporter, SimpleSpanProcessor, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {Context, ROOT_CONTEXT, SpanOptions, SpanStatusCode, Tracer} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {JaegerExporter} from "@opentelemetry/exporter-jaeger";

export type TelemetryOptions = {
  jaegerUrl?: string;
  console?: boolean;
};

const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: "esbuild-dev",
});

let exporter: SpanExporter;

if (process.env.ESBUILD_DEV_JAEGER_URL) {
  exporter = new JaegerExporter({
    endpoint: process.env.ESBUILD_DEV_JAEGER_URL,
  });
} else if (process.env.ESBUILD_DEV_OTLP_URL) {
  exporter = new OTLPTraceExporter({
    url: process.env.ESBUILD_DEV_OTLP_URL,
  })
} else if (process.env.ESBUILD_DEV_TRACE_CONSOLE) {
  exporter = new ConsoleSpanExporter();
} else {
  exporter = new InMemorySpanExporter();
}

const spanProcessor = new SimpleSpanProcessor(exporter);
export const sdk = new NodeSDK({
  resource,
  traceExporter: exporter,
  spanProcessor,
  instrumentations: [getNodeAutoInstrumentations()],
});

export async function shutdown() {
  await sdk.shutdown()
};

export async function setup() {
  await sdk.start();
}

const tracer = opentelemetry.trace.getTracer("esbuild-dev");

const errorMessage = (error: unknown) => {
  if (typeof error == "string") {
    return error;
  } else if (error instanceof Error) {
    return error.message;
  } else {
    return String(error);
  }
};

/** Run a function within a traced span. Uses the currently active context to find a parent span.  */
export async function traceStartingFromContext<T>(
  name: string,
  context: Context,
  options: SpanOptions | undefined,
  fn: () => Promise<T>
): Promise<T> {
  const span = tracer.startSpan(name, options, context);
  return await opentelemetry.context.with(opentelemetry.trace.setSpan(context, span), async () => {
    try {
      const result = await fn();
      span.end();
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
      span.end();
      throw err;
    }
  });
}

/** Run a function within a traced span. Uses the currently active context to find a parent span.  */
export async function trace<T>(name: string, fn: () => Promise<T>): Promise<T>;
export async function trace<T>(name: string, options: SpanOptions, fn: () => Promise<T>): Promise<T>;
export async function trace<T>(
  name: string,
  fnOrOptions: SpanOptions | (() => Promise<T>),
  fn?: undefined | (() => Promise<T>)
): Promise<T> {
  let run: () => Promise<T>;
  let options: SpanOptions | undefined;
  if (fn) {
    run = fn;
    options = fnOrOptions as any;
  } else {
    run = fnOrOptions as any;
    options = undefined;
  }

  return await traceStartingFromContext(name, opentelemetry.context.active(), options, run);
}

/** Run a function within a new root span. Ignores any currently active spans in the current context. */
export async function rootTrace<T>(name: string, fn: () => Promise<T>): Promise<T>;
export async function rootTrace<T>(name: string, options: SpanOptions, fn: () => Promise<T>): Promise<T>;
export async function rootTrace<T>(
  name: string,
  fnOrOptions: SpanOptions | (() => Promise<T>),
  fn?: undefined | (() => Promise<T>)
): Promise<T> {
  let run: () => Promise<T>;
  let options: SpanOptions | undefined;
  if (fn) {
    run = fn;
    options = fnOrOptions as any;
  } else {
    run = fnOrOptions as any;
    options = undefined;
  }

  return await traceStartingFromContext(name, ROOT_CONTEXT, options, run);
}

/** Wrap a function in tracing, and return it  */
export const wrap = <T extends (...args: any[]) => any>(name: string, func: T, options?: SpanOptions): T => {
  return async function (this: any, ...args: Parameters<T>) {
    const span = tracer.startSpan(name, options, opentelemetry.context.active());
    return await opentelemetry.context.with(opentelemetry.trace.setSpan(opentelemetry.context.active(), span), async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        const result = await func.call(this, ...args);
        span.end();
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
        span.end();
        throw err;
      }
    });
  } as any;
};

/** Method decorator */
export const traced = (name: string, options?: SpanOptions) => {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    descriptor.value = wrap(name, descriptor.value, options);
    return descriptor;
  };
};

/** Get the currently active span to do stuff to it */
export const getCurrentSpan = () => opentelemetry.trace.getSpan(opentelemetry.context.active());
export const getCurrentSpanContext = () => opentelemetry.trace.getSpanContext(opentelemetry.context.active());
