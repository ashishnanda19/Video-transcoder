// Who may sign in. Every upload spends cloud credits, so a public deployment must not be open by accident.
//
//   ALLOWED_EMAILS         comma-separated exact addresses (case-insensitive)
//   ALLOWED_EMAIL_DOMAINS  comma-separated domains, e.g. "example.com" (matches user@example.com, not user@evil-example.com)
//   ALLOW_ANYONE=true      explicit opt-in to open sign-up
//
// Fail closed: with none of these set, nobody gets in.
const parseList = (value) =>
  String(value || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

function readAllowlist(env = process.env) {
  return {
    emails: parseList(env.ALLOWED_EMAILS),
    domains: parseList(env.ALLOWED_EMAIL_DOMAINS).map((d) => d.replace(/^@/, "")),
    allowAnyone: String(env.ALLOW_ANYONE || "").toLowerCase() === "true",
  };
}

function isEmailAllowed(email, list = readAllowlist()) {
  if (list.allowAnyone) return true;
  if (!email || typeof email !== "string") return false;
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at < 1) return false;
  if (list.emails.includes(e)) return true;
  return list.domains.includes(e.slice(at + 1));
}

const isAllowlistConfigured = (list = readAllowlist()) =>
  list.allowAnyone || list.emails.length > 0 || list.domains.length > 0;

module.exports = { readAllowlist, isEmailAllowed, isAllowlistConfigured };
