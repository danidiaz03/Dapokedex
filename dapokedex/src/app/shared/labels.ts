// Textos en español de los valores que PokeAPI solo da en inglés.

export const STAT_LABELS: Record<string, string> = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defensa',
  'special-attack': 'At. Esp.',
  'special-defense': 'Def. Esp.',
  speed: 'Velocidad',
  accuracy: 'Precisión',
  evasion: 'Evasión',
};

export const DAMAGE_CLASS_LABELS: Record<string, string> = {
  physical: 'Físico',
  special: 'Especial',
  status: 'Estado',
};

export const AILMENT_LABELS: Record<string, string> = {
  paralysis: 'paralizar',
  sleep: 'dormir',
  freeze: 'congelar',
  burn: 'quemar',
  poison: 'envenenar',
  confusion: 'confundir',
  infatuation: 'enamorar',
  trap: 'atrapar',
  nightmare: 'causar pesadillas',
  torment: 'atormentar',
  disable: 'anular un movimiento',
  yawn: 'adormecer',
  'heal-block': 'impedir la curación',
  'no-type-immunity': 'anular la inmunidad de tipo',
  'leech-seed': 'drenar cada turno',
  embargo: 'impedir el uso de objetos',
  'perish-song': 'debilitar en 3 turnos',
  ingrain: 'arraigar',
};

/** "generation-iv" → "IV". */
export function generationNumber(name: string | undefined): string {
  return name?.replace('generation-', '').toUpperCase() ?? '';
}
