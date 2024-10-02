if (!require.cache) {
  throw new Error("require.cache not found in utils file module scope");
}
export const utility = (str: string) => {
  if (!require.cache) {
    throw new Error("require.cache not found in utils file function scope");
  }
  return str.toUpperCase();
};
