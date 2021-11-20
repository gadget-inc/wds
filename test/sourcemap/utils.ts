// add some lines that move the source lines around but not the output lines
export type Whatever = any;

/** A nice util */
export const utility = (str: string) => {
  // this is on line 7 which we look for in the tests
  throw new Error("error in utils");
};
