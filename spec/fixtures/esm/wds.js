module.exports = {
  esm: true,
  swc: {
    jsc: {
      parser: {
        syntax: "typescript",
        decorators: true,
        dynamicImport: true,
      },
      target: "es2020",
    },
  },
};
