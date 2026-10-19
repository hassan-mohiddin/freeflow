import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Opens the JSON file store at `<dataDir>/bookmarks.json`. The whole data set lives in memory, with an index by id
 * for lookups; `save` writes it back to the file, replacing it in one step, and saves never overlap.
 * @param {string} dataDir
 */
export async function openStore(dataDir) {
  const file = path.join(dataDir, "bookmarks.json");
  let data = { nextId: 1, bookmarks: [] };
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error(`cannot read ${file}: ${error.message}`);
  }
  if (!Number.isInteger(data.nextId) || !Array.isArray(data.bookmarks)) {
    throw new Error(`${file} is not a bookmarks file`);
  }
  const byId = new Map(data.bookmarks.map((bookmark) => [bookmark.id, bookmark]));
  let pending = Promise.resolve();

  return {
    /** Every bookmark, oldest first. */
    bookmarks() {
      return data.bookmarks;
    },
    /** The bookmark with this id, or undefined. */
    get(id) {
      return byId.get(id);
    },
    takeId() {
      return data.nextId++;
    },
    insert(bookmark) {
      data.bookmarks.push(bookmark);
      byId.set(bookmark.id, bookmark);
    },
    /** Puts a new version of a bookmark in place of the one with the same id. */
    replace(bookmark) {
      byId.set(bookmark.id, bookmark);
    },
    remove(id) {
      const index = data.bookmarks.findIndex((bookmark) => bookmark.id === id);
      if (index !== -1) data.bookmarks.splice(index, 1);
      byId.delete(id);
    },
    save() {
      const snapshot = JSON.stringify(data, null, 2);
      pending = pending.then(async () => {
        await mkdir(dataDir, { recursive: true });
        const temporary = `${file}.${process.pid}.tmp`;
        await writeFile(temporary, `${snapshot}\n`);
        await rename(temporary, file);
      });
      return pending;
    },
    /** Resolves once every save started so far has reached the file. */
    flushed() {
      return pending;
    },
  };
}
