// Turning a public id into a filename — the one place that mapping is allowed to happen.
//
// Ids in this system are `[a-zA-Z0-9][a-zA-Z0-9._:-]{0,79}`, and `:` is idiomatic in them:
// the host-only namespaces are `live-agent:` / `live-mission:` / `live-nestor:`, and
// results-store.mjs offers `level:my-course@4` as the natural shape of a course version. Both
// stores then used the id directly as a path segment, and on NTFS `a:b.json` is not a file
// called `a:b.json` — it is an alternate data stream called `b.json` hanging off a file
// called `a`.
//
// Measured, on this machine, writing a scene named `level:my-course`:
//
//   temp write ok:  ads-test\level:my-course.json.9748.tmp
//   FAILED: EINVAL: invalid argument, rename ... -> ...\level:my-course.json
//   readdir: [ 'level' ]
//
// The write "succeeded" into a stream, the rename failed with EINVAL — which is not in the
// stores' rename retry set — and a stray zero-byte `level` was left in the store directory.
// The identical request succeeds on Linux. That is a portability trap sitting behind a name
// the documentation actively suggests.
//
// So ids no longer reach the filesystem. `%XX` is the escape because `%` cannot appear in a
// legal id, which makes the encoding unambiguous in both directions with no marker byte.
//
// **This is not a migration.** Every character an ordinary name uses is passed through
// unchanged, so `my-scene` still lives at `my-scene.json`. The only names whose path changes
// are the ones that could not be written at all.

/**
 * Windows resolves these as devices no matter what extension follows, so `CON.json` opens the
 * console rather than a file. They are legal ids, and one of them as a scene name would fail
 * in a way that looks nothing like "that name is reserved".
 */
const RESERVED_BASENAMES = new Set([
  "con", "prn", "aux", "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/**
 * Left alone. Deliberately narrower than the id alphabet: `_` is escaped even though no legal
 * id contains one, because results-store.mjs separates its two path components with `__` and
 * a component that can never produce an underscore makes that separator unambiguous by
 * construction rather than by an argument about the id pattern.
 */
const SAFE = /[^A-Za-z0-9.-]/g;

const escape = (character) =>
  `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;

/** A filesystem-safe, reversible encoding of one public id. */
export function encodeStoreName(name) {
  const encoded = String(name).replace(SAFE, escape);
  const [head] = encoded.split(".");
  // A leading dot is escaped for three reasons at once: `.` and `..` are directory
  // references rather than names, a dotfile is hidden on POSIX, and the scene store keeps
  // `.results` *inside* its own directory — so a name beginning with a dot is one collision
  // away from a scene shadowing the leaderboards. NAME_PATTERN already requires an
  // alphanumeric first character, but the encoder is the last line and should not depend on
  // a check made somewhere else.
  //
  // Windows tests the portion before the first dot for a device name, so escaping that
  // segment's first character is enough there too. Escaping a character rather than adding a
  // marker byte means the ordinary decoder reverses both cases with no special case.
  if (encoded.startsWith(".") || RESERVED_BASENAMES.has(head.toLowerCase())) {
    return escape(encoded[0]) + encoded.slice(1);
  }
  return encoded;
}

/** The inverse. Anything that was never encoded decodes to itself. */
export function decodeStoreName(fileName) {
  return String(fileName).replace(/%([0-9A-Fa-f]{2})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16)));
}
