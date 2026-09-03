const covers = [
  ['#d8c7a3', '#34433b'], ['#9c4f36', '#f0c777'], ['#293b58', '#d7e4e6'],
  ['#d0a13d', '#252321'], ['#715b82', '#f2d8c8'], ['#55776f', '#f0e3b7'],
  ['#c76845', '#f6e5c9'], ['#3d4b59', '#e9b56a'], ['#b3c1ad', '#493f3a']
];

const item = (id, title, creator, year, genre, source, description, index, pages = 0) => ({
  id, title, creator, year, genre, source, description, pages,
  cover: `https://placehold.co/520x720/${covers[index % covers.length][0].slice(1)}/${covers[index % covers.length][1].slice(1)}?text=${encodeURIComponent(title.slice(0, 18))}`,
  sourceUrl: source === 'Library of Congress' ? `https://www.loc.gov/search/?fo=json&q=${encodeURIComponent(title)}` : `https://archive.org/search?query=${encodeURIComponent(title)}`,
  readerUrl: source === 'Internet Archive' ? `https://archive.org/search?query=${encodeURIComponent(title)}` : `https://www.loc.gov/search/?q=${encodeURIComponent(title)}`
});

export const SEED_ITEMS = [
  item('seed-architecture', 'The Architectural Review', 'The Architectural Press', '1928', 'Design', 'Internet Archive', 'Plans, streets, and the quiet drama of buildings in use.', 0, 96),
  item('seed-science', 'Popular Science Monthly', 'Popular Science Publishing', '1937', 'Science', 'Internet Archive', 'A field guide to the machines and questions shaping everyday life.', 1, 84),
  item('seed-flying', 'Air Trails', 'Street & Smith', '1941', 'Adventure', 'Internet Archive', 'The golden age of flight, told from the cockpit and the hangar.', 2, 72),
  item('seed-radio', 'Radio Craft', 'Technical Publishing', '1935', 'Technology', 'Internet Archive', 'Circuits, signals, and the practical magic of listening in.', 3, 112),
  item('seed-life', 'Life Magazine', 'Time Inc.', '1949', 'Photography', 'Internet Archive', 'A visual dispatch from the postwar world and its small rituals.', 4, 64),
  item('seed-comics', 'Four Color Adventures', 'Public Domain Collection', '1943', 'Comics', 'Internet Archive', 'Bright panels, bold heroes, and the wonderful logic of a Sunday afternoon.', 5, 52),
  item('seed-zine', 'Signal / Noise', 'Community Print Archive', '1996', 'Zines', 'Internet Archive', 'Independent voices, photocopied edges, and culture in the margins.', 6, 48),
  item('seed-newspaper', 'The Evening Star', 'Library of Congress', '1912', 'Newspapers', 'Library of Congress', 'A day in the city, preserved as headlines, classifieds, and weather.', 7, 12),
  item('seed-nature', 'The Naturalist', 'Open Library', '1902', 'Nature', 'Open Library', 'Field notes for noticing the living world close at hand.', 8, 128),
  item('seed-motor', 'Motor Age', 'Trade Press Archive', '1925', 'Motoring', 'Internet Archive', 'Engines, roads, and the culture that grew around the open route.', 1, 88),
  item('seed-film', 'Picture-Play', 'Photoplay Publishing', '1922', 'Film', 'Internet Archive', 'The moving image before it became an industry of infinite screens.', 2, 74),
  item('seed-music', 'Down Beat', 'Music Publications', '1940', 'Music', 'Internet Archive', 'Rhythm, bandstands, and the recordings that made a new language.', 3, 68)
];

export const SHELVES = [
  { id: 'continue', label: 'Keep reading', kicker: 'YOUR STACK', description: 'The stories you left open.' },
  { id: 'editors', label: 'Editor’s picks', kicker: 'CURATED FOR YOU', description: 'Strong covers. Strange corners. No algorithmic fog.' },
  { id: 'periodicals', label: 'Periodicals', kicker: 'THE LONG VIEW', description: 'A century of ideas in recurring form.' },
  { id: 'comics', label: 'Comics & illustration', kicker: 'INK / PAPER / PANEL', description: 'Sequential art with room to breathe.' },
  { id: 'nearby', label: 'From the stacks', kicker: 'WORTH A DETOUR', description: 'Unexpected finds from public collections.' }
];

export function seedForShelf(id, items = SEED_ITEMS) {
  if (id === 'continue') return items.slice(0, 3);
  if (id === 'comics') return items.filter((entry) => entry.genre === 'Comics' || entry.genre === 'Zines');
  if (id === 'periodicals') return items.filter((entry) => ['Science', 'Design', 'Technology', 'Photography', 'Music'].includes(entry.genre));
  if (id === 'nearby') return items.slice(6).concat(items.slice(0, 2));
  return items;
}
