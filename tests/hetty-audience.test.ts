import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { audienceLinkFor, isLivekitRoomName, livekitRoomName } from '../lib/hetty/room-name';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('broadcast room names', () => {
  it('mints a fresh, well-formed room every time', () => {
    const first = livekitRoomName();
    const second = livekitRoomName();
    assert.notEqual(first, second, 'a link must never be reusable');
    assert.match(first, /^hetty-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('accepts only names it would mint', () => {
    assert.equal(isLivekitRoomName(livekitRoomName()), true);
    for (const bad of ['', 'hetty', 'hetty-1', 'room-123', '../hetty-x', 'hetty-ABC', `${livekitRoomName()}x`, 'hetty-00000000-0000-0000-0000-00000000000g']) {
      assert.equal(isLivekitRoomName(bad), false, `${bad} must be refused`);
    }
  });

  it('builds an audience link that carries the room and nothing else', () => {
    const room = livekitRoomName();
    const link = audienceLinkFor(room, 'https://desk.example');
    assert.equal(link, `https://desk.example/?room=${room}`);
    assert.equal(link.includes('token'), false);
    assert.equal(link.includes('key'), false);
  });

  it('single-sources the pattern between the token route and the audience', () => {
    const route = source('app/api/hetty/livekit-token/route.ts');
    assert.match(route, /from '@\/lib\/hetty\/room-name'/);
    assert.doesNotMatch(route, /hetty-\[0-9a-f\]/, 'the route must not keep its own copy of the pattern');
  });
});

describe('audience mode', () => {
  const observe = source('lib/hetty/observe.ts');

  it('joins, decodes and drives the same scene bus the host uses', () => {
    assert.match(observe, /RoomEvent\.TrackSubscribed/);
    assert.match(observe, /decodeBroadcastState/);
    assert.match(observe, /sceneDriveFor/);
    assert.match(observe, /emitSceneDrive/);
    assert.match(observe, /topic !== BROADCAST_TOPIC/, 'messages from other topics are ignored');
  });

  it('cannot publish — no publish call, no microphone, no local participant', () => {
    assert.doesNotMatch(observe, /publishTrack|publishData|setMicrophoneEnabled|createLocalAudioTrack/);
    assert.doesNotMatch(observe, /localParticipant/);
    assert.doesNotMatch(observe, /getUserMedia|mediaDevices/);
  });

  it('says the room ended rather than leaving a mouth open', () => {
    assert.match(observe, /RoomEvent\.Disconnected/);
    assert.match(observe, /type: 'speech-end', reason: 'disconnected'/);
  });

  it('never asks the token route for host rights or an unnamed room', () => {
    const door = source('components/desk/DeskAudience.tsx');
    assert.match(door, /role: 'observer', room/);
    assert.doesNotMatch(door, /role: 'host'/);
    assert.match(door, /isLivekitRoomName\(requested\)/, 'the browser applies the server\u2019s own room check');
  });

  it('is behind the same flag as the host, so a link is never silently dead', () => {
    const door = source('components/desk/DeskAudience.tsx');
    assert.match(door, /HETTY_BROADCAST_ENABLED/);
  });
});
