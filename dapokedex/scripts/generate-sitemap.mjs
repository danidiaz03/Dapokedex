// Genera public/sitemap.xml con todas las páginas públicas indexables:
// inicio, comparador, los 18 tipos y cada Pokémon, movimiento y habilidad.
// Se ejecuta a mano (npm run sitemap) cuando cambie PokeAPI o el dominio; el
// resultado se guarda en el repositorio para que el build no haga peticiones.
import { writeFile } from 'node:fs/promises';

const SITE = 'https://dapokedex.com';
const API = 'https://pokeapi.co/api/v2';
const LAST_NATIONAL_DEX = 1025;
const TYPES = [
  'normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground',
  'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy',
];

async function names(endpoint, limit) {
  const res = await fetch(`${API}/${endpoint}?limit=${limit}`);
  if (!res.ok) throw new Error(`${endpoint}: HTTP ${res.status}`);
  const data = await res.json();
  return data.results.map((r) => r.name);
}

const today = new Date().toISOString().slice(0, 10);
const entry = (path, priority, changefreq = 'monthly') =>
  `  <url><loc>${SITE}${path}</loc><lastmod>${today}</lastmod><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

const [pokemon, moves, abilities] = await Promise.all([
  names('pokemon', LAST_NATIONAL_DEX),
  names('move', 2000),
  names('ability', 1000),
]);

const urls = [
  entry('/', '1.0', 'weekly'),
  entry('/comparar', '0.5'),
  entry('/privacidad', '0.2'),
  ...TYPES.map((t) => entry(`/tipo/${t}`, '0.7')),
  ...pokemon.map((p) => entry(`/pokemon/${p}`, '0.8')),
  ...moves.map((m) => entry(`/movimiento/${m}`, '0.4')),
  ...abilities.map((a) => entry(`/habilidad/${a}`, '0.4')),
];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;
await writeFile(new URL('../public/sitemap.xml', import.meta.url), xml);
console.log(`sitemap.xml: ${urls.length} URL (${pokemon.length} Pokémon, ${moves.length} movimientos, ${abilities.length} habilidades)`);
