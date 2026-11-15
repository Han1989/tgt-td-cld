// The name filter (q16, src/names.ts and src/nameList.ts): what must pass and what must be refused, through every
// trick of the fold.

import { describe, expect, it } from 'vitest';
import { boardName, FALLBACK_NAME, foldName, nameBlocked, seatName } from '../src/names';
import { INNOCENT, STEMS, WORDS } from '../src/nameList';

/** Names that must pass: first names from many languages, words and places that hold a stem, gamer names. */
const PASS = [
  // First names
  'Nazim', 'Nazira', 'Hitomi', 'Shital', 'Kumiko', 'Analia', 'Dong', 'Wang', 'Fuchs', 'Sukhdeep', 'Sasha', 'Mohammed',
  'Dimitri', 'Ksenia', 'Ivan', 'Сергей', 'Наташа', 'Юлия', 'Дмитрий', '李明', 'さくら', '김민준', 'Aiko', 'Raphael',
  'Raphaela', 'Nicole', 'Nick', 'Nikita', 'Sikander', 'Mahmud', 'Merdan', 'Sukaina', 'Arsene', 'Yoshitaka', 'Hoshitani',
  'Pedro', 'Kael', 'Scott', 'Mira the Bold', 'Ingrid', 'Søren', 'Zoë', 'José', 'Łukasz', 'Ömer', 'Çağla', 'Şule',
  'Gökhan', 'Agnieszka', 'Małgorzata', 'Wojciech', 'Putri', 'Ayu', 'Dewi', 'Budi', 'Wayan', 'Joaquín', 'Begoña',
  'Françoise', 'Jürgen', 'Björn', 'Giuseppe', 'Chiara', 'Thiago', 'João', 'Kofi', 'Amara', 'Nkechi', 'Priya',
  'Arjun', 'Aryan', 'Ishaan', 'Sunita', 'Mei', 'Hiroshi', 'Yuki', 'Ngoc', 'Thanh', 'Fatima', 'Aisha', 'Omar',
  'Yusuf', 'Leila', 'Dmitry', 'Olga', 'Anastasia', 'Tito', 'Titus', 'Dickinson', 'Cumberbatch', 'Hancock',
  // Words and places that hold a stem
  'Scunthorpe', 'Therapist', 'Cassandra', 'Dickens', 'Hitchcock', 'Peacock', 'Essex', 'Sussex', 'Middlesex',
  'Shiitake', 'Shitake', 'Matsushita', 'Assassin', 'Bassist', 'Classic', 'Passion', 'Analyst', 'Titan', 'Document',
  'Cucumber', 'Grape', 'Grapefruit', 'Nigel', 'Nigeria', 'Kumquat', 'Speedo', 'Torpedo', 'Merdeka', 'Mustard',
  'Leotard', 'Custard', 'Shakespeare', 'Pussycat', 'Cockpit', 'Cocktail', 'Butters', 'Mississippi', 'Bassoon',
  'Glasses', 'Cumbria', 'Accumulate', 'Circumference', 'Butterscotch', 'Compass', 'Embassy', 'Harass', 'Moderna',
  'Modern', 'Staffordshire', 'Officially', 'Systematic', 'Skunk', 'Puck', 'Fudge', 'Cocoa', 'Negroni', 'Spicy',
  'Japan', 'Pakistan', 'Assam', 'Bastion', 'Lass', 'Arsenal', 'Computer', 'Reputation', 'Unique', 'Retardant',
  'Penistone', 'Swank', 'Parapet', 'Trapeze', 'Scraper', 'Pedometer', 'Raccoon', 'Hoedown', 'Sexton', 'Expert',
  // Gamer names, and the game's own world
  'xX_Slayer_Xx', 'DarkLord99', 'KillerQueen', 'DeathKnight', 'NoobMaster', 'l33tSniper', 'BloodMoon', 'SoulReaper',
  'DoomBringer', 'HellHound', 'Kill Streak', 'Slayer', 'Death', 'Blood', 'Doom', 'Reaper', 'Hell', 'GGWP', 'Pro_Gamer',
  'ShadowBlade', 'NightOwl', 'Guest4821', 'Player', 'Player 2', 'IronVow', 'RuneSmith', 'Sn1per', 'M4ster', 'Ace007',
];

