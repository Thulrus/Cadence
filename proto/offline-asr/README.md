# Offline ASR spike (chunk 17)

Throwaway benchmark used for `docs/decisions/0001-offline-asr.md`. Not part of the app build (Vite only builds `index.html`; `tsc` doesn't include `proto/`). Kept so the measurements can be re-run.

Run everything from this directory.

## Setup

```sh
npm i --no-save puppeteer-core@24 @sherpaw/asr@0.3.0 @sherpaw/shared@0.3.0
cp ../../node_modules/vosk-browser/dist/vosk.js .
# Models: Vosk (free-LM archive for comparison; the app's stubbed build comes from npm run model)
curl -LO https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip -q vosk-model-small-en-us-0.15.zip && tar czf vosk-small.tar.gz vosk-model-small-en-us-0.15
(cd ../.. && npm run model) && cp ../../public/models/*.tar.gz.bin vosk-lite.tar.gz
# sherpa-onnx streaming Zipformer 20M: put encoder/decoder/joiner int8 .onnx + tokens.txt in zf/
# Bundle the TS helpers (they import the app's normalizer and aligner):
npx rolldown tools.ts -o tools.mjs -f esm --platform node
npx rolldown timeline.ts -o timeline.mjs -f esm --platform node
```

Test audio goes in `audio/<script>-<clean|room>.wav` (16 kHz mono). We synthesized the three samples with Piper TTS (`pip install piper-tts`; voices `en_US-ryan-medium`, `en_US-amy-medium`), after stripping markup, and made the "room" version with:

```sh
ffmpeg -i raw.wav -f lavfi -i "anoisesrc=color=pink:amplitude=0.02:sample_rate=22050" \
  -filter_complex "[0]aecho=0.8:0.7:40|75|120:0.35|0.25|0.15,highpass=f=120,lowpass=f=6000,volume=0.6[s];[s][1]amix=inputs=2:duration=first:normalize=0" \
  -ac 1 -ar 16000 numbers-room.wav
```

## Runs

```sh
python3 -m http.server 8765 &
node drive-vosk.mjs numbers room free realtime          # free LM
node drive-vosk.mjs numbers room grammar realtime       # script word list
MODEL=vosk-lite.tar.gz node drive-vosk.mjs numbers room phr8 realtime   # chosen: 8-word phrases
node drive-sherpa.mjs numbers room plain realtime
node eval.mjs numbers vosk-numbers-clean-grammar-realtime-x1 <run tags…>  # WER, display latency
node timeline.mjs church-talk <run tag> 38000 85000     # aligner position over time
```

`fast` instead of `realtime` measures the real-time factor. For a slow-CPU proxy, cap the whole browser: `systemd-run --user --scope -p CPUQuota=40% node drive-vosk.mjs …` (CDP CPU throttling doesn't reach workers).

`e2e.mjs` drives the **built app** (`npm run build && npx vite preview --port 4173`) with Chrome's fake mic playing a WAV: download the model in Settings, open the numbers sample, Start, and sample the highlighted word. `--offline --reload` simulates a returning visit in airplane mode.
