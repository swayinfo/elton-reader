// Piper: a neural voice that runs on this device (no account, no network once
// the voice is downloaded). Text → phonemes (espeak-ng, compiled to wasm) →
// sound (the voice's ONNX model, run by onnxruntime-web). This file is the
// engine only; where the files come from is up to the caller (the worker
// fetches and caches them, the tests read them from disk).
// Piper — нейросетевой голос прямо на устройстве.

import { createPiperPhonemize } from "../node_modules/@mintplex-labs/piper-tts-web/dist/piper-o91UDS6e.js";

// Pinned versions: the phonemizer glue above was built for exactly these files.
export const PIPER_ASSETS = {
  phonemizeWasm: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.wasm",
  phonemizeData: "https://cdn.jsdelivr.net/npm/@diffusionstudio/piper-wasm@1.0.0/build/piper_phonemize.data",
  ortWasm: "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm",
};
// Voices from the Piper project itself, at a fixed tag.
const VOICE_BASE = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/";
export const PIPER_VOICES = {
  "ru_RU-irina-medium": "ru/ru_RU/irina/medium/",
  "ru_RU-denis-medium": "ru/ru_RU/denis/medium/",
  "ru_RU-dmitri-medium": "ru/ru_RU/dmitri/medium/",
  "ru_RU-ruslan-medium": "ru/ru_RU/ruslan/medium/",
  "en_US-lessac-medium": "en/en_US/lessac/medium/",
  "en_GB-alba-medium": "en/en_GB/alba/medium/",
};
export function piperVoiceUrls(id) {
  const dir = PIPER_VOICES[id];
  if (!dir) throw new Error("unknown voice " + id);
  return { model: VOICE_BASE + dir + id + ".onnx", config: VOICE_BASE + dir + id + ".onnx.json" };
}

// get(url) → ArrayBuffer (from a cache or the network).
export function makePiper(ort, get) {
  let wasm = null, data = null, session = null, config = null, voice = null;

  async function phonemes(text) {
    // A fresh small module per call: the espeak program runs once and exits.
    // The wasm and the data package are passed in, so nothing is fetched here.
    return await new Promise((resolve, reject) => {
      let done = false;
      createPiperPhonemize({
        wasmBinary: wasm,
        getPreloadedPackage: () => data,
        print: (line) => {
          if (done) return;
          try { done = true; resolve(JSON.parse(line).phoneme_ids); } catch (e) { reject(e); }
        },
        printErr: (m) => { if (!done && /error/i.test(String(m))) { done = true; reject(new Error(String(m))); } },
        locateFile: (u) => u,
      }).then((mod) => {
        mod.callMain(["-l", config.espeak.voice, "--input", JSON.stringify([{ text }]), "--espeak_data", "/espeak-ng-data"]);
        if (!done) { done = true; reject(new Error("phonemizer gave nothing")); }
      }, reject);
    });
  }

  return {
    async load(id) {
      if (voice === id && session) return;
      if (!wasm) wasm = await get(PIPER_ASSETS.phonemizeWasm);
      if (!data) data = await get(PIPER_ASSETS.phonemizeData);
      const u = piperVoiceUrls(id);
      config = JSON.parse(new TextDecoder().decode(await get(u.config)));
      const model = await get(u.model);
      if (session) { try { await session.release(); } catch { /* old voice */ } }
      session = await ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ["wasm"] });
      voice = id;
    },
    // One piece of text → mono float PCM at the voice's rate.
    async speak(text, lengthScale) {
      const ids = await phonemes(String(text).replace(/\s+/g, " ").trim());
      const inf = config.inference || {};
      const feeds = {
        input: new ort.Tensor("int64", BigInt64Array.from(ids.map(BigInt)), [1, ids.length]),
        input_lengths: new ort.Tensor("int64", BigInt64Array.from([BigInt(ids.length)]), [1]),
        scales: new ort.Tensor("float32", Float32Array.from([inf.noise_scale ?? 0.667, lengthScale || inf.length_scale || 1, inf.noise_w ?? 0.8]), [3]),
      };
      if (config.num_speakers > 1) feeds.sid = new ort.Tensor("int64", BigInt64Array.from([0n]), [1]);
      const out = await session.run(feeds);
      return { pcm: out.output.data, rate: config.audio.sample_rate };
    },
  };
}
