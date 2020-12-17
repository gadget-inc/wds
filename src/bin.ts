#!/usr/bin/env node

import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { run } from "./run";

const args = yargs(hideBin(process.argv))
  .parserConfiguration({
    "unknown-options-as-args": true,
  })
  .option("restarts", {
    alias: "rs",
    type: "boolean",
    description: "Trigger restarts by watching for the rs characters on stdin",
    default: false,
  }).argv;

void run({ argv: args._ as any, restarts: args.restarts });
