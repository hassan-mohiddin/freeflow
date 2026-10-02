# Extension entry point

`index.js` is the file Pi loads: the root `package.json` lists it under `pi.extensions`. It only re-exports the compiled extension:

```js
export { default } from "../dist/index.js";
```

Keeping this stable path separate from `dist/` lets the build delete and recreate `dist/` without changing what the package manifest points to. Do not add logic here; the extension starts in [`src/index.ts`](../src/index.ts).
