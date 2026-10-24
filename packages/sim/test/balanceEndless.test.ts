// Endless's loop gate (docs/GAME_DESIGN.md "Endless"; Han, 22 Oct 2026, retuned with veteran levels and Reinforce after
// his match of 24 Oct 2026), solo, every hero on the five gate seeds. Past wave 30 the hero and the gold keep pace with
// the waves, so a strong player climbs a long way: the expert bot falls between waves 60 and 90 (every match inside it)
// and enters the loop with 80 Heart or more on the mean, the casual bot falls on 40–60 and the novice before wave 40.
// Each band is on the mean of the gate's 15 matches (a casual run that survives the first cycle limps on for 20 or 30
// waves with a few Heart, one that does not falls in it); every match must end in defeat. Tuned by `tuning.endless`,
// Endless's own Hard bands, `hero.veteran` and `reinforce` (docs/balance/TUNING_LOG.md round 6). The expert's matches
// are the slow ones, so it has a file of its own: balanceEndlessExpert.test.ts.

import { describe } from 'vitest';
import { createBalanceBot, createNoviceBot } from '../src/bots';
import { endlessGate } from './helpers';

describe('Endless, casual bot, solo', () => endlessGate({ make: (id) => createBalanceBot(id), min: 40, before: 60, eachInBand: false }));

describe('Endless, novice bot, solo', () => endlessGate({ make: (id) => createNoviceBot(id), min: 1, before: 40, eachInBand: false }));
