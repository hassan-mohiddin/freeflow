import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/** Where the shelf lives: SHELF_HOME, or ~/.shelf. */
export function shelfHome() {
  return process.env.SHELF_HOME || path.join(homedir(), ".shelf");
}

function storeFile() {
  return path.join(shelfHome(), "bookmarks.json");
}

/** A URL without its scheme, "www." or trailing slash, so the same page is one bookmark. */
export function normalizeUrl(url) {
  let value = String(url).trim().toLowerCase();
  value = value.replace(/^https?:\/\//, "");
  value = value.replace(/^www\./, "");
  if (value.endsWith("/")) value = value.slice(0, -1);
  return value;
}

/** Every bookmark as stored: { url, title, tags: "a,b", added: ISO date }. */
export function loadAll() {
  if (!existsSync(storeFile())) return [];
  return JSON.parse(readFileSync(storeFile(), "utf8"));
}

function saveAll(bookmarks) {
  mkdirSync(shelfHome(), { recursive: true });
  writeFileSync(storeFile(), `${JSON.stringify(bookmarks, null, 2)}\n`);
}

export function addBookmark({ url, title, tags = "", added = new Date().toISOString() }) {
  if (!url) throw new Error("a bookmark needs a URL");
  const bookmarks = loadAll();
  bookmarks.push({ url, title: title || url, tags, added });
  saveAll(bookmarks);
}

export function removeBookmark(url) {
  const key = normalizeUrl(url);
  saveAll(loadAll().filter((bookmark) => normalizeUrl(bookmark.url) !== key));
}

/** Bookmarks newest first, optionally only those with a tag. */
export function listBookmarks({ tag } = {}) {
  const bookmarks = loadAll().filter((bookmark) => !tag || bookmark.tags.split(",").includes(tag));
  return bookmarks.sort((a, b) => b.added - a.added);
}
