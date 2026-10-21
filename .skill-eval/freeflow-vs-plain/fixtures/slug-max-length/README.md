# tiny-slug

Turns titles into URL slugs: lowercase ASCII words joined by a separator.

```js
import { slugify } from "tiny-slug";

slugify("Crème Brûlée: A Recipe!"); // "creme-brulee-a-recipe"
slugify("Hello World", { separator: "_" }); // "hello_world"
slugify("The Quick Brown Fox Jumps", { maxLength: 15 }); // "the-quick-brown"
```

## Options

| Option      | Default | Meaning                                                                                                                                                                    |
| ----------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `separator` | `"-"`   | The text placed between words.                                                                                                                                             |
| `maxLength` | none    | The longest slug to return, in characters. A longer slug is cut back to the last whole word that fits, so a word is never cut in half and the slug never ends with a separator. |

## Command line

```bash
npx slugify "Crème Brûlée: A Recipe!"                      # creme-brulee-a-recipe
npx slugify --separator _ "Hello World"                    # hello_world
npx slugify --max-length 15 "The Quick Brown Fox Jumps"    # the-quick-brown
```

Each option above has a flag of the same name in kebab case. The slug is printed with a trailing newline.

Run the tests with `npm test`.
