import {
  FriendRequest,
  PublicProfile,
  friendshipId,
  isOnline,
  isValidUsername,
  lastSeenLabel,
  normalizeUsername,
  relationWith,
  sortFriends,
  suggestUsername,
} from './social';

const profile = (username: string, xp: number, lastSeen: number): PublicProfile => ({
  uid: username,
  username,
  title: '',
  level: 1,
  xp,
  team: [],
  collectionCount: 0,
  achievements: 0,
  lastSeen,
});

const request = (from: string, to: string): FriendRequest => ({
  id: `${from}_${to}`,
  from,
  to,
  fromName: from,
  toName: to,
  createdAt: 0,
});

describe('social', () => {
  it('valida nombres de usuario', () => {
    expect(isValidUsername('dani_23')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('Dani')).toBe(false);
    expect(isValidUsername('a'.repeat(17))).toBe(false);
  });

  it('normaliza lo que escribe el jugador', () => {
    expect(normalizeUsername('  Ash Ketchum ')).toBe('ash_ketchum');
    expect(normalizeUsername('Íñigo-Pérez!')).toBe('inigo_perez');
    expect(normalizeUsername('x'.repeat(30)).length).toBe(16);
  });

  it('propone un nombre válido aunque la cuenta no tenga nombre', () => {
    expect(suggestUsername('Daniel Díaz', 'AbC123')).toBe('daniel');
    expect(isValidUsername(suggestUsername(null, 'AbC123'))).toBe(true);
    expect(isValidUsername(suggestUsername('Al', 'Zx9'))).toBe(true);
  });

  it('usa el mismo id de amistad desde los dos lados', () => {
    expect(friendshipId('b', 'a')).toBe('a_b');
    expect(friendshipId('a', 'b')).toBe('a_b');
  });

  it('sabe quién está conectado', () => {
    const now = 10_000_000;
    expect(isOnline(now - 60_000, now)).toBe(true);
    expect(isOnline(now - 6 * 60_000, now)).toBe(false);
    expect(isOnline(0, now)).toBe(false);
    expect(lastSeenLabel(now - 60_000, now)).toBe('En línea');
    expect(lastSeenLabel(now - 20 * 60_000, now)).toBe('Hace 20 min');
    expect(lastSeenLabel(now - 3 * 3_600_000, now)).toBe('Hace 3 h');
    expect(lastSeenLabel(now - 49 * 3_600_000, now)).toBe('Hace 2 días');
  });

  it('calcula la relación con otro jugador', () => {
    const incoming = [request('ana', 'me')];
    const outgoing = [request('me', 'leo')];
    expect(relationWith('me', 'me', [], incoming, outgoing)).toBe('self');
    expect(relationWith('me', 'eva', ['eva'], incoming, outgoing)).toBe('friend');
    expect(relationWith('me', 'ana', [], incoming, outgoing)).toBe('incoming');
    expect(relationWith('me', 'leo', [], incoming, outgoing)).toBe('outgoing');
    expect(relationWith('me', 'zoe', [], incoming, outgoing)).toBe('none');
  });

  it('ordena primero a los conectados y luego por XP', () => {
    const now = 10_000_000;
    const list = [profile('a', 900, 0), profile('b', 100, now), profile('c', 500, now)];
    expect(sortFriends(list, now).map((p) => p.username)).toEqual(['c', 'b', 'a']);
  });
});
