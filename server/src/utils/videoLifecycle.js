// Rules for removing videos. Pure functions so the guard rails are unit-testable.
const IN_FLIGHT = ["queued", "starting", "processing"];

// A job that is queued or running must finish (or fail) first: deleting under a running container would leave it
// uploading into a record that no longer exists and would leak its concurrency slot.
const isDeletable = (progress) => !IN_FLIGHT.includes(progress);

const retentionCutoff = (days, now = Date.now()) => (days > 0 ? new Date(now - days * 24 * 3600 * 1000) : null);

// Where a record's renditions live in the final bucket ("videos/<id>"; older records used "videos/<title>").
const outputPrefixOf = (video) => video.outputPrefix || `videos/${video.fileName}`;

module.exports = { isDeletable, retentionCutoff, outputPrefixOf, IN_FLIGHT };
