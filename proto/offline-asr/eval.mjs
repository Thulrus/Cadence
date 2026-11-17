// usage: node eval.mjs <script> <refRunTag> <runTag...>
import { readFileSync } from 'node:fs';
import { truthTimes, evaluate } from './tools.mjs';
const [script, ref, ...tags] = process.argv.slice(2);
const load = (t) => JSON.parse(readFileSync(`runs/${t}.json`, 'utf8'));
const truth = truthTimes(script, load(ref));
for (const t of tags) console.log(t.padEnd(48), JSON.stringify(evaluate(script, load(t), truth)));
