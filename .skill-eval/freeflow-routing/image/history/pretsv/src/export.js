const COLUMNS = ["url", "title", "tags", "added"];

/** The whole shelf in one format: csv or json. */
export function exportBookmarks(bookmarks, format) {
  switch (format) {
    case "csv": {
      const rows = bookmarks.map((bookmark) => COLUMNS.map((column) => bookmark[column] ?? "").join(","));
      return `${[COLUMNS.join(","), ...rows].join("\n")}\n`;
    }
    case "json":
      return `${JSON.stringify(bookmarks, null, 2)}\n`;
    default:
      throw new Error(`unknown export format: ${format}`);
  }
}
