import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_MESSAGE_LENGTH,
  PROTOCOL_VERSION,
  decodeClientMessage,
  decodeReplayCommand,
  normalizeBuild,
  decodeServerMessage,
  encodeClientMessage,
  encodeReplayCommand,
  type Command,
  encodeServerMessage,
  type ClientMessage,
} from '../src';

describe('client message codec', () => {
  const valid: ClientMessage[] = [
    { t: 'cmd', cmd: { type: 'move', x: 10.5, y: 3 } },
    { t: 'cmd', cmd: { type: 'attackMove', x: 1, y: 2 } },
    { t: 'cmd', cmd: { type: 'attack', targetId: 42 } },
    { t: 'cmd', cmd: { type: 'stop' } },
    { t: 'cmd', cmd: { type: 'cast', slot: 'Q' } },
    { t: 'cmd', cmd: { type: 'cast', slot: 'W', x: 4, y: 5 } },
    { t: 'cmd', cmd: { type: 'learn', slot: 'W' } },
    { t: 'cmd', cmd: { type: 'learn', slot: 'R' } },
    { t: 'cmd', cmd: { type: 'cast', slot: 'E' } },
    { t: 'cmd', cmd: { type: 'cast', slot: 'R', x: 12.5, y: 30 } },
    { t: 'cmd', cmd: { type: 'build', padId: 3, tower: 'frost' } },
    { t: 'cmd', cmd: { type: 'sell', towerId: 7 } },
    { t: 'cmd', cmd: { type: 'build', padId: 4, tower: 'arcane' } },
    { t: 'cmd', cmd: { type: 'build', padId: 5, tower: 'flak' } },
    { t: 'cmd', cmd: { type: 'upgrade', towerId: 7 } },
    { t: 'cmd', cmd: { type: 'upgrade', towerId: 7, branch: 'sniper' } },
    { t: 'cmd', cmd: { type: 'setPriority', towerId: 7, priority: 'first' } },
    { t: 'cmd', cmd: { type: 'setPriority', towerId: 7, priority: 'strongest' } },
    { t: 'cmd', cmd: { type: 'setPriority', towerId: 7, priority: 'closest' } },
    { t: 'cmd', cmd: { type: 'callEarly' } },
    { t: 'cmd', cmd: { type: 'gift', to: 'p2', amount: 50 } },
    { t: 'cmd', cmd: { type: 'ping', x: 12.5, y: 4 } },
    { t: 'cmd', cmd: { type: 'emote', emote: 'help' } },
    { t: 'cmd', cmd: { type: 'emote', emote: 'defend' } },
    { t: 'restart' },
    { t: 'start' },
    { t: 'leave' },
    { t: 'create', v: PROTOCOL_VERSION, name: 'Ada', hero: 'ranger' },
    { t: 'join', v: PROTOCOL_VERSION, code: 'ABCDE', name: 'Bo', hero: 'ranger' },
    { t: 'rejoin', v: PROTOCOL_VERSION, code: 'ZZZZZ', token: '0123456789abcdef0123456789abcdef' },
    // Another version still decodes: the server answers it with version_mismatch.
    { t: 'create', v: 1, name: 'Old', hero: 'ranger' },
    { t: 'hero', hero: 'ranger' },
    { t: 'hero', hero: 'warden' },
    { t: 'hero', hero: 'arcanist' },
    { t: 'create', v: PROTOCOL_VERSION, name: 'Cy', hero: 'arcanist' },
    { t: 'join', v: PROTOCOL_VERSION, code: 'ABCDE', name: 'Di', hero: 'warden' },
    { t: 'ready', ready: true },
    { t: 'mode', mode: 'full' },
    { t: 'mode', mode: 'quick' },
    { t: 'difficulty', difficulty: 'normal' },
    { t: 'difficulty', difficulty: 'hard' },
  ];

  it.each(valid)('round-trips %j', (msg) => {
    expect(decodeClientMessage(encodeClientMessage(msg))).toEqual(msg);
  });

  it.each([
    ['not json', '{nope'],
    ['non-string', 5],
    ['array', '[]'],
    ['unknown envelope', '{"t":"hack"}'],
    ['unknown command', '{"t":"cmd","cmd":{"type":"giveGold"}}'],
    ['extra keys', '{"t":"cmd","cmd":{"type":"stop","gold":999}}'],
    ['NaN-ish coordinate', '{"t":"cmd","cmd":{"type":"move","x":"1","y":2}}'],
    ['huge coordinate', '{"t":"cmd","cmd":{"type":"move","x":1e9,"y":2}}'],
    ['negative id', '{"t":"cmd","cmd":{"type":"sell","towerId":-1}}'],
    ['fractional id', '{"t":"cmd","cmd":{"type":"attack","targetId":1.5}}'],
    ['bad tower', '{"t":"cmd","cmd":{"type":"build","padId":1,"tower":"laser"}}'],
    ['bad slot', '{"t":"cmd","cmd":{"type":"cast","slot":"X"}}'],
    ['lower-case slot', '{"t":"cmd","cmd":{"type":"learn","slot":"r"}}'],
    ['learn with a target', '{"t":"cmd","cmd":{"type":"learn","slot":"R","x":1,"y":2}}'],
    ['non-finite cast point', '{"t":"cmd","cmd":{"type":"cast","slot":"R","x":1e999,"y":2}}'],
    ['hero id as a number', '{"t":"hero","hero":1}'],
    ['half a target point', '{"t":"cmd","cmd":{"type":"cast","slot":"W","x":1}}'],
    ['empty name', '{"t":"create","v":2,"name":"   ","hero":"ranger"}'],
    ['long name', '{"t":"create","v":2,"name":"abcdefghijklmnopq","hero":"ranger"}'],
    ['control chars in name', '{"t":"create","v":2,"name":"a\\u0007b","hero":"ranger"}'],
    ['unknown hero', '{"t":"create","v":2,"name":"a","hero":"ninja"}'],
    ['bad room code', '{"t":"join","v":2,"code":"AB1DE","name":"a","hero":"ranger"}'],
    ['code with O', '{"t":"join","v":2,"code":"ABODE","name":"a","hero":"ranger"}'],
    ['bad token', '{"t":"rejoin","v":2,"code":"ABCDE","token":"nope"}'],
    ['non-boolean ready', '{"t":"ready","ready":"yes"}'],
    ['unknown mode', '{"t":"mode","mode":"endless"}'],
    ['mode with extra keys', '{"t":"mode","mode":"quick","waves":5}'],
    ['unknown difficulty', '{"t":"difficulty","difficulty":"nightmare"}'],
    ['difficulty with extra keys', '{"t":"difficulty","difficulty":"hard","hp":2}'],
    ['upgrade without a tower', '{"t":"cmd","cmd":{"type":"upgrade"}}'],
    ['upgrade with a string id', '{"t":"cmd","cmd":{"type":"upgrade","towerId":"7"}}'],
    ['upgrade with extra keys', '{"t":"cmd","cmd":{"type":"upgrade","towerId":7,"tier":3}}'],
    ['upgrade with an unknown branch', '{"t":"cmd","cmd":{"type":"upgrade","towerId":7,"branch":"laser"}}'],
    ['upgrade with a null branch', '{"t":"cmd","cmd":{"type":"upgrade","towerId":7,"branch":null}}'],
    ['sell with a branch', '{"t":"cmd","cmd":{"type":"sell","towerId":7,"branch":"sniper"}}'],
    ['unknown priority', '{"t":"cmd","cmd":{"type":"setPriority","towerId":7,"priority":"weakest"}}'],
    ['priority without a tower', '{"t":"cmd","cmd":{"type":"setPriority","priority":"first"}}'],
    ['create without a version', '{"t":"create","name":"a","hero":"ranger"}'],
    ['join with a string version', '{"t":"join","v":"2","code":"ABCDE","name":"a","hero":"ranger"}'],
    ['rejoin with a fractional version', '{"t":"rejoin","v":2.5,"code":"ABCDE","token":"0123456789abcdef0123456789abcdef"}'],
    ['gift of zero', '{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":0}}'],
    ['negative gift', '{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":-5}}'],
    ['fractional gift', '{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":2.5}}'],
    ['string gift amount', '{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":"50"}}'],
    ['huge gift', '{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":1e9}}'],
    ['gift without a recipient', '{"t":"cmd","cmd":{"type":"gift","amount":5}}'],
    ['gift to a non-id', '{"t":"cmd","cmd":{"type":"gift","to":"<p2>","amount":5}}'],
    ['gift with extra keys', '{"t":"cmd","cmd":{"type":"gift","to":"p2","amount":5,"from":"p3"}}'],
    ['free-text chat', '{"t":"cmd","cmd":{"type":"chat","text":"hello"}}'],
    ['ping with a message', '{"t":"cmd","cmd":{"type":"ping","x":1,"y":2,"text":"look"}}'],
    ['ping with one coordinate', '{"t":"cmd","cmd":{"type":"ping","x":1}}'],
    ['unknown emote', '{"t":"cmd","cmd":{"type":"emote","emote":"gg"}}'],
    ['emote that is a sentence', '{"t":"cmd","cmd":{"type":"emote","emote":"good game everyone"}}'],
    ['emote with extra text', '{"t":"cmd","cmd":{"type":"emote","emote":"help","text":"gg"}}'],
  ])('rejects %s', (_label, raw) => {
    expect(decodeClientMessage(raw)).toBeNull();
  });

  it('normalises names and room codes', () => {
    expect(decodeClientMessage('{"t":"join","v":2,"code":" abcde ","name":"  Ada   Lovelace ","hero":"ranger"}')).toEqual({
      t: 'join',
      v: 2,
      code: 'ABCDE',
      name: 'Ada Lovelace',
      hero: 'ranger',
    });
  });

  it('rejects oversized messages before parsing', () => {
    const raw = JSON.stringify({ t: 'cmd', cmd: { type: 'stop' }, pad: 'x'.repeat(MAX_CLIENT_MESSAGE_LENGTH) });
    expect(decodeClientMessage(raw)).toBeNull();
  });
});

