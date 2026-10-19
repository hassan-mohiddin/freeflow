import { HttpError } from "./http.js";
import { paginate } from "./paginate.js";
import { countTags, normalizeTag } from "./tags.js";
import { validateBookmarkChanges, validateNewBookmark } from "./validate.js";

/** The bookmark service over a store from store.js. */
export function createBookmarks(store, { now = () => new Date() } = {}) {
  const all = () => store.bookmarks();

  function find(id) {
    const bookmark = store.get(id);
    if (!bookmark) throw new HttpError(404, `no bookmark with id ${id}`);
    return bookmark;
  }

  function assertUrlFree(url, exceptId) {
    const existing = all().find((bookmark) => bookmark.url === url && bookmark.id !== exceptId);
    if (existing) throw new HttpError(409, `${url} is already saved`, { existingId: existing.id });
  }

  return {
    count() {
      return all().length;
    },

    async create(body) {
      const fields = validateNewBookmark(body);
      assertUrlFree(fields.url);
      const timestamp = now().toISOString();
      const bookmark = { id: store.takeId(), ...fields, createdAt: timestamp, updatedAt: timestamp };
      store.insert(bookmark);
      await store.save();
      return bookmark;
    },

    get(id) {
      return find(id);
    },

    list(query) {
      const tag = query.tag === undefined || query.tag === "" ? null : normalizeTag(query.tag);
      const text = query.q === undefined || query.q === "" ? null : query.q.toLowerCase();
      const matches = all()
        .filter((bookmark) => tag === null || bookmark.tags.includes(tag))
        .filter(
          (bookmark) =>
            text === null || bookmark.title.toLowerCase().includes(text) || bookmark.url.toLowerCase().includes(text),
        )
        .sort((left, right) => right.id - left.id);
      return paginate(matches, query);
    },

    async update(id, body) {
      const bookmark = find(id);
      const changes = validateBookmarkChanges(body);
      if (changes.url !== undefined) assertUrlFree(changes.url, id);
      const updated = { ...bookmark, ...changes, updatedAt: now().toISOString() };
      store.replace(updated);
      await store.save();
      return updated;
    },

    async remove(id) {
      find(id);
      store.remove(id);
      await store.save();
    },

    tags(query) {
      return paginate(countTags(all()), query);
    },

    async removeTag(name) {
      const tag = normalizeTag(name);
      const tagged = all().filter((bookmark) => bookmark.tags.includes(tag));
      if (tagged.length === 0) throw new HttpError(404, `no bookmark has the tag ${tag}`);
      const timestamp = now().toISOString();
      for (const bookmark of tagged) {
        bookmark.tags = bookmark.tags.filter((candidate) => candidate !== tag);
        bookmark.updatedAt = timestamp;
      }
      await store.save();
    },
  };
}
