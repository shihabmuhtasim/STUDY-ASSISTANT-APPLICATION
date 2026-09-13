import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VoiceSession, transcriptChunks, lecturePrompt } from '../src/services/voiceSession.ts';
import type { SpeechEngine, VoiceSegment, VoiceSessionState } from '../src/services/voiceSession.ts';

class Microphone implements SpeechEngine {
  continuous = false; interimResults = false; lang = '';
  onstart = null; onresult = null; onerror = null; onend = null;
  stopped = false;
  start() { this.onstart?.(); }
  stop() { this.stopped = true; }
  abort() { this.onend?.(); }
  words(transcript: string) { this.onresult?.({ results: [{ isFinal: true, 0: { transcript } }] }); }
}
function setup() {
  const engines: Microphone[] = [], segments: VoiceSegment[] = [];
  let state: VoiceSessionState;
  const session = new VoiceSession({ createEngine: () => { const engine = new Microphone(); engines.push(engine); return engine; }, onState: (value) => { state = value; }, onSegment: (segment) => segments.push(segment) });
  session.setPage(1, 'Slide ONE');
  return { session, engines, segments, state: () => state };
}
test('This page stops on navigation and submits the original page and final words once', () => {
  const x = setup(); x.session.start('page', 'custom-key', 'en-US');
  x.engines[0].words('Lecture ONE'); x.session.setPage(2, 'Slide TWO');
  assert.equal(x.engines[0].stopped, true);
  x.engines[0].words('Lecture ONE final'); x.engines[0].onend();
  assert.equal(x.segments.length, 1); assert.equal(x.segments[0].pageNumber, 1);
  assert.equal(x.segments[0].pageText, 'Slide ONE'); assert.equal(x.segments[0].transcript, 'Lecture ONE final');
  assert.equal(x.state().phase, 'idle'); assert.equal(x.engines.length, 1); x.session.dispose();
});
test('Auto by page finishes one segment before recording the next and Stop ends auto mode', () => {
  const x = setup(); x.session.start('continuous', 'custom-key', 'en-US');
  x.engines[0].words('First lecture'); x.session.setPage(2, 'Slide TWO'); x.engines[0].onend();
  assert.equal(x.segments.length, 1); assert.equal(x.state().segment.pageNumber, 2);
  x.engines[1].words('Second lecture'); x.session.stop(); x.engines[1].onend();
  assert.deepEqual(x.segments.map(s => s.pageNumber), [1, 2]); assert.equal(x.state().phase, 'idle'); x.session.dispose();
});
test('Same-page tab/view updates do not stop the recording', () => {
  const x = setup(); x.session.start('page', 'custom', 'en-US');
  x.session.setPage(1, ''); x.session.setPage(1, 'Slide ONE updated');
  assert.equal(x.engines[0].stopped, false); assert.equal(x.state().phase, 'recording'); x.session.dispose();
});
test('Silence restart can be cancelled; it never restarts after Stop', async () => {
  const x = setup(); x.session.start('continuous', 'custom', 'en-US');
  x.engines[0].words('Before silence'); x.engines[0].onend(); x.session.stop();
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.equal(x.engines.length, 1); assert.equal(x.segments[0].transcript, 'Before silence'); x.session.dispose();
});
test('Speech result revisions replace interim words without duplicates', () => {
  const x = setup(); x.session.start('page', 'custom', 'en-US');
  x.engines[0].words('max'); x.engines[0].words('max pooling'); x.session.stop(); x.engines[0].onend();
  assert.equal(x.segments[0].transcript, 'max pooling'); x.session.dispose();
});
test('Transcription errors stop auto mode and preserve the received words', () => {
  const x = setup(); x.session.start('continuous', 'custom', 'en-US');
  x.engines[0].words('Keep these words'); x.engines[0].onerror({ error: 'network' }); x.engines[0].onend();
  assert.match(x.state().error, /network/); assert.equal(x.state().phase, 'idle');
  assert.equal(x.segments[0].transcript, 'Keep these words'); assert.equal(x.engines.length, 1); x.session.dispose();
});
test('Long lecture chunks retain all words and fit the custom prompt limit', () => {
  const transcript = 'Important lecture example. '.repeat(2000).trim();
  const chunks = transcriptChunks(transcript);
  assert.equal(chunks.join(' '), transcript);
  for (const chunk of chunks) assert.ok(lecturePrompt(chunk).length < 24000);
});
