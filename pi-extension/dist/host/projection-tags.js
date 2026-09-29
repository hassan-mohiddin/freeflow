const projectedEntryIds = new WeakMap();
// Messages that came from an aligned projection; anything else in the request was generated after it.
const projectedMessages = new WeakSet();
// Projected messages whose body a host edit replaced; only these still need content association.
const editedMessages = new WeakSet();
/** The unedited native entry behind a request message, when Pi's projection established it. */
export function projectedEntryId(message) {
  return message && typeof message === "object" ? projectedEntryIds.get(message) : undefined;
}
export function tagProjectedMessages(messages, projection, branch) {
  if (!projection) return;
  let count = 0;
  for (const entry of projection.entries) count += entry.messages.length;
  if (count !== messages.length) return;
  let index = 0;
  for (const entry of projection.entries)
    for (const projected of entry.messages) if (projected?.role !== messages[index++]?.role) return;
  // Host edits change the visible body, so their targets keep exact content association.
  const edited = new Set();
  for (const entry of branch) if (entry.type === "context_edit") edited.add(entry.targetId);
  index = 0;
  for (const entry of projection.entries) {
    const source = entry.sourceEntry;
    for (const _projected of entry.messages) {
      const message = messages[index++];
      if (!message || typeof message !== "object") continue;
      projectedMessages.add(message);
      if (edited.has(source.id)) editedMessages.add(message);
      if (
        entry.messages.length === 1 &&
        (source.type === "message" || source.type === "custom_message") &&
        !edited.has(source.id)
      )
        projectedEntryIds.set(message, source.id);
    }
  }
}
/** Whether a request message came from an aligned Pi projection. */
export function isProjected(message) {
  return !!message && typeof message === "object" && projectedMessages.has(message);
}
/** Whether a host edit replaced the body of a projected request message. */
export function isHostEdited(message) {
  return !!message && typeof message === "object" && editedMessages.has(message);
}
