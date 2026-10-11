import {releaseAdapter} from './adapters/release.mjs';
import {runAdapter, summarize} from './run-adapter.mjs';
console.log(JSON.stringify([
  {failures: 0, reviewed: true}, {failures: 2, reviewed: true}, {failures: 0, reviewed: null},
].map(input => ({input, ...summarize(runAdapter(releaseAdapter, input, {maxFailures: 0, requiredReview: true}))})), null, 2));
