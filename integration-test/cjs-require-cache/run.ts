import { utility } from "./utils";

if (!require.cache) {
  throw new Error("require.cache not found in entrypoint file");
}
console.log(utility("It worked!"));
