import { applyOperation } from "./lifecycle-operations.mjs";
import { CommandContractError, getCommandDefinition, validateCommandInput } from "./command-registry.mjs";

export function applyCommand(source, command, input = {}, options = {}) {
  const definition = getCommandDefinition(command);
  const validated = validateCommandInput(command, input);
  if (definition.specialBoundary)
    throw new CommandContractError([
      { code: "special-boundary", message: `${command} must use its special public boundary` },
    ]);
  return {
    command,
    operation: definition.operation,
    ...applyOperation(source, definition.operation, validated, options),
  };
}
