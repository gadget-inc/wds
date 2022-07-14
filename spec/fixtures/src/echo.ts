process.stdin.resume();

async function main() {
  if (!process.stdin.readable) {
    process.stdout.write("stdin is not readable");
  }
  process.stdin.pipe(process.stdout);
  process.stdin.on("end", () => {
    process.exit(0);
  })
}

main()