describe('server message codec', () => {
  it('round-trips a welcome message', () => {
    const msg = { t: 'welcome', playerId: 'p1' } as const;
    expect(decodeServerMessage(encodeServerMessage(msg))).toEqual(msg);
  });

  it('round-trips the hello handshake', () => {
    const msg = { t: 'hello', v: PROTOCOL_VERSION } as const;
    expect(decodeServerMessage(encodeServerMessage(msg))).toEqual(msg);
    expect(decodeServerMessage('{"t":"hello"}')).toBeNull();
  });

  it('rejects garbage', () => {
    expect(decodeServerMessage('{"t":"snapshot"}')).toBeNull();
    expect(decodeServerMessage('oops')).toBeNull();
  });
});

describe('replay command encoding', () => {
  const commands: Command[] = [
    { type: 'move', x: 12.35, y: 30 },
    { type: 'attackMove', x: 1, y: 2.5 },
    { type: 'attack', targetId: 42 },
    { type: 'stop' },
    { type: 'callEarly' },
    { type: 'cast', slot: 'Q' },
    { type: 'cast', slot: 'R', x: 13, y: 20.25 },
    { type: 'learn', slot: 'E' },
    { type: 'build', padId: 3, tower: 'frost' },
    { type: 'sell', towerId: 9 },
    { type: 'upgrade', towerId: 9 },
    { type: 'upgrade', towerId: 9, branch: 'glacier' },
    { type: 'setPriority', towerId: 9, priority: 'strongest' },
    { type: 'gift', to: 'p2', amount: 100 },
    { type: 'ping', x: 4.25, y: 18 },
    { type: 'emote', emote: 'coming' },
  ];

  it('stores every command as a compact array and reads it back', () => {
    expect(encodeReplayCommand({ type: 'move', x: 12.35, y: 30 })).toEqual(['move', 12.35, 30]);
    for (const cmd of commands) expect(decodeReplayCommand(encodeReplayCommand(cmd))).toEqual(cmd);
  });

  it('rejects malformed entries like a malformed client command', () => {
    expect(decodeReplayCommand(['teleport', 1, 2])).toBeNull();
    expect(decodeReplayCommand(['move', 1])).toBeNull();
    expect(decodeReplayCommand(['move', 1, 2, 3])).toBeNull();
    expect(decodeReplayCommand(['build', 1, 'laser'])).toBeNull();
    expect(decodeReplayCommand(['toString'])).toBeNull();
    expect(decodeReplayCommand([])).toBeNull();
  });
});

describe('build labels', () => {
  it('keeps a git commit or a short tag and falls back to dev', () => {
    expect(normalizeBuild(' 9576be8f0c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a ')).toBe('9576be8f0c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a');
    expect(normalizeBuild('v1.2-rc_3')).toBe('v1.2-rc_3');
    for (const bad of [undefined, '', '   ', 'a b', '<script>', 'x'.repeat(65), 42]) expect(normalizeBuild(bad)).toBe('dev');
  });
});
