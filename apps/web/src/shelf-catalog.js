/**
 * Magazine Rack's complete live shelf catalog.
 *
 * The query strings and adapter metadata are ported from the original
 * library-app-source.html. Keep this module data-only: fetchers should use
 * `source` to select an adapter and pass the adapter-specific fields through.
 */

/** Lucene exclusion appended to every non-adult Internet Archive query. */
export const ADULT_EXCLUDE =
  ` AND NOT (title:(playboy OR penthouse OR hustler OR "barely legal" OR gallery OR oui OR swank OR nudist OR erotic OR erotica OR milf OR housewives OR "readers wives" OR nude OR nudes OR naked OR sexy OR cheri OR cherri OR breasts OR babes OR "color climax" OR bondage OR porn OR pornography OR "high society" OR knave OR mayfair OR rustler OR razzle OR juggs OR voluptuous OR "gay comix" OR "adult comic" OR "adult comix" OR "sex comic" OR smut OR hentai OR "tijuana bible" OR fetish OR bdsm OR yaoi OR yuri OR "sex magazine" OR "adult magazine"))` +
  ` AND NOT (subject:(adult OR erotic OR erotica OR nudist OR pornography OR "men's magazine" OR "adult magazine" OR nude OR milf OR bondage OR "adult comics" OR "adult comix" OR sexual OR smut OR hentai))`;

/** Strong title/creator signals; deliberately do not match vague words such as "kid". */
export const SEXUAL_TITLE_WORDS = [
  'playboy', 'penthouse', 'hustler', 'barely legal', 'swank', 'nudist', 'erotic',
  'erotica', 'milf', 'housewives', 'readers wives', 'cheri', 'cherri', 'breasts',
  'color climax', 'bondage', 'high society', 'knave', 'mayfair', 'rustler', 'razzle',
  'juggs', 'voluptuous', 'gang bang', 'sex magazine', 'adult magazine', 'xxx',
  'porn', 'pornography', 'gay comix', 'tijuana', 'adult comic', 'adult comix',
  'sex comic', 'smut', 'hentai', 'yaoi', 'yuri', 'porn comic', 'erotic comic',
  'fetish', 'bdsm', 'jiz comics', 'topless', 'striptease', 'softcore', 'hardcore',
  'playgirl', 'fiesta magazine', 'escort magazine', 'nude magazine', 'adult only',
  'orgy', 'orgies', 'monster girl', 'bara', 'ecchi'
];

export const SEXUAL_SUBJECT_WORDS = [
  'adult magazine', 'adult magazines', 'adult comics', 'adult comix', 'erotica',
  'erotic', 'nudist', 'pornography', 'porn', 'milf', 'bondage', 'hentai'
];

/** Kids-title false-positive guards are kept separate from adult filtering. */
export const KIDS_BLOCK = [
  'wimpy kid', 'diary of a wimpy', 'harry potter', 'dr seuss', 'seuss', 'berenstein',
  'berenstain', 'magic tree house', 'goosebumps', 'captain underpants', 'dog man',
  'children', 'kids book', 'juvenile', 'picture book'
];

const asText = (value) => Array.isArray(value)
  ? value.filter(Boolean).join(' ')
  : String(value || '');

const containsWord = (text, word) => text.includes(word);

export function isSexualContent(title, subjects, creator = '') {
  const titleText = asText(title).toLowerCase();
  const subjectText = asText(subjects).toLowerCase();
  const creatorText = asText(creator).toLowerCase();
  const titleAndCreator = `${titleText} ${creatorText}`;

  if (SEXUAL_TITLE_WORDS.some((word) => containsWord(titleAndCreator, word))) return true;
  if (SEXUAL_SUBJECT_WORDS.some((word) => containsWord(subjectText, word))) return true;
  return /\bnudes?\b/.test(titleAndCreator) || /\bnaked\b/.test(titleAndCreator);
}

export function isKidsTitle(title) {
  const text = asText(title).toLowerCase();
  return Boolean(text) && KIDS_BLOCK.some((word) => text.includes(word));
}

