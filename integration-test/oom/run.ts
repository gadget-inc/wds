const leak = [];
while (true) {
  leak.push("consuming memory".repeat(10000));
}
