#!/usr/bin/env node --enable-source-maps
"use strict";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { benchBoot, benchReload } from "./bench/bench";

export const cli = async () => {
  const args = yargs(hideBin(process.argv))
    .option("runs", {
      type: "number",
      default: 10,
    })
    .option("swc", {
      type: "boolean",
      description: "Use the SWC compiler",
    })
    .option("type", {
      choices: ["boot", "reload"],
      description: `Type of benchmark to run
        Select 'boot' to measure the time taken to run a file from cold boot.
        Select 'reload' to measure how long it takes to reload once a file is modified.
      `,
      default: "",
    }).argv;

  const benchArgs = {
    runs: args.runs,
    argv: args._,
    swc: args.swc,
  };

  switch (args.type) {
    case "boot":
      await benchBoot(benchArgs);
      break;
    case "reload":
      await benchReload(benchArgs);
      break;
    default:
      throw new Error(`Unhandled type of benchmark: ${args.type}`);
  }
};

void cli();
