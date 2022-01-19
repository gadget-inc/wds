import * as opentelemetry from "@opentelemetry/api";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import {Context, ROOT_CONTEXT, Span, SpanOptions, SpanStatusCode} from "@opentelemetry/api";
import { HttpInstrumentation } from "@opentelemetry/instrumentation-http";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ConsoleSpanExporter, InMemorySpanExporter, SimpleSpanProcessor, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

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
  });
} else if (process.env.ESBUILD_DEV_TRACE_CONSOLE) {
  exporter = new ConsoleSpanExporter();
} else {
  exporter = new InMemorySpanExporter();
}

registerInstrumentations({
  instrumentations: [
    new HttpInstrumentation({}),
  ],
});

const spanProcessor = new SimpleSpanProcessor(exporter);
export const sdk = new NodeSDK({
  resource,
  traceExporter: exporter,
  spanProcessor,
  instrumentations: [],
});

export async function shutdown() {
  await sdk.shutdown();
}
let started = false;

export async function setup(log = false) {
  // if (log) {
  //   console.log(exporter);
  //   console.log(sdk);
  //   console.log(started);
  // }
  await sdk.start();
  started = true
}

export const tracer = opentelemetry.trace.getTracer("esbuild-dev");

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
export function traceStartingFromContext<T>(
  name: string,
  context: Context,
  options: SpanOptions | undefined,
  fn: (span: Span) => T
): T {
  const span = tracer.startSpan(name, options, context);
  return opentelemetry.context.with(opentelemetry.trace.setSpan(context, span), () => {
    try {
      const result = fn(span);
      if (result instanceof Promise) {
        result
          .catch((err) => {
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
          })
          .finally(() => {
            span.end();
          });
      } else {
        span.end()
      }
      return result;
    } catch (err) {
      span.end();
      throw err;
    }
  });
}

/** Run a function within a traced span. Uses the currently active context to find a parent span.  */
export function trace<T>(name: string, fn: (span: Span) => T): T;
export function trace<T>(name: string, options: SpanOptions, fn: (span: Span) => T): T;
export function trace<T>(name: string, fnOrOptions: SpanOptions | ((span: Span) => T), fn?: undefined | ((span: Span) => T)): T {
  let run: (span: Span) => T;
  let options: SpanOptions | undefined;
  if (fn) {
    run = fn;
    options = fnOrOptions as any;
  } else {
    run = fnOrOptions as any;
    options = undefined;
  }

  return traceStartingFromContext(name, opentelemetry.context.active(), options, run);
}

/** Run a function within a new root span. Ignores any currently active spans in the current context. */
export function rootTrace<T>(name: string, fn: () => T): T;
export function rootTrace<T>(name: string, options: SpanOptions, fn: () => T): T;
export function rootTrace<T>(name: string, fnOrOptions: SpanOptions | (() => T), fn?: undefined | (() => T)): T {
  let run: () => T;
  let options: SpanOptions | undefined;
  if (fn) {
    run = fn;
    options = fnOrOptions as any;
  } else {
    run = fnOrOptions as any;
    options = undefined;
  }

  return traceStartingFromContext(name, ROOT_CONTEXT, options, run);
}

/** Wrap a function in tracing, and return it  */
export const wrap = <T extends (...args: any[]) => any>(name: string, func: T, options?: SpanOptions, spanAttributes: SpanArgumentProperties = {}): T => {
  return function (this: any, ...args: Parameters<T>) {
    const span = tracer.startSpan(name, options, opentelemetry.context.active());
    for (const name in spanAttributes) {
      const index = spanAttributes[name];
      span.setAttribute(name, args[index]);
    }
    return opentelemetry.context.with(opentelemetry.trace.setSpan(opentelemetry.context.active(), span), () => {
      try {
        const result = func.call(this, ...args);;
        if (result instanceof Promise) {
          result
          .catch((err) => {
            span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
          })
          .finally(() => {
            span.end();
          });
        } else {
          span.end()
        }
        return result;
      } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: errorMessage(err) });
        span.end();
        throw err;
      }
    });
  } as any;
};

export type SpanArgumentProperties = {
  [key: string]: number,
}

/** Method decorator */
export const traced = (name: string, options?: SpanOptions, spanAttributes?: SpanArgumentProperties) => {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    descriptor.value = wrap(name, descriptor.value, options, spanAttributes);
    return descriptor;
  };
};

/** Get the currently active span to do stuff to it */
export const getCurrentSpan = () => opentelemetry.trace.getSpan(opentelemetry.context.active());
export const getCurrentSpanContext = () => opentelemetry.trace.getSpanContext(opentelemetry.context.active());
