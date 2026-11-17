import { initASRModule, createOnlineRecognizer } from './node_modules/@sherpaw/asr/dist/index.js';
let Module, rec;
async function load(cfg) {
  const t0 = performance.now();
  Module = await initASRModule();
  for (const f of ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt']) {
    const b = new Uint8Array(await (await fetch('zf/' + f)).arrayBuffer());
    Module.FS_createDataFile('/', f, b, true, false, true);
  }
  const extra = {};
  if (cfg.hotwords) {
    extra.decodingMethod = 'modified_beam_search';
    extra.maxActivePaths = 4;
    extra.hotwordsBuf = cfg.hotwords;
    extra.hotwordsBufSize = Module.lengthBytesUTF8(cfg.hotwords);
    extra.hotwordsScore = 1.5;
  }
  rec = createOnlineRecognizer(Module, {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder: '/encoder.onnx', decoder: '/decoder.onnx', joiner: '/joiner.onnx' },
      tokens: '/tokens.txt',
      numThreads: 1,
      provider: 'cpu',
      debug: 0,
      modelingUnit: cfg.hotwords ? 'bpe' : '',
      bpeVocab: '',
    },
    decodingMethod: 'greedy_search',
    enableEndpoint: 1,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 0.8,
    rule3MinUtteranceLength: 20,
    ...extra,
  });
  return performance.now() - t0;
}
let stream,
  last = '',
  t0 = 0,
  busy = 0;
onmessage = async (e) => {
  const m = e.data;
  if (m.type === 'load') postMessage({ type: 'loaded', ms: await load(m.cfg) });
  else if (m.type === 'begin') {
    stream = rec.createStream();
    last = '';
    t0 = m.t0;
    busy = 0;
  } else if (m.type === 'chunk' || m.type === 'end') {
    const s = performance.now();
    if (m.type === 'chunk') stream.acceptWaveform(16000, m.samples);
    else stream.inputFinished();
    while (rec.isReady(stream)) rec.decode(stream);
    const text = rec.getResult(stream).text.trim().toLowerCase();
    const ep = m.type === 'end' || rec.isEndpoint(stream);
    const now = performance.timeOrigin + performance.now();
    if (text !== last && !ep)
      postMessage({ type: 'ev', ev: { t: now - t0, isFinal: false, text } });
    last = text;
    if (ep) {
      if (text) postMessage({ type: 'ev', ev: { t: now - t0, isFinal: true, text } });
      rec.reset(stream);
      last = '';
    }
    busy += performance.now() - s;
    if (m.type === 'end') postMessage({ type: 'done', busy });
  }
};
