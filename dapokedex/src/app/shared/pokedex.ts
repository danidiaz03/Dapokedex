// Constantes de la Pokédex sin dependencias: las pueden importar los componentes
// de la raíz sin arrastrar HttpClient ni RxJS a la carga inicial.

/** Generaciones con su región, para los filtros del listado. */
export const GENERATIONS = [
  { id: 1, label: 'I · Kanto' },
  { id: 2, label: 'II · Johto' },
  { id: 3, label: 'III · Hoenn' },
  { id: 4, label: 'IV · Sinnoh' },
  { id: 5, label: 'V · Teselia' },
  { id: 6, label: 'VI · Kalos' },
  { id: 7, label: 'VII · Alola' },
  { id: 8, label: 'VIII · Galar' },
  { id: 9, label: 'IX · Paldea' },
];

/** Las formas alternativas (megas, regionales...) tienen ids a partir de 10001. */
export const FORMS_ID_START = 10001;

/** Último Pokémon con número de Pokédex nacional (Pecharunt). */
export const LAST_NATIONAL_DEX = 1025;
