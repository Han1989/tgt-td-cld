// Room codes are 5 letters. The first letter is the server's shard letter
// and the other four are random, so a future lobby/router can tell which
// server hosts a room from the code alone (see docs/DEPLOY.md, "Room codes
// and scaling out").

import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from '@tdt/protocol';

export function isShardLetter(value: string): boolean {
  return value.length === 1 && ROOM_CODE_ALPHABET.includes(value);
}

/** The shard letter a room code routes to. */
export function shardOf(code: string): string {
  return code.charAt(0);
}

/**
 * A new code on `shard` that is not in `taken`. `random` returns [0, 1);
 * the server passes a crypto-backed source.
 */
export function generateRoomCode(shard: string, taken: (code: string) => boolean, random: () => number): string {
  if (!isShardLetter(shard)) throw new Error(`Invalid shard letter: ${shard}`);
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = shard;
    while (code.length < ROOM_CODE_LENGTH) code += ROOM_CODE_ALPHABET[Math.floor(random() * ROOM_CODE_ALPHABET.length)];
    if (!taken(code)) return code;
  }
  throw new Error('No free room codes');
}
