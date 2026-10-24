// Endless's loop gate for the expert bot (balanceEndless.test.ts has the casual and novice bots and the why), solo, every
// hero on the five gate seeds: every match falls between waves 60 and 90, and the mean Heart as wave 31 starts (the
// first wave of the loop) is 80 or more.

import { describe } from 'vitest';
import { createExpertBot } from '../src/bots';
import { endlessGate } from './helpers';

describe('Endless, expert bot, solo', () =>
  endlessGate({ make: (id) => createExpertBot(id), min: 60, before: 90, eachInBand: true, heartAt31: 80 }));