/** Names that must be refused: every group, plain and through each trick of the fold. */
const REFUSE = [
  // Obscenities and sexual terms
  'fuck', 'FUCK', 'f u c k', 'f.u.c.k', 'f-u-c-k', 'f_u_c_k', 'f*ck', 'fuuuuuck', 'fück', 'fu​ck', 'Ｆｕｃｋ',
  'ƒuck', 'Fuсk', 'sh1t', '$h!t', 'ShitLord', 'ѕһіt', 'b1tch', 'b!tch', 'wh0re', 'Cunt99', 'c u n t', 'BigDick',
  'd!ck', 'c0ck', 'c.o.c.k', 'pussy', 'SEXY', 's3x', 'anal', 'á n a l', 't1ts', 'ÄSS', 'A$$', 'porn', 'p0rn', 'dildo',
  // Slurs
  'nigger', 'N.I.G.G.E.R', 'ＮＩＧＧＥＲ', 'n1gg3r', 'niiiiggggerrr', 'nіgger', 'n1gga', 'niggaz', 'k1ke', 'ch1nk',
  'spic', 'paki', 'wetback', 'faggot', 'f4ggot', 'f a g', 'fag', 'dyke', 'tr4nny', 'retard', 'r3t4rd', 'sp4z',
  'mongoloid', 'raghead', 'jewboy',
  // Hate figures, groups, slogans and number codes
  'hitler', 'h!tler', 'HeilHitler88', 'nazi', 'n@zi', 'IamaNazi', 'nazi_boy', 'neonazi', '1488', '14 88', 'x1488x',
  'kkk', 'siegheil', 'whitepower', 'Sieg Heil', '卐', 'swastika', 'goebbels',
  // Telling someone to hurt or kill themselves
  'kys', 'KYS', 'go kys', 'killyourself', 'kill yourself', 'ki11yourself', 'hangyourself', 'neck yourself',
  // Sexual violence, and anything sexual about children
  'rape', 'r@pe', 'rapeman', 'rapist', 'pedo', 'p3d0', 'Pedo Bear', 'l0li', 'lolicon', 'molest', 'jailbait',
  'childporn', 'incest',
  // Other languages
  'puta', 'put@', 'mierda', 'm!erda', 'pendejo', 'caralho', 'c@r@lho', 'putain', 'salope', 'merde', 'scheisse',
  'sche1sse', 'scheiße', 'arschloch', 'hurensohn', 'cazzo', 'c4zzo', 'stronzo', 'orospu', '0rospu', 'siktir',
  'kurwa', 'kurw4', 'pierdol', 'kontol', 'k0nt0l', 'bangsat', 'хуй', 'хyй', 'сука', 'cуkа', 'пизда', 'бляд',
  'blyat', 'bl1at', 'suk4', 'mudak', 'pidor',
  // Posing as someone
  'admin', 'ADMIN', 'Admin_Bob', 'TheModerator', 'mod', 'Staff', 'SupportTeam', 'Official', 'System', 'Server',
  'Developer', 'Owner', 'CrazyGames', 'crazygames', 'CrazyGamesStaff', 'αdmin', 'аdmin', 'adm1n',
  // Addresses and contacts
  'www.x.com', 'x.com', 'bob.com', 'play.io', 'ThePlayer.gg', 'discord.gg/x', 'DiscordMe', 't.me/x', 'Telegram',
  'whatsapp', '@bob', '@me', 'http', 'free.ru', 'my site .net',
];

describe('the name filter (q16)', () => {
  it(`lets ${PASS.length} innocent names through`, () => {
    expect(PASS.length).toBeGreaterThanOrEqual(150);
    expect(PASS.filter((n) => nameBlocked(n)).map((n) => `${n} → ${foldName(n)}`)).toEqual([]);
  });

  it(`refuses ${REFUSE.length} names, plain and through every trick of the fold`, () => {
    expect(REFUSE.length).toBeGreaterThanOrEqual(80);
    expect(REFUSE.filter((n) => !nameBlocked(n)).map((n) => `${n} → ${foldName(n)}`)).toEqual([]);
  });

  it('folds look-alikes, accents, invisible characters and full-width forms', () => {
    expect(foldName('Ｆｕｃｋ')).toBe('fuck');
    expect(foldName('fü​çk')).toBe('fuck');
    expect(foldName('ѕһіt')).toBe('shit');
    expect(foldName('$h!t')).toBe('shit');
    expect(foldName('s.h-i_t')).toBe('shit');
  });

  it('keeps the list a size a person can read, every entry folding to something', () => {
    const all = [...STEMS, ...WORDS, ...INNOCENT];
    expect(all.length).toBeLessThan(600);
    expect(all.filter((e) => foldName(e) === '')).toEqual([]);
    // No entry is in two lists.
    expect(new Set(all.map((e) => e.toLowerCase())).size).toBe(all.length);
  });

  it('boards: a refused or empty name reads as Player; a clean one as it came', () => {
    expect(boardName('ShitLord')).toBe(FALLBACK_NAME);
    expect(boardName('  Mira  the Bold ')).toBe('Mira the Bold');
    expect(boardName('​​')).toBe(FALLBACK_NAME);
  });

  it('rooms: a refused name is Player, then Player 2, 3…; a clean name is untouched', () => {
    expect(seatName('Ada', [])).toBe('Ada');
    expect(seatName('Mira ✨', ['Player'])).toBe('Mira ✨');
    expect(seatName('fuck', [])).toBe('Player');
    expect(seatName('fuck', ['Ada', 'player'])).toBe('Player 2');
    expect(seatName('nazi', ['Player', 'Player 2'])).toBe('Player 3');
    expect(seatName('​', ['Ada'])).toBe('Player');
  });
});
