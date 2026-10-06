// Scripted players for headless balance runs (and, from Phase 2, network
// load tests). Bots only read snapshots and static data and only act through
// commands, exactly like a human client.

import {
  TOWER_BRANCHES,
  type Command,
  type CreepKind,
  type CreepSnap,
  type HeroSnap,
  type HeroKind,
  type LaneId,
  type PlayerId,
  type SkillSlot,
  type SkillSnap,
  type Snapshot,
  type TargetPriority,
  type TowerBranch,
  type TowerKind,
  type TowerSnap,
} from '@tdt/protocol';
import { shieldStandPoint } from './coop';
import { mix32 } from './modifiers';
import { getMap, type BuildPad } from './map';
import { repairCost, tuningForMode, TUNING, type Tuning, type WaveGroup } from './tuning';
import { dist, type Vec2 } from './vec';

export interface Bot {
  playerId: PlayerId;
  /** Called a few times per second with the latest snapshot. */
  decide(snap: Snapshot): Command[];
}

/**
 * Casual is the balance bot the Normal gates use. Expert spends gold on fewer, branched towers. Novice plays like
 * the first-time players of playtest 2 (`docs/GAME_DESIGN.md` §13): half the towers early, gold left unspent, no
 * Flak until flyers have leaked, a quarter of its ready ultimates forgotten for a minute (Arrow Storm and Meteor are one press, so a new
 * player uses them), no retreat, no early calls, and it does not answer a teammate's ultimate.
 */
export type BotStyle = 'casual' | 'expert' | 'novice';

/** Never issues a command. Used to prove that an idle player loses. */
export function createIdleBot(playerId: PlayerId): Bot {
  return { playerId, decide: () => [] };
}

/** Target priority per tower kind. */
const PRIORITY: Record<TowerKind, TargetPriority> = {
  arrow: 'first',
  frost: 'first',
  cannon: 'strongest',
  arcane: 'strongest',
  flak: 'first',
};
/** Waves the bot reads ahead when it picks a branch (a choice for the rest of the match). */
const BRANCH_LOOKAHEAD = 5;
/** Shares of the coming creeps (by count) that make armour or flyers a need for branches. */
const ARMOUR_SHARE = 0.15;
const AIR_SHARE = 0.2;
type BranchNeed = 'boss' | 'armour' | 'air';
/**
 * Each tower kind's branch that answers a need of the wave list (the specialist) and its all-round one (late
 * waves are crowds). While the coming waves have that need, the team wants a few of the specialist.
 */
const BRANCH_ROLES: Record<TowerKind, { specialist: TowerBranch; general: TowerBranch; need: BranchNeed }> = {
  arrow: { specialist: 'sniper', general: 'volley', need: 'boss' },
  cannon: { specialist: 'shrapnel', general: 'mortar', need: 'armour' },
  frost: { specialist: 'glacier', general: 'blizzard', need: 'boss' },
  arcane: { specialist: 'void', general: 'prism', need: 'boss' },
  flak: { specialist: 'skyguard', general: 'hailstorm', need: 'air' },
};
/** Specialists of each branch a team wants while the coming waves need them. */
const SPECIALISTS_PER_NEED = 2;

/** A bot with nothing left to buy gifts its gold once it has at least this much. */
const MIN_GIFT = 100;

/** The build cycle; its Flak and Arcane slots become Arrow and Cannon while no coming wave needs them. */
const BUILD_CYCLE: TowerKind[] = ['arrow', 'frost', 'cannon', 'arcane', 'arrow', 'cannon', 'flak', 'arcane'];
/** Creeps with at least this much armour (or a Stone hide) call for magic damage. */
const ARMOURED = 4;
/** Waves the bot looks ahead when choosing towers (the current one included), like reading the wave list. */
const LOOKAHEAD = 3;
/** General towers a bot builds before it adds counters (Flak / Arcane). */
const MIN_GENERAL_TOWERS = 3;

/** Skills that only affect ground creeps (static knowledge, like a player would have). */
/** A rain is cast once this many creeps are on the lanes (the expert waits for a few more of them to be out). */
const RAIN_CREEPS = 12;
const EXPERT_RAIN_CREEPS = 12;
/** Answering a teammate's ultimate needs at least this many creeps out. */
const ANSWER_MIN_CREEPS = 6;
const GROUND_ONLY: Record<HeroKind, SkillSlot[]> = { ranger: ['W'], warden: [], arcanist: [] };
/** Creeps a skill should catch before the bot spends mana on it. */
const MIN_TARGETS: Record<SkillSlot, number> = { Q: 2, W: 3, E: 0, R: 3 };
/** Path distance up its lane (from the Heart) where a hero guards early on. */
const GUARD_DISTANCE = 9;
/**
 * From this share of the match on (Full: wave 12, Quick: wave 6), a hero with its ultimate plays forward
 * (earlier, it guards near the Heart).
 */
const FORWARD_FROM = 0.4;
/** How far up its lane (path distance from the Heart) a hero playing forward stands guard. */
const FORWARD_DISTANCE = 18;
/** A hero walks to creeps within this distance of its post (and shoots them on the way). */
const ENGAGE_RADIUS = 6;
/** A melee hero holds its post and lets creeps come (they aggro on it); it only steps out to closer ones. */
const MELEE_ENGAGE_RADIUS = 5;
/** A hero playing forward with its ultimate ready goes to groups within this distance of its post. */
const SEEK_RADIUS = 16;
/** In the final wave, heroes hunt the creeps that are left once there are this few. */
const STRAGGLERS = 5;
/** A ranged hero stops this much inside its attack range of the creep it walks to (its reach adds its own radius). */
const STANDOFF_MARGIN = 0.6;

/**
 * Novice: through this wave it spends only `NOVICE_EARLY_SPEND` of everything it has earned on towers and upgrades (match 1:
 * 3–6 towers each at wave 5 against the casual bot's 9–11, and about a third of the gold unspent). Wave 5 is the end of
 * Quick's first third; a Full match gets the same five slow waves, not ten.
 */
