const timeout = setTimeout(() => null, Math.pow(2, 31) - 1);
process.on("message", (message: any) => {
  if (message === "exit") {
    clearTimeout(timeout);
    process.exit(0);
  } else {
    process.send(message + 1);
  }
});

process.send("ready");
