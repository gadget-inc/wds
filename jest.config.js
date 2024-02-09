module.exports = {
  transform: {
    "^.+\\.[jt]sx?$": ["@swc/jest", { sourceMaps: "inline" }],
  },
  testEnvironment: "node",
  testMatch: ["<rootDir>/spec/**/?(*.)+(spec|test).[tj]s?(x)"],
};
