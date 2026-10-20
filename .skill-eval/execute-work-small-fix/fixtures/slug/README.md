# blog-urls

Builds the URL of each blog post from its title.

- `src/slug.js`: `slugify(title)` turns a title into a lowercase, hyphen-separated slug.
- `src/post.js`: `postUrl(post)` returns `/posts/<slug>`.

Run the tests with `node --test`.
