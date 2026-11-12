// The Piper voice runs here, in a worker of its own: the page stays smooth on a
// phone while a paragraph is being voiced, and the speech engines see a plain
// browser (in Obsidian's desktop window they would take Node's paths and fail).
// Built into a string at build time and started from a Blob, like the pdf.js
// worker. Files come from the network once and are kept on this device in the
// browser's private storage (not in the vault, so they never sync).
// Воркер голоса Piper: скачивает файлы один раз и хранит их на устройстве.

import * as ort from "onnxruntime-web/wasm";
import { makePiper, PIPER_ASSETS, piperVoiceUrls } from "./tts-piper.js";

ort.env.wasm.numThreads = 1;
ort.env.wasm.proxy = false;

const DIR = "elton-reader-tts";
const nameOf = (url) => url.replace(/^https:\/\//, "").replace(/[^\w.-]+/g, "_");

async function folder() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR, { create: true });
}
async function readKept(url) {
  try {
    const f = await (await (await folder()).getFileHandle(nameOf(url))).getFile();
    return f.size > 0 ? await f.arrayBuffer() : null;
  } catch { return null; }
}
async function keep(url, buf) {
  try {
    const fh = await (await folder()).getFileHandle(nameOf(url), { create: true });
    if (fh.createWritable) {
      const w = await fh.createWritable();
      await w.write(buf);
      await w.close();
    } else {
      const h = await fh.createSyncAccessHandle();
      h.truncate(0);
      h.write(new Uint8Array(buf), { at: 0 });
      h.flush();
      h.close();
    }
  } catch (e) { console.warn("Book Reader: could not keep", url, e); }
}
async function has(url) {
  try { return (await (await (await folder()).getFileHandle(nameOf(url))).getFile()).size > 0; } catch { return false; }
}

// Nothing is downloaded unless the reader agreed to it: the page passes
// `allow` only after its consent dialog (or the explicit download button).
let allowNet = false;
// What is still to download in this job, in bytes (sizes as they arrive,
// i.e. unpacked), so the page can show one honest percentage.
const SIZE = { "ort-wasm-simd.wasm": 10595041, "piper_phonemize.wasm": 635212, "piper_phonemize.data": 18077249 };
const sizeOf = (url) => SIZE[url.split("/").pop()] || (url.endsWith(".onnx") ? 63201294 : 5000);
let expect = 0;
// A download reports its progress to the page (the chip says how far it is).
async function get(url) {
  const kept = await readKept(url);
  if (kept) return kept;
  if (!allowNet) { const e = new Error("NEED_DOWNLOAD"); e.need = true; throw e; }
  const res = await fetch(url);
  if (!res.ok) throw new Error("HTTP " + res.status + " " + url.split("/").pop());
  const total = Number(res.headers.get("Content-Length")) || 0;
  const parts = [];
  let got = 0, last = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value);
    got += value.length;
    if (got - last > 512 * 1024) { last = got; self.postMessage({ op: "progress", file: url.split("/").pop(), loaded: got, total, expect }); }
  }
  const buf = new Uint8Array(got);
  let at = 0;
  for (const p of parts) { buf.set(p, at); at += p.length; }
  await keep(url, buf.buffer);
  return buf.buffer;
}

let ortReady = null;
function ortInit() {
  ortReady ??= get(PIPER_ASSETS.ortWasm).then((b) => {
    ort.env.wasm.wasmPaths = { "ort-wasm-simd.wasm": URL.createObjectURL(new Blob([b], { type: "application/wasm" })) };
  });
  return ortReady;
}
const piper = makePiper(ort, get);
function filesOf(voice) {
  const v = piperVoiceUrls(voice);
  return [PIPER_ASSETS.ortWasm, PIPER_ASSETS.phonemizeWasm, PIPER_ASSETS.phonemizeData, v.config, v.model];
}

// One job at a time: synthesis is the single CPU-heavy thing here, and order matters.
let queue = Promise.resolve();
self.onmessage = (e) => {
  const m = e.data || {};
  const run = async () => {
    allowNet = m.allow === true;
    try {
      if (allowNet && m.voice) {
        expect = 0;
        for (const u of filesOf(m.voice)) if (!(await has(u))) expect += sizeOf(u);
      }
      if (m.op === "status") {
        const have = await Promise.all(filesOf(m.voice).map(has));
        self.postMessage({ id: m.id, ok: true, ready: have.every(Boolean) });
      } else if (m.op === "load") {
        await ortInit();
        await piper.load(m.voice);
        self.postMessage({ id: m.id, ok: true });
      } else if (m.op === "speak") {
        await ortInit();
        await piper.load(m.voice);
        const { pcm, rate } = await piper.speak(m.text);
        const out = new Int16Array(pcm.length);
        for (let i = 0; i < pcm.length; i++) out[i] = Math.max(-1, Math.min(1, pcm[i])) * 32767;
        self.postMessage({ id: m.id, ok: true, pcm: out.buffer, rate }, [out.buffer]);
      } else if (m.op === "forget") {
        const v = piperVoiceUrls(m.voice);
        const d = await folder();
        for (const u of [v.model, v.config]) { try { await d.removeEntry(nameOf(u)); } catch { /* not there */ } }
        self.postMessage({ id: m.id, ok: true });
      }
    } catch (err) {
      // a failed engine start must not stay cached as failed: let the next call retry
      if (m.op !== "status" && m.op !== "forget") ortReady = null;
      self.postMessage({ id: m.id, ok: false, error: (err && err.message) || String(err), need: !!(err && err.need) });
    }
  };
  queue = queue.then(run, run);
};
