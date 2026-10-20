// "view" lets a user read a shared document; "edit" also lets them change it.
export const ACCESS = Object.freeze({ VIEW: "view", EDIT: "edit" });

export function share(doc, userId, access) {
  if (!Object.values(ACCESS).includes(access)) throw new TypeError(`unknown access: ${access}`);
  const others = (doc.sharedWith ?? []).filter((entry) => entry.userId !== userId);
  return { ...doc, sharedWith: [...others, { userId, access }] };
}
