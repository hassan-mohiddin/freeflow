export function canView(user, doc) {
  if (user.role === "admin") return true;
  if (doc.ownerId === user.id) return true;
  return (doc.sharedWith ?? []).some((entry) => entry.userId === user.id);
}

export function canEdit(user, doc) {
  if (user.role === "admin") return true;
  return doc.ownerId === user.id;
}
