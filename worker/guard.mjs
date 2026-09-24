// Deterministic pre-post rules — the part of safety that shouldn't depend on
// a model's judgment. Same core as clawd-twitter's lib/guard.js (weighted
// length, no hashtags) plus rules specific to strangers steering the pen:
// no unknown links and no addresses (the #1 way a crypto account gets used
// to drain people).

const URL_RE = /\bhttps?:\/\/[^\s]+|\b(?:[a-z0-9-]+\.)+(?:com|org|io|ai|xyz|app|gg|co|net|dev|fi|finance|link|me|so|to|sh|eth|limo|wtf|fun|money|lol)\b(?:\/[^\s]*)?/gi;
const TCO_LEN = 23;

export const CLAWD_TOKEN = "0x9f86db9fc6f7c9408e8fda3ff8ce4e78ac7a6b07";

/** Links to these (and their subdomains) are allowed in a tweet. */
export const ALLOWED_DOMAINS = [
  "larv.ai", "leftclaw.services", "onedollaraudit.com", "ethskills.com",
  "slop.computer", "buidlguidl.com", "scaffoldeth.io", "speedrunethereum.com",
  "ethereum.org", "github.com", "x.com", "twitter.com", "basescan.org",
  "etherscan.io", "gmsers.com", "atg.link",
];

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
  text = String(text ?? "");
  for (const u of text.match(URL_RE) || []) {
    const h = hostOf(u);
    if (!ALLOWED_DOMAINS.some(d => h === d || h.endsWith(`.${d}`))) problems.push(`link to ${h} isn't on the allowlist`);
  }
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

  for (const u of text.match(URL_RE) || []) {
    const h = hostOf(u);
    if (!ALLOWED_DOMAINS.some(d => h === d || h.endsWith(`.${d}`))) problems.push(`link to ${h} isn't on the allowlist`);
  }
  for (const a of text.match(/0x[0-9a-fA-F]{40}/g) || []) {
    if (a.toLowerCase() !== CLAWD_TOKEN) problems.push("contains an address other than $CLAWD's");
  }
  if (/0x[0-9a-fA-F]{64}/.test(text)) problems.push("contains a hash/private-key-shaped string");
  problems.push(...contentProblems(text));
  const mentions = text.match(/(^|[^\w])@\w{1,15}/g) || [];
  if (mentions.length > 3) problems.push("tags more than 3 accounts");
  if (/\b(seed phrase|private key|recovery phrase)\b/i.test(text) && /\b(send|dm|enter|share|paste|verify)\b/i.test(text)) {
    problems.push("looks like wallet-phishing bait");
  }
  return problems.length ? { ok: false, problems } : { ok: true, text };
}