export function isKidsDoc(doc = {}) {
  return isKidsTitle(doc.title);
}

/** Client-side defense-in-depth filter for every non-adult shelf. */
export function isAdultDoc(doc = {}) {
  return isSexualContent(doc.title, doc.subject ?? doc.subjects, doc.creator);
}

export function isDocAllowedOnShelf(doc, shelfId) {
  return isAdultShelfId(shelfId) || (!isAdultDoc(doc) && !isKidsDoc(doc));
}

export const SHELVES = [
  {
    id: 'magazine-rack',
    title: 'Magazines',
    query: `mediatype:texts AND collection:magazine_rack AND NOT subject:("comic books" OR comics OR superhero)${ADULT_EXCLUDE}`
  },
  {
    id: 'comics',
    title: 'Comics',
    query: `mediatype:texts AND (subject:("comic books" OR comics) OR collection:(comics OR comicbooks)) AND NOT subject:(superhero OR "underground comics" OR "underground comix")${ADULT_EXCLUDE}`
  },
  {
    id: 'pulp',
    title: 'Pulp',
    query: `mediatype:texts AND (subject:("pulp magazine" OR "pulp magazines" OR pulp) OR title:("pulp magazine" OR "weird tales" OR "amazing stories" OR "black mask" OR "argosy")) AND (subject:magazine OR title:magazine OR collection:*magazine* OR collection:*pulp*) AND date:[1890-01-01 TO 1959-12-31] AND NOT subject:("comic books" OR comics)${ADULT_EXCLUDE}`
  },
  {
    id: 'gaming',
    title: 'Gaming',
    query: `mediatype:texts AND (collection:gamemagazines OR title:("nintendo power" OR gamepro OR "electronic gaming monthly" OR "pc gamer" OR "computer gaming world" OR "game informer" OR "mean machines" OR "computer and video games" OR "retro gamer" OR "official xbox magazine" OR "playstation official"))${ADULT_EXCLUDE}`
  },
  {
    id: 'scifi',
    title: 'Sci-Fi',
    query: `mediatype:texts AND subject:("science fiction" OR "sci-fi" OR "science-fiction" OR fantasy) AND (subject:magazine OR title:magazine OR collection:magazine_rack) AND NOT subject:("comic books" OR comics)${ADULT_EXCLUDE}`
  },
  {
    id: 'horror',
    title: 'Horror',
    query: `mediatype:texts AND (subject:("horror magazine" OR "weird tales" OR "horror fiction") OR (subject:horror AND (subject:magazine OR title:magazine OR collection:magazine_rack))) AND NOT subject:("comic books" OR comics)${ADULT_EXCLUDE}`
  },
  {
    id: 'vintage',
    title: 'Vintage',
    query: `mediatype:texts AND (collection:magazine_rack OR subject:magazine) AND date:[1900-01-01 TO 1969-12-31] AND NOT subject:("comic books" OR comics OR superhero)${ADULT_EXCLUDE}`
  },
  {
    id: 'computer',
    title: 'Computing',
    query: `mediatype:texts AND (title:("byte magazine" OR "pc magazine" OR macworld OR "computer shopper" OR "popular computing" OR "creative computing" OR "pc world" OR "computer world" OR "personal computer world" OR "personal computer news") OR subject:("computer magazine" OR "personal computing" OR "computer magazines"))${ADULT_EXCLUDE}`
  },
  {
    id: 'mens',
    title: 'Adventure',
    query: `mediatype:texts AND (title:("true detective" OR argosy OR "saga magazine" OR "man's life" OR "true adventures") OR subject:("true detective" OR "true crime" OR "men's adventure"))${ADULT_EXCLUDE}`
  },
  {
    id: 'superhero',
    title: 'Superheroes',
    query: `mediatype:texts AND (title:(batman OR superman OR "spider-man" OR spiderman OR "x-men" OR "x men" OR avengers OR "wonder woman" OR "captain america" OR "iron man" OR "green lantern" OR "justice league" OR "fantastic four" OR "amazing spider" OR daredevil OR "spider man" OR "green arrow" OR "flash gordon") OR subject:(superhero OR "super hero" OR "super-hero")) AND (subject:("comic books" OR comics) OR title:(comic OR comics))${ADULT_EXCLUDE}`
  },
  {
    id: 'underground',
    title: 'Indie',
    query: `mediatype:texts AND (subject:("underground comics" OR "underground comix" OR "indie comics" OR "alternative comics" OR "independent comics") OR title:("zap comix" OR "freak brothers" OR "love and rockets" OR "raw magazine" OR eightball OR "optic nerve" OR "hate comic" OR "eightball")) AND NOT (title:(sex OR erotic OR adult OR smut OR porn OR nude OR fetish OR bondage OR hentai OR yaoi OR "gay comix" OR "tijuana") OR subject:(adult OR erotic OR erotica OR "adult comics" OR "adult comix" OR pornography))${ADULT_EXCLUDE}`
  },
  {
    id: 'golden',
    title: 'Classic',
    query: `mediatype:texts AND subject:("comic books" OR comics) AND date:[1935-01-01 TO 1975-12-31]${ADULT_EXCLUDE}`
  },
  {
    id: 'ia-comics-col',
    title: 'IA Comics',
    query: `mediatype:texts AND collection:(comics OR comicbooks OR comic_books) AND (subject:(comics OR "comic books" OR "comic book") OR title:(comic OR comics))${ADULT_EXCLUDE}`
  },
  {
    id: 'ga-titles',
    title: 'Golden Age PD',
    query: `mediatype:texts AND (title:("planet comics" OR "whiz comics" OR "smash comics" OR "feature comics" OR "wow comics" OR "pep comics" OR "blue ribbon comics" OR "zip comics" OR "mystery men comics" OR "fight comics" OR "jumbo comics" OR "jungle comics" OR "startling comics" OR "thrilling comics" OR "exciting comics" OR "military comics" OR "police comics" OR "national comics" OR "more fun comics" OR "action comics" OR "adventure comics" OR "all-american comics") OR subject:("golden age comics" OR "golden age comic"))${ADULT_EXCLUDE}`
  },
  {
    id: 'western-comics',
    title: 'Western Comics',
    query: `mediatype:texts AND (subject:("western comic" OR "western comics" OR "cowboy comic") OR title:("red ryder" OR " Hopalong" OR "tom mix" OR "cisco kid" OR "roy rogers comics" OR "gene autry comics" OR "western comics" OR "cowboy comics")) AND (subject:(comics OR "comic books") OR title:(comic OR comics))${ADULT_EXCLUDE}`
  },
  {
    id: 'romance-comics',
    title: 'Romance Comics',
    query: `mediatype:texts AND (subject:("romance comic" OR "romance comics" OR "love comic") OR title:("young romance" OR "young love" OR "first love" OR "teen-age romance" OR "my date" OR "sweethearts")) AND (subject:(comics OR "comic books") OR title:(comic OR comics))${ADULT_EXCLUDE}`
  },
  {
    id: 'horror-comics',
    title: 'Horror Comics',
    query: `mediatype:texts AND (subject:("horror comic" OR "horror comics" OR "pre-code horror") OR title:("vault of horror" OR "crypt of terror" OR "haunt of fear" OR "weird fantasy" OR "weird science" OR "tales from the crypt" OR "horror comics")) AND (subject:(comics OR "comic books") OR title:(comic OR comics OR crypt OR vault OR haunt))${ADULT_EXCLUDE}`
  },
  {
    id: 'war-comics',
    title: 'War Comics',
    query: `mediatype:texts AND (subject:("war comic" OR "war comics" OR "military comic") OR title:("two-fisted tales" OR "frontline combat" OR "our army at war" OR "star spangled war" OR "g.i. combat" OR "war comics")) AND (subject:(comics OR "comic books") OR title:(comic OR comics))${ADULT_EXCLUDE}`
  },
  {
    id: 'funny-animal',
    title: 'Funny Animal',
    query: `mediatype:texts AND (subject:("funny animal" OR "funny animals" OR "anthropomorphic") OR title:("funny animal" OR "funny stuff" OR "animal comics" OR "funny animals" OR "pogo" OR "uncle scraps")) AND (subject:(comics OR "comic books") OR title:(comic OR comics))${ADULT_EXCLUDE}`
  },
  {
    id: 'crime-comics',
    title: 'Crime Comics',
    query: `mediatype:texts AND (subject:("crime comic" OR "crime comics" OR "true crime comic") OR title:("crime does not pay" OR "crime must pay" OR "crime reporter" OR "justice tricks crime")) AND (subject:(comics OR "comic books") OR title:(comic OR comics OR crime))${ADULT_EXCLUDE}`
  },
  {
    id: 'sf-comics',
    title: 'SF Comics',
    query: `mediatype:texts AND (subject:("science fiction comic" OR "sci-fi comic" OR "science fiction comics") OR title:("planet comics" OR "weird science" OR "weird fantasy" OR "strange adventures" OR "mystery in space" OR "space adventures")) AND (subject:(comics OR "comic books") OR title:(comic OR comics OR planet))${ADULT_EXCLUDE}`
  },
  {
    id: 'jungle-comics',
    title: 'Jungle & Adventure',
    query: `mediatype:texts AND (title:("jungle comics" OR "jumbo comics" OR "sheena" OR "kaanga" OR "phantom" OR "jungle comics") OR subject:("jungle comic" OR "adventure comic")) AND (subject:(comics OR "comic books") OR title:(comic OR comics OR jungle OR jumbo))${ADULT_EXCLUDE}`
  },
  {
    id: 'zines',
    title: 'Zines',
    query: `mediatype:texts AND (subject:(zine OR zines OR fanzine OR fanzines) OR title:(zine OR fanzine) OR collection:(zines OR fanzines OR zinecity)) AND NOT subject:(textbook OR mathematics OR software)${ADULT_EXCLUDE}`
  },
  {
    id: 'rpg',
    title: 'RPG',
    query: `mediatype:texts AND (title:("dragon magazine" OR "dungeon magazine" OR "white dwarf" OR "polyhedron" OR "dungeon adventures") OR subject:("dragon magazine" OR "role playing" OR "role-playing" OR "rpg magazine") OR collection:(dragonmagazine OR dungeonmagazine))${ADULT_EXCLUDE}`
  },
  {
    id: 'tvguide',
    title: 'TV Guide',
    query: `mediatype:texts AND (title:("tv guide" OR "television guide" OR "radio times" OR "tv times") OR subject:("tv guide" OR "television listings") OR collection:(tvguide OR tv_guide))${ADULT_EXCLUDE}`
  },
  {
    id: 'popsci',
    title: 'Pop Science',
    query: `mediatype:texts AND (title:("popular science") OR collection:(popularscience OR popular_science))${ADULT_EXCLUDE}`
  },
  {
    id: 'popmech',
    title: 'Pop Mechanics',
    query: `mediatype:texts AND (title:("popular mechanics") OR collection:(popularmechanics OR popular_mechanics))${ADULT_EXCLUDE}`
  },
  {
    id: 'music',
    title: 'Music Press',
    query: `mediatype:texts AND (title:("rolling stone" OR "billboard magazine" OR "spin magazine" OR creem OR "melody maker" OR "new musical express" OR "nme magazine" OR "hit parader" OR "circus magazine") OR (subject:("music magazine") AND (subject:magazine OR title:magazine)))${ADULT_EXCLUDE}`
  },
  {
    id: 'hotrod',
    title: 'Hot Rod',
    query: `mediatype:texts AND (title:("hot rod magazine" OR "hot rod" OR "car craft" OR "motor trend" OR "road and track" OR "road & track" OR "car and driver" OR "rod and custom" OR "street rodder" OR "popular hot rodding" OR "sports cars illustrated" OR "muscle car review" OR "mopar muscle" OR "custom rodder" OR "custom cars" OR "motor life" OR "speed age" OR "autocar" OR "automobile quarterly" OR "classic cars" OR "motor sports" OR "racecar engineering" OR "bmw car" OR "classic & sports car") OR subject:("hot rod" OR "automobile magazine")) AND (subject:magazine OR title:magazine OR collection:*magazine*)${ADULT_EXCLUDE}`
  },
  {
    id: 'aviation',
    title: 'Aviation',
    query: `mediatype:texts AND (title:("flying magazine" OR "aviation week" OR "air classics" OR "air progress" OR "aeroplane magazine" OR "flight international" OR "airforce magazine" OR "popular aviation") OR subject:("aviation magazine" OR "flying magazine" OR aviation)) AND (title:magazine OR subject:magazine OR collection:magazine_rack)${ADULT_EXCLUDE}`
  },
  {
    id: 'photo',
    title: 'Photography',
    query: `mediatype:texts AND (title:("popular photography" OR "american photographer" OR "modern photography" OR "camera magazine" OR "popular photography") OR subject:("photography magazine")) AND (title:magazine OR subject:magazine OR collection:magazine_rack) AND NOT (title:(nude OR nudes OR glamour OR figure OR erotic))${ADULT_EXCLUDE}`
  },
  {
    id: 'mad',
    title: 'Humor',
    query: `mediatype:texts AND (title:("mad magazine" OR "mad #" OR "cracked magazine" OR "crazy magazine" OR "national lampoon") OR subject:("mad magazine" OR "humor magazine"))${ADULT_EXCLUDE}`
  },
  {
    id: 'sffanzines',
    title: 'SF Fanzines',
    query: `mediatype:texts AND ((subject:(fanzine OR fanzines) AND subject:("science fiction" OR "sci-fi" OR "science-fiction")) OR title:("sf fanzine" OR "science fiction fanzine" OR "locus magazine"))${ADULT_EXCLUDE}`
  },
  {
    id: 'boardgames',
    title: 'Board Games',
    query: `mediatype:texts AND (collection:gamemagazines OR subject:magazine) AND (title:("games magazine" OR "games workshop" OR "space gamer" OR "different worlds" OR "strategy and tactics") OR subject:("board games" OR "board game" OR "wargame"))${ADULT_EXCLUDE}`
  },
  {
    id: 'newspapers',
    title: 'Papers',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    query: `mediatype:texts AND (collection:(newspapers) OR subject:newspapers) AND language:English${ADULT_EXCLUDE}`
  },
  {
    id: 'chronam',
    title: 'ChronAm',
    source: 'loc',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    locQs: 'newspaper',
    locExtra: 'dl=page'
  },
  {
    id: 'chronam-funnies',
    title: 'ChronAm Funnies',
    source: 'loc',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    locQs: 'comic strip',
    locExtra: 'dl=page'
  },
  {
    id: 'chronam-front',
    title: 'ChronAm Front',
    source: 'loc',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    locQs: 'front page',
    locExtra: 'dl=page'
  },
  {
    id: 'chronam-texas',
    title: 'ChronAm Texas',
    source: 'loc',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    locQs: 'texas',
    locExtra: 'dl=page&location_state=texas'
  },
  {
    id: 'chronam-ca',
    title: 'ChronAm CA',
    source: 'loc',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    locQs: 'california',
    locExtra: 'dl=page&location_state=california'
  },
  {
    id: 'chronam-ny',
    title: 'ChronAm NY',
    source: 'loc',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    locQs: 'new york',
    locExtra: 'dl=page&location_state=new york'
  },
  {
    id: 'xkcd',
    title: 'XKCD',
    source: 'xkcd'
  },
  {
    id: 'openlib',
    title: 'Open Library',
    source: 'openlibrary',
    olQuery: 'magazine OR periodical OR "comic book"'
  },
  {
    id: 'ol-comics',
    title: 'OL Comics',
    source: 'openlibrary',
    olQuery: 'subject:comics OR subject:"comic books" OR subject:"graphic novels" OR title:"comic book"'
  },
  {
    id: 'europeana',
    title: 'Europeana',
    source: 'europeana',
    newspaperDateMode: 'month-day',
    newspaperOnly: true,
    euQuery: 'newspaper',
    euTheme: 'newspaper'
  },
  {
    id: 'eu-comics',
    title: 'EU Comics',
    source: 'europeana',
    euQuery: 'comic OR comics OR "bande dessinee" OR "comic strip"',
    euTheme: ''
  },
  {
    id: 'ol-subjects',
    title: 'OL Subjects',
    source: 'olsubjects',
    olSubject: 'comics'
  },
  {
    id: 'gbooks-comics',
    title: 'Google Books PD',
    source: 'gbooks',
    gbQuery: 'comics OR "comic book" OR "comic strip"'
  },
  {
    id: 'gbooks-mags',
    title: 'Google Books Mags',
    source: 'gbooks',
    gbQuery: 'magazine OR periodical'
  },
  {
    id: 'loc-photos',
    title: 'LOC Pictures',
    source: 'locsearch',
    locPath: 'photos',
    locQs: 'cartoon OR comic OR caricature'
  },
  {
    id: 'loc-search-comics',
    title: 'LOC Search',
    source: 'locsearch',
    locPath: 'search',
    locQs: 'comic strip OR comic book'
  },
  {
    id: 'ia-folkscanomy',
    title: 'Folkscanomy',
    query: `mediatype:texts AND collection:(folkscanomy OR folkscanomy_miscellaneous) AND (subject:(comics OR "comic books" OR zine) OR title:(comic OR comics OR comix OR zine))${ADULT_EXCLUDE}`
  },
  {
    id: 'ia-strips',
    title: 'IA Strips',
    query: `mediatype:texts AND collection:comics AND (subject:("comic strip" OR "comic strips" OR funnies) OR title:("comic strip" OR funnies OR "katzenjammer" OR "little nemo"))${ADULT_EXCLUDE}`
  },
  {
    id: 'gcd-series',
    title: 'Comic Series',
    source: 'gcd',
    gcdName: 'comic'
  },
  {
    id: 'dpla-periodicals',
    title: 'DPLA Periodicals',
    source: 'dpla',
    newspaperDateMode: 'month-day',
    newspaperOnly: false,
    format: 'magazine',
    dplaQuery: 'magazine OR periodical OR newspaper OR comic OR zine'
  },
  {
    id: 'adult-mags',
    title: 'Adult Mags',
    query: `mediatype:texts AND (title:(playboy OR penthouse OR hustler OR "barely legal" OR swank OR nudist OR milf OR cheri OR "color climax" OR "adult magazine" OR "high society" OR knave OR mayfair OR gallery OR oui) OR subject:("adult magazine" OR "men's magazine" OR nudist OR milf OR erotica)) AND NOT (subject:("comic books" OR comics OR "adult comics" OR "adult comix") OR title:(comic OR comix OR "gay comix" OR hentai OR "tijuana"))`
  },
  {
    id: 'adult-comics',
    title: 'Adult Comics',
    query: `mediatype:texts AND (title:("gay comix" OR "adult comic" OR "adult comix" OR "sex comic" OR "erotic comic" OR hentai OR "tijuana bible" OR "tijuana bibles") OR subject:("adult comics" OR "adult comix" OR "erotic comics" OR hentai)) AND NOT (title:(playboy OR penthouse OR hustler OR "barely legal" OR swank))`
  }
];

export const ADULT_SHELF_IDS = Object.freeze(['adult-mags', 'adult-comics']);

export function isAdultShelfId(id) {
  return ADULT_SHELF_IDS.includes(id) || id === 'adult';
}

export default SHELVES;
