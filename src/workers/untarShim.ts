// js-untar is bundled for browsers and expects `window` to exist.
const globalScope = self as unknown as { window?: typeof globalThis };
if (!globalScope.window) {
  globalScope.window = self as typeof globalThis;
}

export {};
