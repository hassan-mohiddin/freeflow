export async function recoverProof(storage, signal) {
  signal.throwIfAborted();
  const bytes = await storage.read();
  try {
    storage.record?.("verify");
    if (bytes !== "valid") throw new Error("integrity failure");
    return bytes;
  } catch (error) {
    await storage.quarantine(bytes);
    throw error;
  }
}
