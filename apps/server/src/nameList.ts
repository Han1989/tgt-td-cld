// The words that keep a name off the boards and out of a room's seats (q16, docs/GAME_DESIGN.md "Daily run" → Names).
// Server side only: never shipped to a browser. Read by names.ts, which folds every entry as it folds a name
// (lower case, accents off, look-alike letters of other scripts read as Latin ones), so an entry is written as it
// is spelled, in its own script. A doubled letter in an entry matches any longer run ("nigger" matches "niggger"),
// and a single letter matches a stretched one ("fuck" matches "fuuuck").
//
// Three kinds of entry:
//   STEMS     matched anywhere in the folded name, with separators dropped: words with few innocent neighbours.
//   WORDS     matched only when a word of the name is that word, or the whole name is: short and ambiguous ones.
//   INNOCENT  innocent words that hold a stem, taken out of the name before the stems are tried.
//
// Sources: the advisor's groups in docs/queue/q16-name-filter.md; CrazyGames' requirements page could not be
// opened from the session that wrote this list (see the pull request). A few hundred entries at most, so a person
// can still read it (414 today: 224 stems, 158 words, 32 innocent words). Words of the game's own world pass: kill,
// slayer, death, blood, doom, reaper, hell.

export const STEMS: readonly string[] = [
  // English obscenities and sexual terms
  'fuck', 'fck', 'fcuk', 'shit', 'cunt', 'bitch', 'whore', 'slut', 'asshole', 'arsehole', 'dickhead', 'cocksuck', 'motherf',
  'twat', 'wank', 'jizz', 'porn', 'dildo', 'blowjob', 'handjob', 'rimjob', 'orgasm', 'masturbat', 'ejaculat',
  'butthole', 'bollock', 'nutsack', 'scrotum', 'testicle', 'clitoris', 'hentai', 'penis', 'vagina', 'pussies',
  'milf', 'cumshot', 'cumslut', 'buttplug', 'gangbang', 'bukkake', 'fellatio', 'cunnilingus', 'titties', 'boobies',
  'horndog', 'bastard',
  // Slurs: race, ethnicity, nationality
  'nigger', 'nigga', 'niglet', 'wetback', 'beaner', 'raghead', 'towelhead', 'porchmonkey', 'junglebunny',
  'golliwog', 'redskin', 'zipperhead', 'chingchong', 'sandnig', 'spearchucker',
  // Slurs: religion
  'christkiller', 'jewboy', 'muzrat', 'kikes',
  // Slurs: sexuality and gender
  'faggot', 'fagot', 'shemale', 'trannie', 'poofter', 'battyboy', 'carpetmunch', 'dykes',
  // Slurs: disability
  'retard', 'spastic', 'mongoloid',
  // Hate figures, groups, slogans
  'hitler', 'neonazi', 'himmler', 'goebbels', 'mussolini', 'siegheil', 'heilhitler', 'whitepower', 'whitepride',
  'kukluxklan', 'swastika', 'hakenkreuz', 'zyklon', 'gasthejews', 'killalljews', 'killthejews', 'binladen', 'alqaeda',
  'holohoax', 'aryanbrother', 'whitegenocide', 'judensau', 'reichsfuhrer',
  // Telling someone to hurt or kill themselves
  'killyourself', 'killurself', 'killyoself', 'hangyourself', 'neckyourself', 'slityourwrist', 'cutyourself',
  'drinkbleach', 'goandie', 'godieinahole',
  // Sexual violence, and anything sexual about children
  'rape', 'rapist', 'raping', 'molest', 'pedo', 'paedo', 'pedophil', 'lolicon', 'childporn', 'kiddieporn',
  'jailbait', 'incest', 'bestiality', 'beastiality', 'zoophil', 'necrophil', 'preteen',
  // Spanish
  'hijodeputa', 'hijoputa', 'cabron', 'mierda', 'pendejo', 'joder', 'maricon', 'chinga', 'gilipollas', 'malparido',
  'culiao', 'mamaguevo', 'putita',
  // Portuguese
  'caralho', 'buceta', 'arrombad', 'fodase', 'merda', 'vaisefoder', 'filhodaputa',
  // French
  'putain', 'merde', 'connard', 'connasse', 'salope', 'encule', 'niquetamere', 'bougnoul', 'tafiole',
  // German
  'scheiss', 'fotze', 'hurensohn', 'wichser', 'arschloch', 'schwuchtel', 'missgeburt', 'schlampe',
  // Italian
  'cazzo', 'vaffanculo', 'stronzo', 'puttana', 'minchia', 'coglion', 'frocio', 'porcodio', 'bocchinar',
  // Turkish
  'orospu', 'siktir', 'sikerim', 'yarrak', 'aminako', 'pezevenk', 'yavsak', 'kahpe',
  // Polish
  'kurw', 'jebac', 'jeban', 'pierdol', 'pierdal', 'pizd',
  // Indonesian
  'bangsat', 'kontol', 'ngentot', 'jancok', 'bajingan', 'jembut',
  // Russian, both scripts
  'хуй', 'хуя', 'пизд', 'бляд', 'блять', 'ебат', 'ебан', 'ебал', 'мудак', 'пидор', 'пидар', 'залуп',
  'гандон', 'шлюх', 'долбо', 'blyat', 'blyad', 'bliat', 'khuy', 'nahui', 'nahuy', 'mudak', 'pidor', 'pidar', 'eblan',
  'suchka',
  // Posing as someone, and addresses or contacts
  'crazygames', 'http', 'www', 'discord', 'telegram', 'whatsapp',
];