const NOVICE_EARLY_WAVES = 5;
const NOVICE_EARLY_SPEND = 0.5;
/** Novice: flyers that must have reached the Heart before it builds any Flak (or branches for air). */
const NOVICE_FLYER_LEAKS = 2;
/** Novice: the chance it casts a ready ultimate at a target; if it does not, it forgets it for this long. */
const NOVICE_ULT_CHANCE = 0.75;
const NOVICE_ULT_FORGET_SECONDS = 60;

/** Expert casts on a single creep; the casual bot waits for a group. */
const EXPERT_MIN_TARGETS: Record<SkillSlot, number> = { Q: 1, W: 1, E: 0, R: 1 };
/** Towers an expert puts down before it spends gold on tiers instead of more pads. */
const EXPERT_MIN_TOWERS = 8;
/** Share of this bot's pads it fills. The rest of the gold goes into tiers and branches (solo: 20 of 26). */
const EXPERT_PAD_FRACTION = 0.77;
/** Heart HP at or above which an expert will call the next wave (below this, it lets the timer run). */
const EXPERT_SAFE_HEART = 55;
/** Seconds the map must stay empty before an expert calls, so a wave still spawning is not stacked. */
const EXPERT_CLEAR_SECONDS = 1.5;
/** Seconds left on the timer below which the bonus is too small to call. */
const EXPERT_MIN_CALL_SECONDS = 6;
/** From this share of the match on, an expert branches tier-3 towers before it builds another pad. */
const EXPERT_BRANCH_FROM = 0.4;
/** Heart HP an expert wants before it calls a wave during the first third (the defence is still growing). */
const EXPERT_EARLY_HEART = 80;

/**
 * The expert balance bot: the same hero and the same read of the wave list as the casual balance bot, but it
 * plays like a strong player. It fills about three quarters of its pads and spends the rest of its gold on
 * tiers and branches, calls the next wave once the field has been clear and the Heart is healthy (the first
 * player only, so the bonus is not paid twice), casts Q, W and R on a single creep, and walks off sooner
 * when it is hurt.
 */
/** A first-time player: see `BotStyle`. */
export function createNoviceBot(playerId: PlayerId, baseTuning: Tuning = TUNING, botIndex = 0): Bot {
  return createBalanceBot(playerId, baseTuning, botIndex, 'novice');
}

export function createExpertBot(playerId: PlayerId, baseTuning: Tuning = TUNING, botIndex = 0): Bot {
  return createBalanceBot(playerId, baseTuning, botIndex, 'expert');
}

/**
 * A sensible-build bot for any hero and team size. It builds on its own zone's pads (and on open pads),
 * best pads first, cycling through the towers and reading the coming waves (a Flak before Wisps, an
 * Arcane before Brutes and armour-shifting bosses); once none of its pads is free it upgrades its
 * lowest-tier towers, Arcane first before a Stone-hide boss. Cannon and Arcane target the Strongest
 * creep, and every tower focuses a boss in range. Its hero plays like a joystick player: it only walks
 * (heroes shoot while they move) — to creeps near its post, and in later waves, once it has its
 * ultimate, to a post further up its zone's lane and to groups to use it on. It hunts a live boss,
 * retreats when hurt, learns skills and casts them on groups.
 */
