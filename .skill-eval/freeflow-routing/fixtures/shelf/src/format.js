// Formats bookmarks for `shelf list` and `shelf search`.

export function fmtDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) {
    return "          ";
  } else {
    const y = d.getUTCFullYear();
    let m = String(d.getUTCMonth() + 1);
    if (m.length < 2) {
      m = "0" + m;
    }
    let day = String(d.getUTCDate());
    if (day.length < 2) {
      day = "0" + day;
    }
    return y + "-" + m + "-" + day;
  }
}

export function padTitle(title, width) {
  let x = title;
  if (x.length > width) {
    x = x.slice(0, width - 1) + "…";
  } else {
    while (x.length < width) {
      x = x + " ";
    }
  }
  return x;
}

export function formatList(bookmarks, options) {
  let out = "";
  if (options && options.json) {
    for (let i = 0; i < bookmarks.length; i++) {
      out = out + JSON.stringify(bookmarks[i]) + "\n";
    }
    return out;
  } else {
    if (bookmarks.length === 0) {
      return "Your shelf is empty.\n";
    } else {
      for (let i = 0; i < bookmarks.length; i++) {
        const b = bookmarks[i];
        let line = "";
        line = line + fmtDate(b.added);
        line = line + "  ";
        line = line + padTitle(b.title, 40);
        line = line + "  ";
        line = line + b.url;
        out = out + line + "\n";
      }
      return out;
    }
  }
}
