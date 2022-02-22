module.exports = {
  extends: "@gadgetinc/eslint-config",
  plugins: [
    "jest",
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.json"],
  },
  ignorePatterns: [
    "jest.config.js",
    ".eslintrc.js",
    "spec/fixtures/**/*",
  ],
};
