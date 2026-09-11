function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function createStore(initial = null) {
  let canonical = initial;
  return {
    get canonical() {
      return canonical;
    },
    publish(raw) {
      canonical = raw;
      return parse(raw) ? { status: "accepted" } : { status: "rejected" };
    },
  };
}