export function createBalanceBot(
  playerId: PlayerId,
  baseTuning: Tuning = TUNING,
  botIndex = 0,
  style: BotStyle = 'casual',
): Bot {
  const pads = rankPads(baseTuning);
  const padRank = new Map(pads.map((p, i) => [p.id, i]));
  let posts: { guard: Vec2; forward: Vec2 } | null = null;
  let retreating = false;
  let lastGoal: Vec2 | null = null;
  let lastMoveTick = -Infinity;
  // The numbers of the match's mode (its wave list, income…), known once the first snapshot names it.
  let modeTuning: Tuning | null = null;
  /** Tick the map last became empty, for the expert's call-early check; -1 while creeps are up. */
  let clearSince = -1;
  /** Wave number this bot already gifted for, so a surge announcement pays once. */
  let surgeGifted = -1;
  const novice = style === 'novice';
  /** Novice: flying creeps seen near the Heart last decision, and how many have since vanished (leaked). */
  let nearHeartFlyers = new Set<number>();
  let flyerLeaks = 0;
  /** Novice: the tick before which it has forgotten about its ultimate. */
  let ultForgottenUntil = -1;
  /** Tick of this bot's last repair: players do not watch every tower, so it repairs one at a time (`REPAIR_EVERY`). */
  let lastRepairTick = -Infinity;
  const repairReady = (snap: Snapshot): boolean =>
    style !== 'novice' && snap.tick - lastRepairTick >= REPAIR_EVERY[style] * snap.tickRate;

  return {
    playerId,
    decide(snap) {
      const tuning = (modeTuning ??= tuningForMode(baseTuning, snap.mode));
      const cmds: Command[] = [];
      const me = snap.players.find((p) => p.id === playerId);
      const hero = me && snap.heroes.find((h) => h.id === me.heroId);
      if (!me || !hero) return cmds;
      posts ??= heroPosts(snap, playerId, botIndex);

      // Skills: the ultimate as soon as it unlocks, otherwise the lowest-ranked skill (Q first).
      if (hero.skillPoints > 0) {
        const learnable = hero.skills.filter((s) => s.learnable);
        const pick = learnable.find((s) => s.slot === 'R') ?? [...learnable].sort((a, b) => a.rank - b.rank)[0];
        if (pick) cmds.push({ type: 'learn', slot: pick.slot });
      }

      // Towers: the next kind for the coming waves, on the best free pad of its zone (or an open one).
      let gold = me.gold;
      const taken = new Set(snap.towers.map((t) => t.padId));
      const usable = new Set(snap.pads.filter((p) => p.owner === playerId || p.owner === null).map((p) => p.id));
      const mine = snap.towers.filter((t) => t.owner === playerId);
      const kinds = mine.map((t) => t.kind);
      const team = new Set(snap.towers.map((t) => t.kind));
      const needs = waveNeeds(tuning, snap.wave);
      if (novice) {
        const heartPos = getMap().heart;
        const now = new Set(
          snap.creeps.filter((c) => tuning.creeps[c.kind].flying && dist(c.x, c.y, heartPos.x, heartPos.y) <= 4).map((c) => c.id),
        );
        const stillThere = new Set(snap.creeps.map((c) => c.id));
        for (const id of nearHeartFlyers) if (!stillThere.has(id)) flyerLeaks++;
        nearHeartFlyers = now;
        if (flyerLeaks < NOVICE_FLYER_LEAKS) needs.air = false;
        // Spending: half of what it has earned through the first waves, everything after.
        const earned = gold + mine.reduce((n, t) => n + t.spent, 0);
        const spent = earned - gold;
        if (snap.wave <= NOVICE_EARLY_WAVES) gold = Math.max(0, Math.min(gold, NOVICE_EARLY_SPEND * earned - spent));
      }
      const free = pads.filter((p) => usable.has(p.id) && !taken.has(p.id));
      const bosses = snap.creeps.filter((c) => tuning.creeps[c.kind].boss);
      // A surge announced a wave ahead (or already walking): the thin lane gets the next pad.
      const focusLane = snap.nextSurge?.lane ?? snap.surgeLane;
      // The expert's pad plan is already tight. Pulling a pad onto the surge lane, gifting, or
      // walking over moved Hard gate seeds out of 40–80 Heart. The casual bot does all three.
      if (focusLane != null && style === 'casual') biasSurgePad(free, mine, focusLane);
      if (style === 'expert') {
        gold = spendExpert(cmds, snap, tuning, playerId, gold, padRank, free, kinds, team, needs, bosses);
        if (repairReady(snap)) {
          const spent = spendRepair(cmds, mine, tuning, gold);
          if (spent > 0) lastRepairTick = snap.tick;
          gold -= spent;
        }
      } else {
        for (;;) {
          const kind = nextTower(needs, kinds, team);
          const cost = tuning.towers[kind].tiers[0]!.cost;
          const pad = free.shift();
          if (!pad || gold < cost) break;
          cmds.push({ type: 'build', padId: pad.id, tower: kind });
          gold -= cost;
          kinds.push(kind);
          team.add(kind);
        }
        // Cannon and Arcane towers go for the Strongest creep, and every tower focuses a boss in its range,
        // so bosses and Brutes that stop to hit towers don't get ignored behind a stream of fresher creeps.
        for (const t of mine) {
          const focus = bosses.some((b) => dist(b.x, b.y, t.x, t.y) <= t.range);
          const want = focus ? 'strongest' : PRIORITY[t.kind];
          if (t.priority !== want) cmds.push({ type: 'setPriority', towerId: t.id, priority: want });
        }
        // None of its pads is free: upgrade the lowest-tier towers first, best pads first; Arcane first while
        // a boss with a Stone hide is coming (magic damage ignores its armour). Past tier 3 each tower takes the
        // branch the coming waves and the team's branches call for: the late-game gold sink.
        if (free.length === 0) {
          gold = spendUpgrades(
            cmds,
            gold,
            mine,
            tuning,
            needs,
            snap.wave,
            padRank,
            snap.towers.flatMap((t) => (t.branch ? [t.branch] : [])),
            novice && flyerLeaks < NOVICE_FLYER_LEAKS,
          );
        }
        // What is left after the purchases repairs a tower under half HP, one at a time. A novice never repairs.
        if (repairReady(snap)) {
          const spent = spendRepair(cmds, mine, tuning, gold);
          if (spent > 0) lastRepairTick = snap.tick;
          gold -= spent;
        }

        // Nothing left to buy (every pad taken, every tower branched; a small zone gets there first): the gold
        // goes to the teammate with the most upgrades still to buy, so the whole team's gold ends up in towers.
        if (!novice && free.length === 0 && mine.length > 0 && mine.every((t) => t.branch) && gold >= MIN_GIFT) {
          const to = neediestTeammate(snap, playerId, tuning);
          if (to) {
            const amount = Math.floor(gold);
            cmds.push({ type: 'gift', to, amount });
            gold -= amount;
          }
        }
      }

      if (style === 'casual') surgeGifted = giftForSurge(cmds, snap, playerId, gold, surgeGifted);

      // The first player calls for the team: the bonus is paid to everyone, and a second call the same
      // tick would pay it again.
      if (style === 'expert' && snap.players[0]?.id === playerId) {
        if (snap.creeps.length === 0) {
          if (clearSince < 0) clearSince = snap.tick;
        } else clearSince = -1;
        const secondsLeft = snap.nextWaveIn < 0 ? 0 : snap.nextWaveIn / snap.tickRate;
        const clearFor = clearSince < 0 ? 0 : (snap.tick - clearSince) / snap.tickRate;
        const mineCount = snap.towers.filter((t) => t.owner === playerId).length;
        const firstThird = snap.wave <= Math.ceil(snap.totalWaves / 3);
        if (
          snap.wave >= 1 &&
          snap.nextWaveIn >= 0 &&
          mineCount >= EXPERT_MIN_TOWERS &&
          clearFor >= EXPERT_CLEAR_SECONDS &&
          secondsLeft >= EXPERT_MIN_CALL_SECONDS &&
          snap.heartHp >= (firstThird ? EXPERT_EARLY_HEART : EXPERT_SAFE_HEART)
        ) {
          cmds.push({ type: 'callEarly' });
        }
      }

      if (!hero.alive) return cmds;

      // Hero: retreat to the Heart when hurt (shooting on the way), otherwise walk to where it is needed.
      const expert = style === 'expert';
      const hpFrac = hero.hp / hero.maxHp;
      const ranged = tuning.hero[hero.kind].ranged;
      // Casual: 30% / 60%. Expert leaves earlier and comes back healthier, melee sooner than ranged.
      const retreatLow = expert ? (ranged ? 0.54 : 0.65) : ranged ? 0.3 : 0.4;
      const retreatHigh = expert ? (ranged ? 0.85 : 0.9) : ranged ? 0.6 : 0.7;
      // A novice never retreats: it lets its hero die.
      if (hpFrac < retreatLow && !novice) retreating = true;
      if (hpFrac > retreatHigh) retreating = false;
      if (expert) {
        let packed = 0;
        for (const c of snap.creeps) if (dist(hero.x, hero.y, c.x, c.y) <= 2.2) packed++;
        if (packed >= 3 && hpFrac < 0.72) retreating = true;
      }
      const skill = (slot: SkillSlot) => hero.skills.find((s) => s.slot === slot);
      const r = skill('R');
      const later = r !== undefined && r.rank > 0 && snap.wave >= Math.round(FORWARD_FROM * snap.totalWaves);
      const post = later ? posts.forward : posts.guard;
      // Where the hero goes, most urgent first: the Heart when hurt; a live boss; in the final wave, the last
      // few creeps (one parked out of the towers' reach, e.g. an Archer shooting an air-only Flak, would keep
      // the match from ending); in later waves with its ultimate ready, the biggest group near its post; the
      // creep nearest its post; otherwise the post itself.
      const straggler =
        snap.nextWaveIn < 0 && snap.creeps.length <= STRAGGLERS ? nearest(snap.creeps, hero) : undefined;
      const ultReady = later && r.cooldown === 0;
      const groundOnlyR = GROUND_ONLY[hero.kind].includes('R');
      // Iron Vow's burst is around the Warden: he walks into a pack so the burst, Cleave and Taunt connect.
      const ultRadius = r !== undefined ? r.radius : 0;
      const hittable = snap.creeps;
      const nearPost = (radius: number) => hittable.filter((c) => dist(c.x, c.y, post.x, post.y) <= radius);
      // Arrow Storm and Meteor rain on every lane wherever the hero stands: only the Warden's burst needs a pack.
      const group = ultReady && hero.kind === 'warden'
        ? densestGroup(nearPost(SEEK_RADIUS), ultRadius, groundOnlyR, tuning, expert ? 2 : MIN_TARGETS.R)
        : undefined;
      const closest = nearest(nearPost(ranged ? ENGAGE_RADIUS : MELEE_ENGAGE_RADIUS), post);
      // A shielded boss takes no damage until two lanes hit it. Standing at the Heart lets it
      // walk the map, so the tag wins over retreat. A melee expert still will not step onto an
      // unshielded boss while hurt.
      const shieldedBoss = bosses.find((b) => b.shield && b.shield !== 'off');
      // Hurt casual bots otherwise sit on the Heart, and the shielded boss walks the map immune.
      if (shieldedBoss) retreating = false;
      const diveBoss = shieldedBoss
        ? shieldedBoss
        : bosses[0] && !(expert && !ranged && hpFrac < 0.75)
          ? bosses[0]
          : undefined;
      const target = diveBoss ?? straggler ?? group ?? closest;
      // Wave-10 shield: stand just outside the Mid ribbon so this hit counts as a side lane
      // while Mid-zone towers count as Mid. Once the shield drops, the usual standoff resumes.
      const shieldSide: -1 | 1 = snap.players.length >= 3 && botIndex === 2 ? 1 : snap.players.length === 2 && botIndex === 1 ? 1 : -1;
      const stand =
        diveBoss && diveBoss.shield && diveBoss.shield !== 'off'
          ? shieldStandPoint(diveBoss, shieldSide, ranged ? hero.attackRange : hero.attackRange + 1.4)
          : null;
      const heart = getMap().heroSpawn;
      // Own lane is clear during a surge: walk over and help. A creep near the post keeps the hero home.
      // Swift creeps outrun a hero that leaves its lane. Stay on the post unless the map is quiet.
      const surgeHelp =
        style !== 'expert' &&
        snap.surgeLane != null &&
        !snap.modifiers.includes('swift') &&
        nearPost(ranged ? ENGAGE_RADIUS : MELEE_ENGAGE_RADIUS).length === 0
          ? lanePoint(snap.surgeLane, GUARD_DISTANCE)
          : null;
      const goal = retreating
        ? { x: heart.x, y: heart.y + 1 }
        : stand
          ? stand
          : target
            ? standoff(hero, ranged, target, expert ? 0.15 : STANDOFF_MARGIN)
            : (surgeHelp ?? post);
      const moved = lastGoal === null || dist(goal.x, goal.y, lastGoal.x, lastGoal.y) > 1;
      if (dist(hero.x, hero.y, goal.x, goal.y) > 0.5 && (moved || snap.tick - lastMoveTick > 40)) {
        cmds.push({ type: 'move', x: goal.x, y: goal.y });
        lastGoal = goal;
        lastMoveTick = snap.tick;
      }
      // The casual bot runs home without casting. The expert still casts (Iron Vow, a trap, a shot) on the way.
      if (retreating && !expert) return cmds;

      const near = (range: number, ground: boolean): CreepSnap[] =>
        snap.creeps.filter(
          (c) => dist(hero.x, hero.y, c.x, c.y) <= range && (!ground || !tuning.creeps[c.kind].flying),
        );
      // Like a player: ultimate, Q and W each go off on a group whenever they are ready and affordable.
      const mins = expert ? EXPERT_MIN_TARGETS : MIN_TARGETS;
      let mana = hero.mana;
      /** A novice casts a ready ultimate about three times in four; otherwise it forgets it for a minute. */
      const novicePass = (): boolean => {
        if (!novice) return false;
        if (snap.tick < ultForgottenUntil) return true;
        if (mix32(snap.tick, botIndex * 7 + 1) / 4294967296 < NOVICE_ULT_CHANCE) return false;
        ultForgottenUntil = snap.tick + NOVICE_ULT_FORGET_SECONDS * snap.tickRate;
        return true;
      };
      for (const slot of ['R', 'Q', 'W'] as const) {
        const s = skill(slot);
        if (!s || s.rank === 0 || s.passive || s.cooldown > 0 || mana < s.manaCost) continue;
        // A player answers a teammate's ultimate (inside the combo window) so the two fuse.
        if (slot === 'R' && !novice && snap.creeps.length >= ANSWER_MIN_CREEPS && teammateUltimateJustCast(snap, hero)) {
          cmds.push({ type: 'cast', slot: 'R' });
          continue;
        }
        if (slot === 'R' && hero.kind === 'warden') {
          // Heals the whole team and bursts around him: cast when a pack is on the Warden, a boss is close,
          // or he or a teammate is hurt.
          const pack = near(s.radius, false).length >= mins.R;
          const bossNear = bosses.some((b) => dist(hero.x, hero.y, b.x, b.y) <= 8);
          const hurt = snap.heroes.some((h) => h.alive && h.hp / h.maxHp < (h.id === hero.id ? 0.55 : 0.45));
          if ((pack || bossNear || hurt) && !novicePass()) cmds.push({ type: 'cast', slot: 'R' });
          continue;
        }
        if (slot === 'R') {
          // A rain: cast it when the lanes are full of creeps, wherever the hero is.
          const minCreeps = expert ? EXPERT_RAIN_CREEPS : RAIN_CREEPS;
          // A player holds it a few seconds for a teammate whose ultimate is about to be ready: together they combo.
          if (snap.creeps.length >= minCreeps && !teammateUltimateSoon(snap, hero) && !novicePass()) {
            cmds.push({ type: 'cast', slot: 'R' });
          }
          continue;
        }
        const ground = GROUND_ONLY[hero.kind].includes(slot);
        const cmd = skillCommand(s, near(Math.max(s.range, s.radius), ground), hero, mins[slot]);
        if (!cmd) continue;
        cmds.push(cmd);
        mana -= s.manaCost;
      }
      return cmds;
    },
  };
}