export const WORDS: readonly string[] = [
  // English obscenities and sexual terms
  'fuk', 'fuq', 'ass', 'arse', 'asses', 'dick', 'dicks', 'cock', 'cocks', 'pussy', 'tit', 'tits', 'titty', 'boob', 'boobs', 'cum',
  'sex', 'sexy', 'horny', 'anal', 'anus', 'fap', 'boner', 'bugger', 'prick', 'clit', 'piss', 'hoe', 'hoes', 'thot',
  'nude', 'nudes', 'xxx', 'porno', 'cumming',
  // Slurs: race, ethnicity, nationality
  'coon', 'coons', 'chink', 'gook', 'spic', 'spick', 'kike', 'paki', 'wop', 'dago', 'jap', 'kaffir', 'kafir',
  'injun', 'honky', 'gypo', 'gyppo', 'negroid', 'nig', 'nigs',
  // Slurs: religion
  'muzzie', 'yid',
  // Slurs: sexuality and gender
  'fag', 'fags', 'dyke', 'tranny', 'homo', 'lesbo', 'poof', 'sodomite',
  // Slurs: disability
  'spaz', 'spazz', 'cripple', 'midget', 'retards', 'tard', 'tards',
  // Hate figures, groups, slogans and their number codes (the codes are matched on the name's digits too, names.ts)
  'nazi', 'nazis', 'kkk', 'ss', 'wpww',
  // Telling someone to hurt or kill themselves
  'kys', 'gokys', 'kms',
  // Sexual violence, and anything sexual about children
  'loli', 'lolis', 'shota', 'cp', 'pedos',
  // Spanish
  'puta', 'puto', 'putas', 'putos', 'verga', 'culero', 'cono', 'zorra', 'perra', 'chingada',
  // Portuguese
  'porra', 'viado', 'foda', 'cuzao', 'bosta', 'vadia',
  // French
  'pute', 'putes', 'batard', 'negre', 'tapette', 'nique', 'ntm', 'pd', 'fdp',
  // German
  'fick', 'ficken', 'spast', 'neger', 'kanake', 'hure',
  // Italian
  'troia', 'figa', 'bastardo', 'culo', 'frocia',
  // Turkish
  'amk', 'ibne', 'gavat', 'sik',
  // Polish
  'chuj', 'cipa', 'ciota', 'dupa',
  // Indonesian
  'anjing', 'memek', 'babi', 'goblok', 'tolol', 'asu', 'pepek', 'pantek', 'perek',
  // Russian, both scripts
  'сука', 'бля', 'ебать', 'suka', 'blya', 'gandon', 'ebat', 'ebal',
  // Posing as someone
  'admin', 'administrator', 'mod', 'mods', 'moderator', 'staff', 'support', 'official', 'system', 'server',
  'developer', 'owner',
];

export const INNOCENT: readonly string[] = [
  // shit
  'shiitake', 'shitake', 'matsushita', 'shital', 'shitij', 'yoshitaka', 'hoshitani',
  // cunt, twat, wank
  'scunthorpe', 'swank', 'twatt', 'wankel',
  // rape, rapist, raping
  'grape', 'drape', 'scrape', 'trapeze', 'rapeseed', 'parapet', 'serape', 'therapist', 'draping', 'scraping',
  // pedo
  'torpedo', 'pedometer', 'speedo', 'pedoman',
  // retard
  'retardant',
  // bastard
  'bastardsword',
  // penis
  'penistone',
  // nigger
  'niggard',
  // merda, merde
  'merdan', 'merdeka',
  // chinga
  'chingachgook',
];
