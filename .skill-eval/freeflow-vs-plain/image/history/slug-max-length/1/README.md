# tiny-slug

Turns titles into URL slugs: lowercase ASCII words joined by a separator.

```js
import { slugify } from "tiny-slug";

slugify("Crème Brûlée: A Recipe!"); // "creme-brulee-a-recipe"
slugify("Hello World", { separator: "_" }); // "hello_world"
```

## Options

| Option      | Default | Meaning                                                                                                                                                                    |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `separator` | `"-"`   | The text placed between words.                                                                                                                                             |

## Command line

```bash
npx slugify "Crème Brûlée: A Recipe!"                      # creme-brulee-a-recipe
npx slugify --separator _ "Hello World"                    # hello_world
```

Each option above has a flag of the same name in kebab case. The slug is printed with a trailing newline.

Run the tests with `npm test`.
