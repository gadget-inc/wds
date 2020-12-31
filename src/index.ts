import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { run } from "./run";

export const cli = async () => {
  const args = yargs(hideBin(process.argv))
    .parserConfiguration({
      "unknown-options-as-args": true,
    })
    .option("commands", {
      alias: "c",
      type: "boolean",
      description:
        "Trigger commands by watching for them on stdin. Prevents stdin from being forwarded to the process. Only command right now is `rs` to restart the server.",
      default: false,
    })
    .option("watch", {
      alias: "w",
      type: "boolean",
      description: "Trigger restarts by watching for changes to required files",
      default: true,
    })
    .option("supervise", {
      alias: "s",
      type: "boolean",
      description:
        "Supervise and restart the process when it exits indefinitely",
      default: false,
    }).argv;

  return run({
    argv: args._ as any,
    terminalCommands: args.commands,
    reloadOnChanges: args.watch,
    supervise: args.supervise,
  });
};
