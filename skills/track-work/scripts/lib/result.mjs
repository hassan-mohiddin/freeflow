import { displayPath } from "./workspace.mjs";

export function recordMetadata(root, path, data, rawSha, confirmation = "confirmed", unavailableFields = []) {
  const currentSlice = data?.currentWork?.currentSlice;
  const metadata = {
    path: displayPath(root, path),
    confirmation,
    sha256: rawSha ?? null,
    schemaVersion: data?.schemaVersion ?? null,
    taskState: data?.taskState ?? null,
    lastUpdated: data?.lastUpdated ?? null,
    currentSlice: currentSlice
      ? {
          id: currentSlice.id ?? null,
          state: currentSlice.state ?? null,
          type: currentSlice.type ?? null,
        }
      : null,
  };
  if (unavailableFields.length) metadata.unavailable = unavailableFields;
  return metadata;
}

export function baseEnvelope(command, operation, record = null) {
  return {
    status: "failed",
    operation: operation ?? command,
    ...(record ? { record } : {}),
    affectedIds: [],
    errors: [],
    warnings: [],
  };
}

export function errorItems(error) {
  return [{ code: error.code ?? "unexpected-error", message: error.message, ...(error.details ?? {}) }];
}
