import * as opentelemetry from "@opentelemetry/api";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BasicTracerProvider, ConsoleSpanExporter, ReadableSpan, SimpleSpanProcessor, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {log} from "./utils";
import { ExportResult, ExportResultCode } from '@opentelemetry/core';
import {Context, SpanOptions, SpanStatusCode, Tracer} from "@opentelemetry/api";
import {JaegerExporter} from "@opentelemetry/exporter-jaeger";
import {NodeTracerProvider} from "@opentelemetry/node";

export type TelemetryOptions = {
  jaegerUrl?: string;
  console?: boolean;

  // TODO: Prometheus
};

const isSetup = false;
let sdk: NodeSDK;

class CombinedExporter implements SpanExporter {
  private readonly exporters: Array<SpanExporter>
  constructor() {
    this.exporters = []
  }

  addExporter(exporter: SpanExporter): void {
    this.exporters.push(exporter);
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    const promises: Array<Promise<ExportResult>> = [];
    for (const exporter of this.exporters) {
      promises.push(new Promise((resolve) => {
        exporter.export(spans, (result) => {
          resolve(result);
        })
      }));
    }

    void Promise.all(promises).then((results) => {
      for (const result of results) {
        if (result.code == ExportResultCode.FAILED) {
          return resultCallback(result);
        }
      }

      return resultCallback({ code: ExportResultCode.SUCCESS });
    })
  }

  shutdown(): Promise<void> {
    const promises = []
    for (const exporter of this.exporters) {
      promises.push(exporter.shutdown());
    }
    return Promise.all(promises).then(() => {
      return;
    }).catch(error => {
      log.error(`Failed shutdown OpenTelemetry exporter: ${error}.`)
    });
  }
}
// const traceExporter = new CombinedExporter();
const resource = new Resource({
  [SemanticResourceAttributes.SERVICE_NAME]: "esbuild-dev",
});

let exporter: any;

export const setup = (options: TelemetryOptions) => {

  if (options.jaegerUrl) {
    // TODO: Provide nicer error message
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JaegerExporter } = require("@opentelemetry/exporter-jaeger");

    exporter = new JaegerExporter({
      endpoint: 'http://localhost:14268/api/traces',
    });

    const spanProcessor = new SimpleSpanProcessor(exporter);

    sdk = new NodeSDK({
      resource,
      traceExporter: exporter,
      spanProcessor,
      instrumentations: [getNodeAutoInstrumentations()],
    });

    // provider.addSpanProcessor();
  }

  // if (options.console) {
  //   log.debug("Using OpenTeddlemetry Console exporter");
  //   provider.addSpanProcessor(new SimpleSpanProcessor(new ConsoleSpanExporter()));
  // }

  // provider.register();
  tracer = opentelemetry.trace.getTracer("esbuild-dev");
};

export async function shutdown() {
  console.log("SHUTDOWN", sdk);
  await sdk?.shutdown()
  console.log("SHUTDOWN", sdk);
  await exporter.shutdown();
  // await provider.shutdown();
};

class TracerNotConfigured extends Error {}

let tracer: Tracer;

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
  fn: () => T
): T {
  const span = tracer.startSpan(name, options, context);
  return opentelemetry.context.with(opentelemetry.trace.setSpan(context, span), () => {
    try {
      const result = fn();
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
export function trace<T>(name: string, fn: () => T): T;
export function trace<T>(name: string, options: SpanOptions, fn: () => T): T;
export function trace<T>(
  name: string,
  fnOrOptions: SpanOptions | (() => T),
  fn?: undefined | (() => T)
): T {
  let run: () => T;
  let options: SpanOptions | undefined;
  if (fn) {
    run = fn;
    options = fnOrOptions as any;
  } else {
    run = fnOrOptions as any;
    options = undefined;
  }

  log.info("EXISTING CONTEXT", opentelemetry.context.active());

  return traceStartingFromContext(name, opentelemetry.context.active(), options, run);
}

/** Run a function within a new root span. Ignores any currently active spans in the current context. */
export function rootTrace<T>(name: string, fn: () => T): T;
export function rootTrace<T>(name: string, options: SpanOptions, fn: () => T): T;
export function rootTrace<T>(
  name: string,
  fnOrOptions: SpanOptions | (() => T),
  fn?: undefined | (() => T)
): T {
  let run: () => T;
  let options: SpanOptions | undefined;
  if (fn) {
    run = fn;
    options = fnOrOptions as any;
  } else {
    run = fnOrOptions as any;
    options = undefined;
  }

  return traceStartingFromContext(name, opentelemetry.ROOT_CONTEXT, options, run);
}

/** Wrap a function in tracing, and return it  */
export const wrap = <T extends (...args: any[]) => any>(name: string, func: T, options?: SpanOptions): T => {
  return function (this: any, ...args: Parameters<T>) {
    const span = tracer.startSpan(name, options, opentelemetry.context.active());
    return opentelemetry.context.with(opentelemetry.trace.setSpan(opentelemetry.context.active(), span), () => {
      try {
        // eslint-disable-next-line @typescript-eslint/await-thenable
        const result = func.call(this, ...args);
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
