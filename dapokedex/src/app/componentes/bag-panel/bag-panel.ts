import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { FirestoreService } from '../../services/firestore.service';
import { ItemService } from '../../services/item.service';
import { PokemonNamePipe } from '../../pipes/pokemon-name.pipe';
import { getArtworkUrl } from '../../services/pokemon';
import { Bag, Held, available, canEquip, itemDescription } from '../../game/bag';

/**
 * Mochila: muestra los objetos del entrenador y permite equipar uno a cada
 * Pokémon del equipo. Lo equipado es lo que llevan en combate.
 */
@Component({
  selector: 'app-bag-panel',
  imports: [PokemonNamePipe],
  templateUrl: './bag-panel.html',
  styleUrl: './bag-panel.css',
})
export class BagPanel implements OnInit {
  private auth = inject(AuthService);
  private firestore = inject(FirestoreService);
  items = inject(ItemService);

  team = input<{ id: number; name: string }[]>([]);

  bag = signal<Bag>({});
  held = signal<Held>({});
  /** Pokémon al que se le está eligiendo objeto. */
  selected = signal<number | null>(null);
  saving = signal(false);
  error = signal('');

  /** Objetos de la mochila ordenados por nombre, con las unidades libres. */
  list = computed(() =>
    Object.entries(this.bag())
      .filter(([, n]) => n > 0)
      .map(([key, total]) => ({
        key,
        total,
        free: available(this.bag(), this.held(), key),
        description: itemDescription(key),
      }))
      .sort((a, b) => this.items.label(a.key).localeCompare(this.items.label(b.key))),
  );
  totalItems = computed(() => Object.values(this.bag()).reduce((a, b) => a + b, 0));
  selectedPokemon = computed(() => this.team().find((p) => p.id === this.selected()) ?? null);

  async ngOnInit() {
    const uid = (await this.auth.waitForUser())?.uid;
    if (!uid) return;
    const data = await this.firestore.getUserData(uid);
    // La primera vez se regala un kit inicial para poder probar los objetos.
    if (data.bagMissing) await this.firestore.giveStarterKit(uid).catch(() => {});
    this.bag.set(data.bag);
    this.held.set(data.held);
  }

  sprite(id: number): string {
    return getArtworkUrl(id);
  }

  heldBy(id: number): string | null {
    return this.held()[id] ?? null;
  }

  canEquip(key: string): boolean {
    const id = this.selected();
    return id !== null && canEquip(this.bag(), this.held(), id, key);
  }

  toggle(id: number) {
    this.selected.update((current) => (current === id ? null : id));
  }

  async equip(key: string | null) {
    const id = this.selected();
    const uid = this.auth.currentUser()?.uid;
    if (id === null || !uid) return;
    if (key && !this.canEquip(key)) return;
    const before = this.held();
    const next = { ...before };
    if (key) next[id] = key;
    else delete next[id];
    this.held.set(next);
    this.saving.set(true);
    this.error.set('');
    try {
      await this.firestore.equipItem(uid, id, key);
      this.selected.set(null);
    } catch {
      this.held.set(before);
      this.error.set('No se pudo guardar. Inténtalo de nuevo.');
    }
    this.saving.set(false);
  }
}
