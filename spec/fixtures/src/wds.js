module.exports = {
  "swc": {
    "jsc": {
      "parser": {
        "syntax": "typescript",
        "decorators": true,
        "dynamicImport": true
      },
      "target": "es2020"
    },
    "module": {
      "type": "commonjs",
      "strictMode": true,
      "lazy": true
    }
  },
}
