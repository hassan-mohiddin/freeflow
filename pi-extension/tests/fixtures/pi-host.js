export const PI_HOST = Object.freeze({
  distribution: Object.freeze({ id: "pi", version: "test" }),
  capabilities: Object.freeze({}),
});

export const PIFLOW_HOST = Object.freeze({
  distribution: Object.freeze({ id: "piflow", version: "test" }),
  capabilities: Object.freeze({ sessionModelStateControl: 1 }),
});

export const PIFLOW_HOST_NO_CAPABILITY = Object.freeze({
  distribution: Object.freeze({ id: "piflow", version: "test" }),
  capabilities: Object.freeze({}),
});
