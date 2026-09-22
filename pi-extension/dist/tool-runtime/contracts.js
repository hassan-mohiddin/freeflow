export class OperationExecutionError extends Error {
  code;
  effectState;
  constructor(code, message, effectState = "unknown") {
    super(`${code}: ${message}`);
    this.code = code;
    this.effectState = effectState;
    this.name = "OperationExecutionError";
  }
}