interface PlannedTower {
  id: number;
  kind: TowerKind;
  tier: number;
  branch: TowerBranch | null;
  padId: number;
  x: number;
  y: number;
  range: number;
  priority: TargetPriority;
}

/**
 * Expert economy: a base of towers, then tiers before more pads, then branches from the middle of the
 * match on, stopping once `EXPERT_PAD_FRACTION` of the pads are filled. Returns the gold left.
 */
function spendExpert(
  cmds: Command[],
  snap: Snapshot,
  tuning: Tuning,
  playerId: PlayerId,
  goldStart: number,
  padRank: Map<number, number>,
  free: BuildPad[],
  kinds: TowerKind[],
  team: Set<TowerKind>,
  needs: { air: boolean; armour: boolean; stone: boolean },
  bosses: CreepSnap[],
): number {
  let gold = goldStart;
  const mine: PlannedTower[] = snap.towers
    .filter((t) => t.owner === playerId)
    .map((t) => ({
      id: t.id,
      kind: t.kind,
      tier: t.tier,
      branch: t.branch,
      padId: t.padId,
      x: t.x,
      y: t.y,
      range: t.range,
      priority: t.priority,
    }));
  const owned = mine.length + free.length;
  // Solo owns the whole map: the pads farthest from the lanes are a poor buy (about 20 of 26), and the
  // gold goes into tiers and branches. A lane zone is already that slice, so fill it — a hole there leaks —
  // but only after the towers it has are tiered and branched. Spreading that gold across every pad first
  // leaves a physical pair one branch short of the late waves.
  const zone = owned < 20;
  const cap = zone ? owned : Math.max(EXPERT_MIN_TOWERS, Math.floor(owned * EXPERT_PAD_FRACTION));
  const teamBranches = snap.towers.flatMap((t) => (t.branch ? [t.branch] : []));
  const branchNeed = branchNeeds(tuning, snap.wave);
  const branchFrom = Math.round(EXPERT_BRANCH_FROM * snap.totalWaves);

  for (const t of mine) {
    const focus = bosses.some((b) => dist(b.x, b.y, t.x, t.y) <= t.range);
    const want = focus ? 'strongest' : PRIORITY[t.kind];
    if (t.priority !== want) cmds.push({ type: 'setPriority', towerId: t.id, priority: want });
  }

  const rank = (t: PlannedTower) => padRank.get(t.padId) ?? 0;
  const buildNext = (): boolean => {
    if (kinds.length >= cap) return false;
    const kind = nextTower(needs, kinds, team);
    const cost = tuning.towers[kind].tiers[0]!.cost;
    const pad = free[0];
    if (!pad || gold < cost) return false;
    cmds.push({ type: 'build', padId: pad.id, tower: kind });
    gold -= cost;
    kinds.push(kind);
    team.add(kind);
    free.shift();
    return true;
  };
  const cheapest = (): { t: PlannedTower; branch: TowerBranch | null; cost: number } | null => {
    const order = mine.filter((t) => !t.branch).sort((a, b) => {
      const stoneFirst = (t: PlannedTower) =>
        needs.stone && t.kind === 'arcane' && t.tier < tuning.towers.arcane.tiers.length ? 0 : 1;
      return stoneFirst(a) - stoneFirst(b) || a.tier - b.tier || rank(a) - rank(b);
    });
    for (const t of order) {
      const next = tuning.towers[t.kind].tiers[t.tier];
      if (!next && kinds.length < EXPERT_MIN_TOWERS) continue;
      const branch = next ? null : pickBranch(t.kind, branchNeed, teamBranches, 1);
      const cost = next ? next.cost : tuning.branches[branch!].cost;
      if (gold >= cost) return { t, branch, cost };
    }
    return null;
  };
  const readyBranch = (): { t: PlannedTower; branch: TowerBranch; cost: number } | null => {
    if (kinds.length < EXPERT_MIN_TOWERS || snap.wave < branchFrom) return null;
    let best: PlannedTower | undefined;
    for (const t of mine) {
      if (t.branch || t.tier < tuning.towers[t.kind].tiers.length) continue;
      if (!best || rank(t) < rank(best)) best = t;
    }
    if (!best) return null;
    const branch = pickBranch(best.kind, branchNeed, teamBranches, 1);
    const cost = tuning.branches[branch].cost;
    return gold >= cost ? { t: best, branch, cost } : null;
  };
  const apply = (u: { t: PlannedTower; branch: TowerBranch | null; cost: number }) => {
    cmds.push(u.branch ? { type: 'upgrade', towerId: u.t.id, branch: u.branch } : { type: 'upgrade', towerId: u.t.id });
    gold -= u.cost;
    if (u.branch) {
      u.t.branch = u.branch;
      teamBranches.push(u.branch);
    } else u.t.tier += 1;
  };

  for (let n = 0; n < 48; n++) {
    if (kinds.length < EXPERT_MIN_TOWERS && buildNext()) continue;
    if (kinds.length >= EXPERT_MIN_TOWERS) {
      const up = cheapest();
      if (up && !up.branch && up.t.tier === 1) {
        apply(up);
        continue;
      }
    }
    const branched = readyBranch();
    if (branched) {
      apply(branched);
      continue;
    }
    // Lane zone, from the middle of the match: take the towers you have up a tier before another pad,
    // and hold gold that is already most of a branch instead of opening a pad with it.
    if (zone && snap.wave >= branchFrom) {
      const up = cheapest();
      if (up && !up.branch) {
        apply(up);
        continue;
      }
    }
    if (buildNext()) continue;
    const up = cheapest();
    if (up) {
      apply(up);
      continue;
    }
    break;
  }

  const filled = kinds.length >= cap || free.length === 0;
  const builtThisTick = kinds.length > mine.length;
  if (filled && !builtThisTick && mine.length > 0 && mine.every((t) => t.branch) && gold >= MIN_GIFT) {
    const to = neediestTeammate(snap, playerId, tuning);
    if (to) {
      const amount = Math.floor(gold);
      cmds.push({ type: 'gift', to, amount });
      gold -= amount;
    }
  }
  return gold;
}

