export * from "./pricing";
export * from "./event-types";

/** App version injected from package.json at build time */
declare const __APP_VERSION__: string;
export const APP_VERSION: string = __APP_VERSION__;
