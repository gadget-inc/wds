#!/usr/bin/env node --enable-source-maps
"use strict";
// eslint-disable-next-line @typescript-eslint/no-var-requires
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { boot } from "./bench/bench";

export const cli = async () => {
  const args = yargs(hideBin(process.argv))
    .option("runs", {
      type: "number",
      default: 10,
    })
    .option("type", {
      choices: ["boot", "reload"],
      description: `Type of benchmark to run
        Select 'boot' to measure the time taken to run a file from cold boot.
        Select 'reload' to measure how long it takes to reload once a file is modified.
      `,
      default: "",
    }).argv;

  if (args.type === "boot") {
    await boot(args);
  }
};

cli();
