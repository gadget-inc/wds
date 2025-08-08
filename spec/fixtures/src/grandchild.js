console.log(`grandchild:ready:${process.pid}`);

process.on("SIGINT", () => {
  // swallow SIGINT and log
  // let wds kill this process after a timeout
  console.log("grandchild:sigint");
});

process.on("SIGQUIT", () => {
  console.log("grandchild:sigquit");
});

process.on("SIGTERM", () => {
  console.log("grandchild:sigterm");
  process.exit(0);
});

// Keep alive
setInterval(() => {}, 1e9);


