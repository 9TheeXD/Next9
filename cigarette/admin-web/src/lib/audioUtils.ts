/**
 * Audio Trimming Utilities
 * Pure JavaScript WAV encoding — no external dependencies.
 * WAV is universally supported on all browsers, iOS, Android, and Flutter.
 */

/**
 * Resample an AudioBuffer to a target sample rate using OfflineAudioContext.
 */
async function resampleBuffer(
  buffer: AudioBuffer,
  targetRate: number
): Promise<AudioBuffer> {
  if (buffer.sampleRate === targetRate) return buffer;

  const duration = buffer.duration;
  const offCtx = new (window.OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext)(
    1, // mono output
    Math.ceil(duration * targetRate),
    targetRate
  );

  const src = offCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(offCtx.destination);
  src.start(0);

  return await offCtx.startRendering();
}

/**
 * Down-mix an AudioBuffer to mono.
 */
function mixToMono(buffer: AudioBuffer): Float32Array {
  const ch0 = buffer.getChannelData(0);
  if (buffer.numberOfChannels === 1) return ch0;

  const ch1 = buffer.getChannelData(1);
  const mono = new Float32Array(ch0.length);
  for (let i = 0; i < ch0.length; i++) {
    mono[i] = (ch0[i] + ch1[i]) / 2;
  }
  return mono;
}

/**
 * Encode a mono Float32 PCM buffer into a standard WAV Blob (16-bit PCM).
 * The resulting file has a proper RIFF header and is universally playable.
 */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  // ---- RIFF header ----
  writeString(view, 0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, "WAVE");

  // ---- fmt  sub-chunk ----
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // sub-chunk size (PCM = 16)
  view.setUint16(20, 1, true); // audio format (1 = PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // ---- data sub-chunk ----
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Convert Float32 [-1,1] → Int16
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert an AudioBuffer to a WAV Blob.
 * Forces mono + 22050 Hz to keep file size small (voice-quality is fine).
 */
export async function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
  // Down-mix to mono first, then resample to 22050 Hz.
  // 22050 Hz mono 16-bit ≈ 43 KB/s → a 10-second clip is ~430 KB (under 1 MB).
  const monoCtx = new (window.OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext)(
    1,
    buffer.length,
    buffer.sampleRate
  );
  const monoBuffer = monoCtx.createBuffer(1, buffer.length, buffer.sampleRate);
  monoBuffer.getChannelData(0).set(mixToMono(buffer));

  const resampled = await resampleBuffer(monoBuffer, 22050);
  const pcm = resampled.getChannelData(0);
  return encodeWav(pcm, resampled.sampleRate);
}

/**
 * Slice (trim) an AudioBuffer between startTime and endTime.
 */
export function sliceAudioBuffer(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): AudioBuffer {
  const sampleRate = audioBuffer.sampleRate;
  const channels = audioBuffer.numberOfChannels;

  const startFrame = Math.max(0, Math.floor(startTime * sampleRate));
  let endFrame = Math.floor(endTime * sampleRate);
  if (endFrame <= startFrame) endFrame = startFrame + 1;

  const frameCount = Math.min(
    endFrame - startFrame,
    audioBuffer.length - startFrame
  );

  const ctx = new (window.OfflineAudioContext ||
    (window as any).webkitOfflineAudioContext)(channels, frameCount, sampleRate);
  const newBuffer = ctx.createBuffer(channels, frameCount, sampleRate);

  for (let i = 0; i < channels; i++) {
    newBuffer
      .getChannelData(i)
      .set(audioBuffer.getChannelData(i).subarray(startFrame, startFrame + frameCount));
  }

  return newBuffer;
}

/**
 * Trim an AudioBuffer and return a WAV Blob.
 */
export async function trimAudioBuffer(
  audioBuffer: AudioBuffer,
  startTime: number,
  endTime: number
): Promise<Blob> {
  const sliced = sliceAudioBuffer(audioBuffer, startTime, endTime);
  return await audioBufferToWav(sliced);
}

/**
 * Trim a Blob and return a WAV Blob.
 */
export async function trimAudioBlob(
  blob: Blob,
  startTime: number,
  endTime: number
): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new (window.AudioContext ||
    (window as any).webkitAudioContext)();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  return await trimAudioBuffer(audioBuffer, startTime, endTime);
}
