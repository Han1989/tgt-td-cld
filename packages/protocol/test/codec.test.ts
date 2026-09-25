import { describe, expect, it } from 'vitest';
import {
  MAX_CLIENT_MESSAGE_LENGTH,
  decodeClientMessage,
  decodeServerMessage,
  encodeClientMessage,
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
    { t: 'cmd', cmd: { type: 'build', padId: 3, tower: 'frost' } },
    { t: 'cmd', cmd: { type: 'sell', towerId: 7 } },
    { t: 'cmd', cmd: { type: 'callEarly' } },
    { t: 'restart' },
    { t: 'start' },
    { t: 'leave' },
    { t: 'create', name: 'Ada', hero: 'ranger' },
    { t: 'join', code: 'ABCDE', name: 'Bo', hero: 'ranger' },
    { t: 'rejoin', code: 'ZZZZZ', token: '0123456789abcdef0123456789abcdef' },
    { t: 'hero', hero: 'ranger' },
    { t: 'ready', ready: true },
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
    ['half a target point', '{"t":"cmd","cmd":{"type":"cast","slot":"W","x":1}}'],
    ['empty name', '{"t":"create","name":"   ","hero":"ranger"}'],
    ['long name', '{"t":"create","name":"abcdefghijklmnopq","hero":"ranger"}'],
    ['control chars in name', '{"t":"create","name":"a\\u0007b","hero":"ranger"}'],
    ['unknown hero', '{"t":"create","name":"a","hero":"ninja"}'],
    ['bad room code', '{"t":"join","code":"AB1DE","name":"a","hero":"ranger"}'],
    ['code with O', '{"t":"join","code":"ABODE","name":"a","hero":"ranger"}'],
    ['bad token', '{"t":"rejoin","code":"ABCDE","token":"nope"}'],
    ['non-boolean ready', '{"t":"ready","ready":"yes"}'],
  ])('rejects %s', (_label, raw) => {
    expect(decodeClientMessage(raw)).toBeNull();
  });

  it('normalises names and room codes', () => {
    expect(decodeClientMessage('{"t":"join","code":" abcde ","name":"  Ada   Lovelace ","hero":"ranger"}')).toEqual({
      t: 'join',
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

  it('rejects garbage', () => {
    expect(decodeServerMessage('{"t":"snapshot"}')).toBeNull();
    expect(decodeServerMessage('oops')).toBeNull();
  });
});
