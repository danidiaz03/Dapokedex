import { Component, Input, OnInit, signal } from '@angular/core';
import { PokemonDetailPage, pokemonEvolutionChain } from '../../interfaces/pokemon';
import { PokemonService } from '../../services/pokemon';
import { RouterLink } from "@angular/router";

@Component({
  selector: 'app-pokemon-evolution',
  imports: [RouterLink],
  templateUrl: './pokemon-evolution.html',
  styleUrl: './pokemon-evolution.css',
})
export class PokemonEvolution implements OnInit {
  @Input() evolution!: pokemonEvolutionChain;
  @Input() pokemonName!: string;

  public evolucion1 = signal<PokemonDetailPage | null>(null);
  public evolucion2 = signal<PokemonDetailPage | null>(null);
  public evolucion3 = signal<PokemonDetailPage | null>(null);

  constructor(private service: PokemonService) {}

  ngOnInit() {
    if (this.evolution.chain.species.name) {
      this.service.getPokemonDetailbyName(this.evolution.chain.species.name).subscribe({
        next: (data) => {
          console.log(data);
          this.evolucion1.set(data);
        },
      });
    }
    if (this.evolution.chain.evolves_to[0]) {
      this.service
        .getPokemonDetailbyName(this.evolution.chain.evolves_to[0].species.name)
        .subscribe({
          next: (data) => {
            console.log(data);
            this.evolucion2.set(data);
          },
        });
    }
    if (this.evolution.chain.evolves_to[0]!.evolves_to[0]) {
      this.service
        .getPokemonDetailbyName(this.evolution.chain.evolves_to[0].evolves_to[0].species.name)
        .subscribe({
          next: (data) => {
            console.log(data);
            this.evolucion3.set(data);
          },
        });
    }
  }
}
