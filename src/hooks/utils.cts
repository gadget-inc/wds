import type { RequestOptions } from "http";
import http from "http";
import _ from "lodash";
import { threadId } from "worker_threads";

const logPrefix = `[wds pid=${process.pid} thread=${threadId}]`;
export const log = {
  debug: (...args: any[]) => process.env["WDS_DEBUG"] && console.warn(logPrefix, ...args),
  info: (...args: any[]) => console.warn(logPrefix, ...args),
  warn: (...args: any[]) => console.warn(logPrefix, ...args),
  error: (...args: any[]) => console.error(logPrefix, ...args),
};

let pendingRequireNotifications: string[] = [];
const throttledRequireFlush = _.throttle(() => {
  try {
    const options: RequestOptions = { socketPath: process.env["WDS_SOCKET_PATH"]!, path: "/file-required", method: "POST", timeout: 300 };
    const request = http.request(options, () => {
      // don't care if it worked
    });

    request.on("error", (error: any) => {
      log.debug(`Unexpected request error while flushing require notifications`, error);
    });
    request.write(JSON.stringify(pendingRequireNotifications));
    request.end();
    pendingRequireNotifications = [];
  } catch (error) {
    // errors sometimes thrown during shutdown process, we don't care
    log.debug("error flushing require notifications", error);
  }
});

export const notifyParentProcessOfRequire = (filename: string) => {
  pendingRequireNotifications.push(filename);
  void throttledRequireFlush();
};
