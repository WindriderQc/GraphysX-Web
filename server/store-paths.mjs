// Public ids are not filenames. Every current write uses a compact, case-stable marker
// encoding; reads also understand both historical raw paths and the short-lived percent
// encoding so this portability repair never makes an existing store disappear.

const RESERVED_BASENAMES = new Set([
  "con", "prn", "aux", "nul",
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

/**
 * A filesystem-safe, reversible and case-fold-stable encoding of one public id.
 *
 * The id contract is ASCII and at most 80 characters. Lowercase hex therefore produces at
 * most 161 bytes including the marker; a results filename remains under 190 bytes including
 * its compatibility digest and extension, safely below the common 255-byte component cap.
 * The marker cannot occur in a legal public id, so legacy raw names remain unambiguous.
 */
export function encodeStoreName(name) {
  return `~${Buffer.from(String(name), "utf8").toString("hex")}`;
}

/** Decode current marker names, the previous percent encoding, or a raw legacy name. */
export function decodeStoreName(fileName) {
  const text = String(fileName);
  if (/^~(?:[0-9a-f]{2})+$/i.test(text)) {
    return Buffer.from(text.slice(1), "hex").toString("utf8");
  }
  return text.replace(/%([0-9A-Fa-f]{2})/g, (_, code) =>
    String.fromCharCode(Number.parseInt(code, 16)));
}

/** Whether the pre-encoding raw filename can be opened without platform-specific aliases. */
export function isLegacyStoreNamePortable(name, { platform = process.platform } = {}) {
  const text = String(name);
  if (!text || text === "." || text === ".." || /[\/\\\u0000]/.test(text)) return false;
  if (platform !== "win32") return true;
  if (/[<>:"|?*\u0000-\u001F]/.test(text) || /[. ]$/.test(text)) return false;
  return !RESERVED_BASENAMES.has(text.split(".")[0].toLowerCase());
}

// Exact encoder shipped briefly before the bounded marker form. It remains read-only
// compatibility; new writes never use it.
function percentEncodedStoreName(name) {
  const escape = (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
  let encoded = String(name).replace(/[^A-Za-z0-9.-]/g, escape);
  const [head] = encoded.split(".");
  if (encoded.startsWith(".") || RESERVED_BASENAMES.has(head.toLowerCase())) {
    encoded = escape(encoded[0]) + encoded.slice(1);
  }
  return encoded;
}

/** Read-only disk-name fallbacks, newest historical representation first. */
export function legacyStoreNameCandidates(name, {
  platform = process.platform,
  suffixBytes = 0,
} = {}) {
  if (!Number.isSafeInteger(suffixBytes) || suffixBytes < 0) {
    throw new TypeError("suffixBytes must be a non-negative safe integer");
  }
  const current = encodeStoreName(name);
  const candidates = [];
  const percent = percentEncodedStoreName(name);
  // The percent form shipped after raw filenames, so when both survived it is authoritative.
  // Omit an impossible component before touching the filesystem: a maximum colon-heavy id can
  // expand past NAME_MAX, while its shorter raw POSIX predecessor remains readable.
  if (Buffer.byteLength(percent) + suffixBytes <= 255) candidates.push(percent);
  if (isLegacyStoreNamePortable(name, { platform })) candidates.push(String(name));
  return [...new Set(candidates)].filter((candidate) => candidate !== current);
}
