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

  it('builds an audience link that enters the desk and carries the room and nothing else', () => {
    const room = livekitRoomName();
    const link = audienceLinkFor(room, 'https://desk.example');
    assert.equal(link, `https://desk.example/?desk=hetty&room=${room}`);
    /* The door mounts inside the desk surface — a bare `?room=` would land
       on the foyer and never open it. */
    assert.equal(link.includes('desk=hetty'), true);
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

  it('tells its listener how the broadcast ended — closed or dropped', () => {
    assert.match(observe, /onEnded/);
    assert.match(observe, /RoomEvent\.ParticipantDisconnected/, 'a host leaving an emptied room ends the show');
    assert.match(observe, /state\.reason === 'closed'/, 'the wire "closed" is the host saying so');
    /* Routine speech ends are turn boundaries, not endings — the observer
       must not let an 'idle' close the door. */
    assert.match(observe, /'disconnected'\) finish\('dropped'\)|reason === 'disconnected'/);
    const door = source('components/desk/DeskAudience.tsx');
    assert.match(door, /'ended'/);
    assert.match(door, /The broadcast is over/);
  });

  it('ends the show when the host leaves, even while listeners remain', () => {
    /* A room with no host is a stale link, not a broadcast: the door must
       not sit live in it. The identity prefix is the single source both
       sides read. */
    assert.match(observe, /HOST_IDENTITY_PREFIX/);
    assert.match(source('lib/hetty/room-name.ts'), /export const HOST_IDENTITY_PREFIX/);
  });

  it('reads the broker\u2019s line and the room\u2019s own count', () => {
    const door = source('components/desk/DeskAudience.tsx');
    /* The caption strip subscribes to the same bus the scene drives on —
       words arrive whether this browser hosts or listens. */
    assert.match(door, /onSceneDrive/);
    assert.match(door, /event\.type === 'line'/);
    assert.match(door, /styles\.caption/);
    /* The count is the room's bookkeeping, live — not an estimate. */
    assert.match(door, /onAudience/);
    assert.match(observe, /remoteParticipants\.size/);
    assert.match(observe, /RoomEvent\.ParticipantConnected/);
    /* The host puts only the broker's side on the bus — the caller's
       words never leave the room. */
    const session = source('components/desk/HettyCallSession.tsx');
    assert.match(session, /type: 'line'/);
    assert.doesNotMatch(session, /user\) \{\s*[^}]*type: 'line'/, 'caller words stay off the wire');
  });

  it('lets the room hear her voice, not just her mouth', () => {
    /* The activity level that already crosses the wire warms the lamp:
       fast attack, slow cool, dead to zero — and listeners get the same
       lift because they ride the same bus. */
    const scene = source('lib/night-desk-scene.ts');
    assert.match(scene, /onSceneDrive/);
    assert.match(scene, /speech-activity/);
    assert.match(scene, /lampLight\.intensity = 45 \* lampGlow \* \(1 \+ voiceLevel/);
    assert.match(scene, /voiceLevel < 0\.02\) voiceLevel = 0/, 'silence never flickers');
    const door = source('components/desk/DeskAudience.tsx');
    assert.match(door, /--voice/, 'the door lamp swells with the same level');
    assert.match(door, /key=\{line\}/, 'a new line rises rather than swaps');
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
