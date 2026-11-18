// The paths a repository's tests usually live at: test-changes.mjs lists changes to them, and Freeflow's pointers
// (hooks/shared/pointers.mjs) send Verify Work's test-design line when the agent edits one. Pure, imports nothing, so
// Claude Code's mod may import it.

// Common layouts for JavaScript, TypeScript, Python, Go, Ruby, Java, Kotlin, C#, Swift, C and C++, PHP, Elixir and
// Dart. Matching is case-sensitive, so capitalised folders such as Swift's Tests/ are listed separately. In test-changes.mjs,
// --pattern adds to these and --only replaces them.
export const DEFAULT_PATTERNS = [
  "**/*.{test,spec}.{js,jsx,mjs,cjs,ts,tsx,mts,cts}",
  "**/{test,tests,__tests__,spec,e2e,Tests}/**",
  "**/*.{Tests,UnitTests,IntegrationTests}/**",
  "**/src/*Test/**",
  "**/*_test.{go,dart,exs}",
  "**/*_{test,unittest}.{c,cc,cpp,cxx}",
  "**/*_spec.rb",
  "**/*{Test,Tests}.{java,kt,cs,swift,php}",
  "**/test_*.py",
  "**/*_test.py",
  "**/conftest.py",
  "**/{fixtures,__fixtures__,testdata,__mocks__}/**",
  "**/__snapshots__/**",
  "**/*.snap",
  "**/{jest,vitest,playwright,cypress,karma}.config.*",
  "**/vitest.workspace.*",
  "**/{jest.setup,setupTests,setup-tests,test-setup,vitest.setup}.*",
  "**/*.setup.{js,mjs,cjs,ts,mts,cts}",
  "**/.mocharc*",
  "**/{pytest.ini,tox.ini,noxfile.py}",
  "**/{spec_helper,rails_helper}.rb",
  "**/.rspec",
  "**/phpunit.xml*",
  "**/test_helper.exs",
];

// Glob to RegExp over repository-relative paths with "/" separators: "**/" is zero or more directories, "**" anything,
// "*" anything within one segment, "?" one character, and "{a,b}" either alternative.
export function globToRegExp(glob) {
  let source = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      const slash = glob[index + 2] === "/";
      source += slash ? "(?:.*/)?" : ".*";
      index += slash ? 2 : 1;
    } else if (char === "*") source += "[^/]*";
    else if (char === "?") source += "[^/]";
    else if (char === "{") {
      const end = glob.indexOf("}", index);
      if (end === -1) source += "\\{";
      else {
        source += `(?:${glob
          .slice(index + 1, end)
          .split(",")
          .map((part) => globToRegExp(part).source.slice(1, -1))
          .join("|")})`;
        index = end;
      }
    } else source += /[.+^$()|[\]\\]/.test(char) ? `\\${char}` : char;
  }
  return new RegExp(`^${source}$`);
}
export const matcher = (globs) => {
  const expressions = globs.map(globToRegExp);
  return (path) => expressions.some((expression) => expression.test(path));
};
