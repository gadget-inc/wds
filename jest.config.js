module.exports = {
  transform: {
    "^.+\\.[jt]sx?$": ["@swc/jest", { sourceMaps: "inline" }],
  },
  testEnvironment: "node",
};
