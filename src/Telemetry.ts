import { Context, Span, SpanOptions, trace, Tracer } from "@opentelemetry/api";
import * as opentelementry from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { BasicTracerProvider, ConsoleSpanExporter, ReadableSpan, SimpleSpanProcessor, SpanExporter } from "@opentelemetry/sdk-trace-base";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import {log} from "./utils";
import { ExportResult, ExportResultCode } from '@opentelemetry/core';

export type TelemetryOptions = {
  jaegerUrl?: string;
  console?: boolean;

  // TODO: Prometheus
};

let provider: BasicTracerProvider | null;
let oTelTracer: Tracer | null;

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

const traceExporter = new CombinedExporter();
export const setup = (options: TelemetryOptions) => {
  const resource = new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "esbuild-dev",
  });

  const provider = new BasicTracerProvider({
    resource: resource,
  });
  provider.addSpanProcessor(new SimpleSpanProcessor(traceExporter));

  const sdk = new NodeSDK({
    resource,
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  if (options.jaegerUrl) {
    log.debug("Using OpenTelemetry Jaeger exporter");
    // TODO: Provide nicer error message
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { JaegerExporter } = require("@opentelemetry/exporter-jaeger");
    traceExporter.addExporter(new JaegerExporter({
      endpoint: options.jaegerUrl,
    }));
  }

  if (options.console) {
    log.debug("Using OpenTelemetry Console exporter");
    traceExporter.addExporter(new ConsoleSpanExporter());
  }

  provider.register();
  oTelTracer = provider.getTracer("esbuild-dev");
};

class TracerNotConfigured extends Error {}

class TracerProxy implements Tracer {
  startActiveSpan(...args: any[]) {
    log.info("start active span", ...args);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    return this.ensureConfigured().startActiveSpan(...args);
  }

  startSpan(name: string, options?: SpanOptions, context?: Context): Span {
    log.info("start normal span")
    return this.ensureConfigured().startSpan(name, options, context);
  }

  private ensureConfigured(): Tracer {
    if (oTelTracer) {
      return oTelTracer;
    }

    throw new TracerNotConfigured("Tracer not configured. setup() must be called first.");
  }
}

export const shutdown = async () => {
  await traceExporter.shutdown();
};

export const tracer = new TracerProxy();
