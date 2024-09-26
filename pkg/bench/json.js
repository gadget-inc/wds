"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.json = void 0;
exports.json = {
    stringify: (data) => {
        return JSON.stringify(data, (key, value) => {
            return typeof value === "bigint" ? value.toString() + "n" : value;
        });
    },
    parse: (str) => {
        return JSON.parse(str, (key, value) => {
            if (typeof value === "string" && /^\d+n$/.test(value)) {
                return BigInt(value.substr(0, value.length - 1));
            }
            return value;
        });
    },
};
//# sourceMappingURL=json.js.map