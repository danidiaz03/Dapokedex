import { EvolutionDetail } from '../../interfaces/pokemon';
import { TYPE_NAMES_ES } from '../../pipes/type-name.pipe';

export interface RequirementPart {
  text: string;
  /** Sprite del objeto necesario (piedras, objetos equipados...). */
  icon?: string;
}

/** Traduce un recurso de PokeAPI (objeto, movimiento, especie) por su URL. */
export type Translate = (resource: { name: string; url: string }) => string;

const ITEM_SPRITE_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items';

const TIME_OF_DAY: Record<string, string> = {
  day: 'De día',
  night: 'De noche',
  dusk: 'Al anochecer',
  'full-moon': 'Con luna llena',
};

const TRIGGER_LABELS: Record<string, string> = {
  'level-up': 'Subir nivel',
  trade: 'Intercambio',
  'use-item': 'Objeto',
  shed: 'Hueco libre en el equipo',
  spin: 'Girar con el personaje',
  'tower-of-darkness': 'Torre de la Oscuridad',
  'tower-of-waters': 'Torre del Agua',
  'three-critical-hits': '3 golpes críticos en un combate',
  'take-damage': 'Recibir daño',
  'agile-style-move': 'Movimiento en estilo rápido',
  'strong-style-move': 'Movimiento en estilo fuerte',
  'recoil-damage': 'Recibir daño de retroceso',
  'use-move': 'Usar un movimiento',
  'three-defeated-bisharp': 'Derrotar a 3 Bisharp',
  'gimmighoul-coins': 'Reunir 999 monedas',
  other: 'Condición especial',
};

const humanize = (name: string) => name.replace(/-/g, ' ');

/**
 * Elige qué condición mostrar: PokeAPI devuelve una por juego (Leafeon tiene
 * siete) y marca con is_default la vigente en los juegos actuales.
 */
export function pickEvolutionDetail(details: EvolutionDetail[]): EvolutionDetail | undefined {
  return details.find((d) => d.is_default) ?? details[details.length - 1];
}

/** Convierte las condiciones de una evolución en etiquetas legibles en español. */
export function describeEvolution(
  detail: EvolutionDetail | undefined,
  translate: Translate = (r) => humanize(r.name),
): RequirementPart[] {
  if (!detail) return [{ text: '—' }];
  const parts: RequirementPart[] = [];
  const trigger = detail.trigger?.name ?? 'other';

  if (trigger === 'trade') parts.push({ text: 'Intercambio' });
  if (detail.min_level) parts.push({ text: `Nv. ${detail.min_level}` });
  if (detail.item) {
    parts.push({
      text: translate(detail.item),
      icon: `${ITEM_SPRITE_URL}/${detail.item.name}.png`,
    });
  }
  if (detail.held_item) {
    parts.push({
      text: `Equipado con ${translate(detail.held_item)}`,
      icon: `${ITEM_SPRITE_URL}/${detail.held_item.name}.png`,
    });
  }
  if (detail.trade_species) parts.push({ text: `Por ${translate(detail.trade_species)}` });
  if (detail.min_happiness) parts.push({ text: 'Amistad alta' });
  if (detail.min_affection) parts.push({ text: 'Afecto alto' });
  if (detail.min_beauty) parts.push({ text: 'Belleza alta' });
  if (detail.known_move) parts.push({ text: `Sabiendo ${translate(detail.known_move)}` });
  if (detail.known_move_type) {
    const type = TYPE_NAMES_ES[detail.known_move_type.name] ?? detail.known_move_type.name;
    parts.push({ text: `Con un movimiento de tipo ${type}` });
  }
  if (detail.party_species)
    parts.push({ text: `Con ${translate(detail.party_species)} en el equipo` });
  if (detail.party_type) {
    const type = TYPE_NAMES_ES[detail.party_type.name] ?? detail.party_type.name;
    parts.push({ text: `Con un Pokémon de tipo ${type} en el equipo` });
  }
  if (detail.gender === 1) parts.push({ text: 'Solo hembras ♀' });
  if (detail.gender === 2) parts.push({ text: 'Solo machos ♂' });
  if (detail.relative_physical_stats === 1) parts.push({ text: 'Ataque > Defensa' });
  if (detail.relative_physical_stats === -1) parts.push({ text: 'Ataque < Defensa' });
  if (detail.relative_physical_stats === 0) parts.push({ text: 'Ataque = Defensa' });
  if (detail.time_of_day && TIME_OF_DAY[detail.time_of_day]) {
    parts.push({ text: TIME_OF_DAY[detail.time_of_day] });
  }
  if (detail.needs_overworld_rain) parts.push({ text: 'Mientras llueve' });
  if (detail.turn_upside_down) parts.push({ text: 'Con la consola boca abajo' });
  if (detail.near_special_rock || detail.location) parts.push({ text: 'En un lugar especial' });

  // Si no hay ninguna condición concreta, mostramos al menos el disparador.
  if (parts.length === 0) {
    parts.push({ text: TRIGGER_LABELS[trigger] ?? TRIGGER_LABELS['other'] });
  }
  return parts;
}
