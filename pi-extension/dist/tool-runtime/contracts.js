export class OperationExecutionError extends Error {
  code;
  effectState;
  result;
  constructor(code, message, effectState = "unknown", result) {
    super(`${code}: ${message}`);
    this.code = code;
    this.effectState = effectState;
    this.result = result;
    this.name = "OperationExecutionError";
  }
}
