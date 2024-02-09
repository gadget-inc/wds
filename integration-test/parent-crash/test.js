#!/usr/bin/env zx
const assert = require("assert");
const { exec } = require("child_process");

async function getChildPids(parentPid, callback) {
  const result = await $`pgrep -P ${parentPid}`;
  return result.stdout
    .split("\n")
    .filter((pid) => pid)
    .map((pid) => parseInt(pid, 10));
}

function processIsRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

const { setTimeout } = require("timers/promises");

const main = async () => {
  // launch the wds process
  const parent = $`${__dirname}/../../pkg/wds.bin.js --watch ${__dirname}/run.ts`.nothrow();

  // wait for the wds process to start
  await setTimeout(500);

  // get the pid of the child process that the parent wds supervisor will have started
  const pids = await getChildPids(parent.child.pid);
  assert(pids.length > 0, "no child pids found for supervisor process");

  // SIGKILL the parent process, as if it OOMed or something like that to simulate a zombie child
  console.log(`killing parent (${parent.child.pid})`);
  await parent.kill(9);
  assert.ok(processIsRunning(pids[0]), "test is broken, child process is not running immediately after parent is dead");

  // ensure the children are dead too after their monitoring delay
  await setTimeout(3000);

  for (const pid of pids) {
    assert.ok(!processIsRunning(pid), `child process ${pid} is still running after parent has been killed`);
  }

  await parent;
};

void main();