/**
 * The connected teammate with the most gold still to spend on upgrading their towers (tiers left, then the
 * cheaper branch), or undefined when nobody has anything left to buy.
 */
function neediestTeammate(snap: Snapshot, playerId: PlayerId, tuning: Tuning): PlayerId | undefined {
  let best: PlayerId | undefined;
  let most = 0;
  for (const p of snap.players) {
    if (p.id === playerId || !p.connected) continue;
    let left = 0;
    for (const t of snap.towers) {
      if (t.owner !== p.id || t.branch) continue;
      const tiers = tuning.towers[t.kind].tiers;
      for (let i = t.tier; i < tiers.length; i++) left += tiers[i]!.cost;
      left += Math.min(...TOWER_BRANCHES[t.kind].map((b) => tuning.branches[b].cost));
    }
    left -= p.gold;
    if (left > most) {
      best = p.id;
      most = left;
    }
  }
  return best;
}

/**
 * Where a hero walks to fight `target`: a melee hero onto it; a ranged hero to a point just inside its
 * attack range, on the side facing the hero.
 */
function standoff(
  hero: { x: number; y: number; attackRange: number },
  ranged: boolean,
  target: Vec2,
  margin = STANDOFF_MARGIN,
): Vec2 {
  if (!ranged) return { x: target.x, y: target.y };
  const d = dist(hero.x, hero.y, target.x, target.y);
  const keep = Math.max(1, hero.attackRange - margin);
  if (d <= keep) return { x: hero.x, y: hero.y };
  return { x: target.x + ((hero.x - target.x) / d) * keep, y: target.y + ((hero.y - target.y) / d) * keep };
}

