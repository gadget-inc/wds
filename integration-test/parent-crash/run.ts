process.stderr.write("child started\n")
setInterval(() => {
  process.stderr.write("child still alive\n")
}, 200)
