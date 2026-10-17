// S3 event notifications deliver object keys URL-encoded, with '+' standing for a space
// (a literal '+' arrives as %2B). Using the raw value makes every file with a space in its name
// point at an object that does not exist.
function decodeS3EventKey(key) {
  return decodeURIComponent(String(key).replace(/\+/g, " "));
}

module.exports = { decodeS3EventKey };
