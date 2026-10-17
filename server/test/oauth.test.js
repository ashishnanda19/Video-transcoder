const test = require("node:test");
const assert = require("node:assert/strict");
const User = require("../src/models/user.model.js");
const { verifyGoogleProfile } = require("../src/auth/passport.js");
const { readAllowlist } = require("../src/auth/allowlist.js");

// A Google profile as passport-google-oauth20 delivers it.
const profile = (over = {}) => ({
  id: "1234567890",
  displayName: "Ada Lovelace",
  emails: [{ value: "Ada@Example.com" }],
  photos: [{ value: "https://lh3.googleusercontent.com/a.png" }],
  _json: { email_verified: true },
  ...over,
});

// Replace the database call so the decision logic is tested without MongoDB.
function stubUserUpsert(t) {
  const calls = [];
  t.mock.method(User, "findOneAndUpdate", (filter, update) => {
    calls.push({ filter, update });
    return { lean: async () => ({ _id: "u1", googleId: filter.googleId, ...update.$set }) };
  });
  return calls;
}

test("an allowlisted, verified Google account signs in and is stored with a lower-cased email", async (t) => {
  const calls = stubUserUpsert(t);
  const result = await verifyGoogleProfile(profile(), readAllowlist({ ALLOWED_EMAILS: "ada@example.com" }));
  assert.equal(result.user.email, "ada@example.com");
  assert.equal(calls[0].filter.googleId, "1234567890", "users are keyed by the stable Google id, not the email");
  assert.ok(calls[0].update.$set.lastLoginAt instanceof Date);
});

test("an account that is not on the allowlist is refused and NOT stored", async (t) => {
  const calls = stubUserUpsert(t);
  const result = await verifyGoogleProfile(profile({ emails: [{ value: "stranger@gmail.com" }] }), readAllowlist({ ALLOWED_EMAILS: "ada@example.com" }));
  assert.equal(result.user, false);
  assert.equal(result.reason, "not_allowed");
  assert.equal(calls.length, 0, "refused people leave no record");
});

test("an unverified Google email is never trusted for access", async (t) => {
  const calls = stubUserUpsert(t);
  const result = await verifyGoogleProfile(profile({ _json: { email_verified: false } }), readAllowlist({ ALLOW_ANYONE: "true" }));
  assert.equal(result.user, false);
  assert.equal(result.reason, "unverified_email");
  assert.equal(calls.length, 0);
});

test("a profile with no email is refused", async (t) => {
  stubUserUpsert(t);
  assert.equal((await verifyGoogleProfile(profile({ emails: [] }), readAllowlist({ ALLOW_ANYONE: "true" }))).reason, "unverified_email");
});

test("with an empty allowlist nobody gets in (fails closed)", async (t) => {
  stubUserUpsert(t);
  assert.equal((await verifyGoogleProfile(profile(), readAllowlist({}))).reason, "not_allowed");
});
