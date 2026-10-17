const { runProcess } = require("./exec.js");

// Hardware decoders on Turing (T4) NVDEC. AV1 is NOT supported on T4.
const NVDEC_CODECS = new Set(["h264", "hevc", "vp8", "vp9", "mpeg1video", "mpeg2video", "mpeg4", "vc1"]);

function rotationOf(videoStream) {
  const tag = videoStream.tags && videoStream.tags.rotate;
  if (tag !== undefined) return ((Number(tag) % 360) + 360) % 360;
  const side = (videoStream.side_data_list || []).find((s) => s.rotation !== undefined);
  return side ? ((Math.round(Number(side.rotation)) % 360) + 360) % 360 : 0;
}

// Pure: ffprobe JSON -> the few facts the command builder needs.
function parseProbe(json) {
  const streams = json.streams || [];
  const video = streams.find((s) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  if (!video) throw new Error("No video stream found in input");
  const audio = streams.find((s) => s.codec_type === "audio");
  return {
    width: Number(video.width),
    height: Number(video.height),
    videoCodec: video.codec_name,
    pixFmt: video.pix_fmt || "",
    rotation: rotationOf(video),
    hasAudio: Boolean(audio),
    audioCodec: audio ? audio.codec_name : null,
    durationSec: Number((json.format && json.format.duration) || video.duration || 0),
  };
}

async function probeSource(file, run = runProcess) {
  const { code, stdout, stderrTail } = await run("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
  ]);
  if (code !== 0) throw new Error(`ffprobe failed (${code}): ${stderrTail}`);
  return parseProbe(JSON.parse(stdout));
}

module.exports = { parseProbe, probeSource, NVDEC_CODECS };
