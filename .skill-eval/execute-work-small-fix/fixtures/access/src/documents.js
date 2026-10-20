import { canEdit } from "./access.js";

export class ForbiddenError extends Error {
  constructor(message) {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function updateDocument(user, doc, changes) {
  if (!canEdit(user, doc)) throw new ForbiddenError(`forbidden: ${user.id} may not edit ${doc.id}`);
  return { ...doc, ...changes, id: doc.id, ownerId: doc.ownerId, sharedWith: doc.sharedWith };
}