/**
 * The guard and forward posts of a bot's hero, up the lane of its zone. Solo and in pairs, the hero guards
 * where the lanes converge all match (solo on Mid; a pair on West and East). With 3 players each lane zone
 * has its own hero, which plays forward in later waves.
 */
function heroPosts(snap: Snapshot, playerId: PlayerId, botIndex: number): { guard: Vec2; forward: Vec2 } {
  const n = snap.players.length;
  const found = snap.players.findIndex((p) => p.id === playerId);
  const i = found >= 0 ? found : botIndex;
  if (n <= 2) {
    const guard = lanePoint(n === 1 ? 1 : i === 0 ? 0 : 2, GUARD_DISTANCE);
    return { guard, forward: guard };
  }
  return { guard: lanePoint(i, GUARD_DISTANCE), forward: lanePoint(i, FORWARD_DISTANCE) };
}

/** A rain waits at most this long (seconds) for a teammate's ultimate that is coming off cooldown. */
const COMBO_WAIT_SECONDS = 25;

/** Whether a living teammate of another hero kind has its ultimate coming off cooldown within `COMBO_WAIT_SECONDS`. */
function teammateUltimateSoon(snap: Snapshot, hero: HeroSnap): boolean {
  for (const h of snap.heroes) {
    if (h.owner === hero.owner || !h.alive || h.kind === hero.kind) continue;
    const r = h.skills.find((sk) => sk.slot === 'R');
    if (r && r.rank > 0 && r.cooldown > 0 && r.cooldown <= COMBO_WAIT_SECONDS * snap.tickRate && r.cooldownTotal - r.cooldown > 5 * snap.tickRate) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a teammate's ultimate went off a moment ago, inside the combo window, and is still waiting for an answer:
 * casting this hero's own now fuses the two into a combo (see `docs/GAME_DESIGN.md` §13). Every pair of the three
 * ultimates is a combo, so any teammate's R counts; the cast is answered for about the first 4 s of the window.
 */
function teammateUltimateJustCast(snap: Snapshot, hero: HeroSnap): boolean {
  const window = 4 * snap.tickRate;
  for (const h of snap.heroes) {
    if (h.owner === hero.owner || !h.alive || h.kind === hero.kind) continue;
    const r = h.skills.find((sk) => sk.slot === 'R');
    if (r && r.rank > 0 && r.cooldown > 0 && r.cooldownTotal - r.cooldown <= window) return true;
  }
  return false;
}

/** A cast of `skill` that catches at least `min` of `creeps`, or null. */
export function skillCommand(skill: SkillSnap, creeps: CreepSnap[], hero: { x: number; y: number }, min: number): Command | null {
  if (!skill.targeted) {
    // Self-centred skills (and Multishot, whose range is its reach).
    const reach = Math.max(skill.range, skill.radius);
    const count = creeps.filter((c) => dist(hero.x, hero.y, c.x, c.y) <= reach).length;
    return count >= min ? { type: 'cast', slot: skill.slot } : null;
  }
  // Point skills: aim at the creep with the most others within the radius.
  let best: CreepSnap | undefined;
  let bestCount = min - 1;
  for (const c of creeps) {
    if (dist(hero.x, hero.y, c.x, c.y) > skill.range) continue;
    const count = creeps.filter((o) => dist(o.x, o.y, c.x, c.y) <= skill.radius).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best ? { type: 'cast', slot: skill.slot, x: best.x, y: best.y } : null;
}

/**
 * Puts the best free pad on `lane` first when that lane has fewer of this bot's towers than the other
 * lanes do. One pad per decision, so a surge pulls the next build without emptying the rest of the zone.
 */
function biasSurgePad(free: BuildPad[], mine: { padId: number }[], lane: LaneId): void {
  const byId = new Map(getMap().pads.map((p) => [p.id, p]));
  const towersOn = (l: LaneId) => mine.filter((t) => byId.get(t.padId)?.lane === l).length;
  const others = ([0, 1, 2] as LaneId[]).filter((l) => l !== lane);
  let otherTowers = 0;
  for (const l of others) otherTowers += towersOn(l);
  const avg = otherTowers / others.length;
  if (towersOn(lane) >= avg) return;
  const idx = free.findIndex((p) => p.lane === lane);
  if (idx > 0) {
    const [pad] = free.splice(idx, 1);
    if (pad) free.unshift(pad);
  }
}

/** Who owns the most pads on `lane` (the zone the surge lands on), or null in a solo match with open pads. */
function surgeLaneOwner(snap: Snapshot, lane: LaneId): PlayerId | null {
  const counts = new Map<PlayerId, number>();
  for (const pad of getMap().pads) {
    if (pad.lane !== lane) continue;
    const owner = snap.pads.find((p) => p.id === pad.id)?.owner ?? null;
    if (!owner) continue;
    counts.set(owner, (counts.get(owner) ?? 0) + 1);
  }
  let best: PlayerId | null = null;
  let n = 0;
  for (const [id, c] of counts) {
    if (c > n) {
      best = id;
      n = c;
    }
  }
  return best;
}

/**
 * Once per announced surge, a teammate sends up to 20 gold to the lane's owner and keeps enough for a tower.
 * Returns the wave this bot has finished considering (so it does not pay twice).
 */
function giftForSurge(cmds: Command[], snap: Snapshot, playerId: PlayerId, gold: number, giftedWave: number): number {
  const upcoming = snap.nextSurge;
  if (!upcoming || upcoming.wave === giftedWave || snap.players.length < 2) return giftedWave;
  const owner = surgeLaneOwner(snap, upcoming.lane);
  if (!owner || owner === playerId) return upcoming.wave;
  const amount = Math.min(20, Math.floor(gold - 60));
  if (amount < 20) return giftedWave;
  cmds.push({ type: 'gift', to: owner, amount });
  return upcoming.wave;
}

/** Below this share of its HP, a casual or expert bot repairs a tower (with the gold left after its purchases). */
const REPAIR_BELOW = 0.5;
/**
 * Seconds between a bot's repairs. Set from play, not from the balance gates: Han (an expert, on a phone) repaired
 * about once every 50 s in a Quick match with the sell-and-rebuild workaround and still lost 6 towers. An expert with
 * a Repair button is quicker than that, a casual player slower. The novice never repairs.
 */
const REPAIR_EVERY: Record<'casual' | 'expert', number> = { expert: 15, casual: 30 };

/**
 * Repairs the most damaged of this bot's towers under `REPAIR_BELOW` of their HP that it can pay for. Returns the gold
 * spent (0 if none).
 */
function spendRepair(cmds: Command[], mine: TowerSnap[], tuning: Tuning, gold: number): number {
  const hurt = mine.filter((t) => t.hp < t.maxHp * REPAIR_BELOW).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
  for (const t of hurt) {
    const cost = repairCost(tuning, t);
    if (gold < cost) continue;
    cmds.push({ type: 'repair', towerId: t.id });
    return cost;
  }
  return 0;
}

/** Pads ordered by how much lane (and wisp flight line) they cover. `rangeScale` is Fog's shorter reach. */
function rankPads(tuning: Tuning): BuildPad[] {
  const map = getMap();
  const range = Math.min(...Object.values(tuning.towers).map((t) => t.tiers[0]!.range));
  const samples: { x: number; y: number }[] = [];
  for (const lane of map.lanes) {
    for (let i = 0; i < lane.waypoints.length - 1; i++) {
      const a = lane.waypoints[i]!;
      const b = lane.waypoints[i + 1]!;
      const len = dist(a.x, a.y, b.x, b.y);
      for (let s = 0; s < len; s += 0.5) samples.push({ x: a.x + ((b.x - a.x) * s) / len, y: a.y + ((b.y - a.y) * s) / len });
    }
    // Wisps fly straight from the portal to the Heart.
    const portal = lane.waypoints[0]!;
    const len = dist(portal.x, portal.y, map.heart.x, map.heart.y);
    for (let s = 0; s < len; s += 1) {
      samples.push({ x: portal.x + ((map.heart.x - portal.x) * s) / len, y: portal.y + ((map.heart.y - portal.y) * s) / len });
    }
  }
  const score = (p: BuildPad) => samples.filter((s) => dist(p.x, p.y, s.x, s.y) <= range).length;
  return [...map.pads].sort((a, b) => score(b) - score(a) || a.id - b.id);
}

/** The wave lists of the current wave and the next ones (before wave 1: the first waves). */
function comingWaves(tuning: Tuning, wave: number): WaveGroup[][] {
  const first = Math.max(0, wave - 1);
  return tuning.waves.list.slice(first, first + LOOKAHEAD);
}

/** Shifting Hide (Stone ↔ Ether armour) is static knowledge of a boss kind, like its name on the wave list. */
function hasStoneHide(tuning: Tuning, kind: CreepKind): boolean {
  const abilities: object | undefined = (tuning.bosses as Partial<Record<CreepKind, object>>)[kind];
  return tuning.creeps[kind].boss && abilities !== undefined && 'shiftingHide' in abilities;
}

/** What the coming waves call for: Flak for flyers, Arcane for armour; `stone`: a Stone-hide boss is coming. */
function waveNeeds(tuning: Tuning, wave: number): { air: boolean; armour: boolean; stone: boolean } {
  const groups = comingWaves(tuning, wave).flat();
  const stone = groups.some((g) => hasStoneHide(tuning, g.kind));
  // Flyers: only the current and the next wave, so the Flak goes up just before it is needed.
  const soon = comingWaves(tuning, wave).slice(0, 2).flat();
  return {
    air: soon.some((g) => tuning.creeps[g.kind].flying),
    armour: stone || groups.some((g) => tuning.creeps[g.kind].armor >= ARMOURED),
    stone,
  };
}

/** What the next few waves call for when picking branches: bosses, armour (Brutes, a Stone hide) and flyers. */
function branchNeeds(tuning: Tuning, wave: number): Record<BranchNeed, boolean> {
  const first = Math.max(0, wave - 1);
  const groups = tuning.waves.list.slice(first, first + BRANCH_LOOKAHEAD).flat();
  const count = (pick: (g: WaveGroup) => boolean) =>
    groups.filter(pick).reduce((n, g) => n + g.perLane * g.lanes.length, 0);
  const total = Math.max(1, count(() => true));
  const stone = groups.some((g) => hasStoneHide(tuning, g.kind));
  return {
    boss: groups.some((g) => tuning.creeps[g.kind].boss),
    armour: stone || count((g) => tuning.creeps[g.kind].armor >= ARMOURED) / total >= ARMOUR_SHARE,
    air: count((g) => tuning.creeps[g.kind].flying) / total >= AIR_SHARE,
  };
}

/**
 * The branch for a tower of `kind`: its specialist while the coming waves need it and the team has fewer than
 * `SPECIALISTS_PER_NEED` of them, else its all-round branch.
 */
function pickBranch(
  kind: TowerKind,
  needs: Record<BranchNeed, boolean>,
  teamBranches: TowerBranch[],
  maxSpecialists = SPECIALISTS_PER_NEED,
): TowerBranch {
  const { specialist, general, need } = BRANCH_ROLES[kind];
  const specialists = teamBranches.filter((b) => b === specialist).length;
  return needs[need] && specialists < maxSpecialists ? specialist : general;
}

/**
 * The next tower to build, given the kinds this bot has built and the kinds the whole team has. Once it
 * has a few general towers, it adds the team's first Flak / Arcane before the waves that need one.
 */
function nextTower(needs: { air: boolean; armour: boolean }, built: TowerKind[], team: Set<TowerKind>): TowerKind {
  if (built.length >= MIN_GENERAL_TOWERS) {
    if (needs.air && !team.has('flak')) return 'flak';
    if (needs.armour && !team.has('arcane')) return 'arcane';
  }
  const kind = BUILD_CYCLE[built.length % BUILD_CYCLE.length]!;
  if (kind === 'flak' && !needs.air) return 'arrow';
  if (kind === 'arcane' && !needs.armour) return 'cannon';
  return kind;
}

/** One step of upgrades (or a branch) for the lowest tiers first. Each tower is visited once. */
function spendUpgrades(
  cmds: Command[],
  gold: number,
  mine: TowerSnap[],
  tuning: Tuning,
  needs: { stone: boolean },
  wave: number,
  padRank: Map<number, number>,
  teamBranches: TowerBranch[],
  ignoreAir = false,
): number {
  const first = (t: TowerSnap) => (needs.stone && t.kind === 'arcane' && t.tier < tuning.towers.arcane.tiers.length ? 0 : 1);
  const order = [...mine].sort(
    (a, b) => first(a) - first(b) || a.tier - b.tier || padRank.get(a.padId)! - padRank.get(b.padId)!,
  );
  const branchNeed = branchNeeds(tuning, wave);
  if (ignoreAir) branchNeed.air = false;
  for (const t of order) {
    if (t.branch) continue;
    const next = tuning.towers[t.kind].tiers[t.tier];
    const branch = next ? null : pickBranch(t.kind, branchNeed, teamBranches);
    const cost = next ? next.cost : tuning.branches[branch!].cost;
    if (gold < cost) break;
    cmds.push(branch ? { type: 'upgrade', towerId: t.id, branch } : { type: 'upgrade', towerId: t.id });
    gold -= cost;
    if (branch) teamBranches.push(branch);
  }
  return gold;
}

/** The point `distance` tiles back up `lane` from the Heart, measured along the path. */
function lanePoint(lane: number, distance: number): Vec2 {
  const wps = getMap().lanes[lane]!.waypoints;
  let left = distance;
  for (let i = wps.length - 1; i > 0; i--) {
    const a = wps[i]!;
    const b = wps[i - 1]!;
    const len = dist(a.x, a.y, b.x, b.y);
    if (left <= len) return { x: a.x + ((b.x - a.x) * left) / len, y: a.y + ((b.y - a.y) * left) / len };
    left -= len;
  }
  return { ...wps[0]! };
}

function nearest<T extends { x: number; y: number }>(items: T[], from: { x: number; y: number }): T | undefined {
  let best: T | undefined;
  let bestD = Infinity;
  for (const it of items) {
    const d = dist(it.x, it.y, from.x, from.y);
    if (d < bestD) {
      best = it;
      bestD = d;
    }
  }
  return best;
}

/** Centre creep of the biggest group within `radius` (at least `min` creeps), or undefined. */
function densestGroup(
  creeps: CreepSnap[],
  radius: number,
  groundOnly: boolean,
  tuning: Tuning,
  min = MIN_TARGETS.R,
): CreepSnap | undefined {
  const pool = groundOnly ? creeps.filter((c) => !tuning.creeps[c.kind].flying) : creeps;
  let best: CreepSnap | undefined;
  let bestCount = min - 1;
  for (const c of pool) {
    const count = pool.filter((o) => dist(o.x, o.y, c.x, c.y) <= radius).length;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}
