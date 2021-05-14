declare type Resolver = (specifier: string, context: any, defaultResolve: Resolver) => {
    url: string;
};
export declare const resolve: Resolver;
export {};
