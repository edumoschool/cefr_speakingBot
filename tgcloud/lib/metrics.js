// Speech metrics from Deepgram word timings. Pure module.

const FILLERS = new Set(['uh', 'um', 'uhm', 'umm', 'er', 'erm', 'ah', 'eh', 'hmm', 'mm', 'mhm']);

const round = (n, d) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * @param {{word:string,start:number,end:number,confidence:number}[]} words
 * @param {number} allowedSec
 */
export function computeMetrics(words, allowedSec) {
  const isFiller = (w) => FILLERS.has(w.word.toLowerCase());
  const content = words.filter((w) => !isFiller(w));
  let pauses = 0;
  let longPauses = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= 1) pauses++;
    if (gap >= 2.5) longPauses++;
  }
  const speakingTime = words.length ? Math.max(0, words[words.length - 1].end - words[0].start) : 0;
  const avgConfidence = content.length ? content.reduce((s, w) => s + w.confidence, 0) / content.length : 0;
  const unclear = [...new Set(content.filter((w) => w.confidence < 0.6 && w.word.length > 2).map((w) => w.word.toLowerCase()))];
  return {
    wordCount: content.length,
    speakingTime: round(speakingTime, 1),
    wpm: speakingTime > 3 ? Math.round((content.length / speakingTime) * 60) : 0,
    pauses,
    longPauses,
    fillers: words.length - content.length,
    avgConfidence: round(avgConfidence, 3),
    unclearWords: unclear.slice(0, 15),
    timeUsed: allowedSec ? round(Math.min(1, speakingTime / allowedSec), 2) : 0,
  };
}
