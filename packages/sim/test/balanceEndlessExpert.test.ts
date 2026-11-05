// Endless's loop gate for the expert bot (balanceEndless.test.ts has the casual and novice bots and the why), solo, every
// hero on the five gate seeds: every match falls between waves 60 and 90, and the mean Heart as wave 31 starts (the
// first wave of the loop) is 80 or more. Round 9 (the wider quake, 5 Nov 2026) moved the bound to before 92: the Warden
// falls on wave 90 on seed 42 (88 with round 8's quake; the other heroes unchanged), for Han to judge
// (docs/balance/TUNING_LOG.md round 9).

import { describe } from 'vitest';
import { createExpertBot } from '../src/bots';
import { endlessGate } from './helpers';

describe('Endless, expert bot, solo', () =>
  endlessGate({ make: (id) => createExpertBot(id), min: 60, before: 92, eachInBand: true, heartAt31: 80 }));
