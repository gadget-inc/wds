export const json = {
  stringify: (data: any): string => {
    return JSON.stringify(data, (key, value) => {
      return typeof value === "bigint" ? value.toString() + "n" : value;
    });
  },
  parse: (str: string): any => {
    return JSON.parse(str, (key, value) => {
      if (typeof value === "string" && /^\d+n$/.test(value)) {
        return BigInt(value.substr(0, value.length - 1));
      }
      return value;
    });
  },
};
