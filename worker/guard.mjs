// Deterministic pre-post rules — the part of safety that shouldn't depend on
// a model's judgment. Same core as clawd-twitter's lib/guard.js (weighted
// length, no hashtags) plus rules specific to strangers steering the pen:
// no unknown links and no addresses (the #1 way a crypto account gets used
// to drain people).

const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|org|io|ai|xyz|app|gg|co|net|dev|fi|finance|link|me|so|to|sh|eth|limo|wtf|fun|money|lol)\b(?:\/[^\s]*)?/gi;
const TCO_LEN = 23;

export const CLAWD_TOKEN = "0x9f86db9fc6f7c9408e8fda3ff8ce4e78ac7a6b07";

/** Only links to our own things. A domain entry allows the whole domain and
 * its subdomains; a "domain/path" entry allows only that account/org. */
export const ALLOWED_LINKS = [
  "larv.ai", "leftclaw.services", "onedollaraudit.com", "ethskills.com",
  "slop.computer", "buidlguidl.com", "scaffoldeth.io", "speedrunethereum.com",
  "gmsers.com", "atg.link",
  "x.com/clawdbotatg", "x.com/austingriffith", "twitter.com/clawdbotatg", "twitter.com/austingriffith",
  "github.com/clawdbotatg", "github.com/scaffold-eth", "github.com/BuidlGuidl", "github.com/austintgriffith",
];

function linkAllowed(u) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.toLowerCase();
  return ALLOWED_LINKS.some(entry => {
    const [d, ...rest] = entry.toLowerCase().split("/");
    const p = rest.length ? `/${rest.join("/")}` : "";
    if (!(host === d || (!p && host.endsWith(`.${d}`)))) return false;
    return !p || path === p || path.startsWith(`${p}/`);
  });
}

/** Undo the usual tricks before any check: look-alike Unicode, zero-width
 * characters, and "evil[.]xyz" / "evil dot xyz" spellings. */
export function normalize(text) {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/[\u200B-\u200F\u2060-\u2064\uFEFF\u00AD]/g, "")
    .replace(/\s*[\[(]\s*(?:\.|dot)\s*[\])]\s*/gi, ".")
    .replace(/\s+dot\s+(?=[a-z]{2,}\b)/gi, ".");
}

export function weightedLength(text) {
  const urls = text.match(/https?:\/\/\S+/g) || [];
  return [...text.replace(/https?:\/\/\S+/g, "")].length + urls.length * TCO_LEN;
}

function hostOf(u) {
  try {
    return new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return u.toLowerCase();
  }
}

function linkProblems(text) {
  const problems = [];
  for (const u of text.match(URL_RE) || []) {
    if (!linkAllowed(u)) problems.push(`link to ${hostOf(u)} isn't one of ours`);
  }
  // Non-Latin letters next to a dot are how look-alike domains hide.
  if (/[^\x00-\x7F][\w-]*\.[a-z]{2,}|\.[^\x00-\x7F]/iu.test(text)) problems.push("contains a look-alike domain");
  return problems;
}

// Other chains' addresses (BTC, Solana, …) and emails: never in a clawd tweet.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/;
const BASE58_ADDR_RE = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
const BECH32_RE = /\b(bc1|ltc1|cosmos1|tb1)[02-9ac-hj-np-z]{20,}\b/i;

function contentProblems(text) {
  const problems = [];
  if (EMAIL_RE.test(text)) problems.push("contains an email address");
  if (BASE58_ADDR_RE.test(text) || BECH32_RE.test(text)) problems.push("contains a non-Ethereum crypto address");
  return problems;
}

/** Links / addresses / phishing checks for text that isn't the tweet itself
 * (e.g. words visible inside an attached image). */
export function guardFreeText(text) {
  const problems = [];
  text = normalize(text);
  problems.push(...linkProblems(text));
  for (const a of text.match(/0x[0-9a-fA-F]{40}/g) || []) {
    if (a.toLowerCase() !== CLAWD_TOKEN) problems.push("contains an address other than $CLAWD's");
  }
  if (/\b(seed phrase|private key|recovery phrase)\b/i.test(text)) problems.push("looks like wallet-phishing bait");
  problems.push(...contentProblems(text));
  return problems;
}

export function guardTweet(text) {
  const problems = [];
  text = String(text ?? "").replace(/\\n/g, "\n").trim();
  if (!text) problems.push("empty tweet");
  const wl = weightedLength(text);
  if (wl > 280) problems.push(`too long: ${wl}/280 weighted characters`);
  if (/(^|\s)#\w/.test(text)) problems.push("contains a hashtag (clawd never uses hashtags)");

  const norm = normalize(text);
  problems.push(...linkProblems(norm));
  for (const a of norm.match(/0x[0-9a-fA-F]{40}/g) || []) {
    if (a.toLowerCase() !== CLAWD_TOKEN) problems.push("contains an address other than $CLAWD's");
  }
  if (/0x[0-9a-fA-F]{64}/.test(norm)) problems.push("contains a hash/private-key-shaped string");
  problems.push(...contentProblems(norm));
  const mentions = norm.match(/(^|[^\w])@\w{1,15}/g) || [];
  if (mentions.length > 3) problems.push("tags more than 3 accounts");
  if (/\b(seed phrase|private key|recovery phrase)\b/i.test(norm) && /\b(send|dm|enter|share|paste|verify)\b/i.test(norm)) {
    problems.push("looks like wallet-phishing bait");
  }
  return problems.length ? { ok: false, problems } : { ok: true, text };
}
