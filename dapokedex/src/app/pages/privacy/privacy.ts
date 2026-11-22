import { Component, inject } from '@angular/core';
import { SeoService } from '../../services/seo.service';
import { AnalyticsService } from '../../services/analytics.service';

/**
 * Política de privacidad y cookies. Los datos del responsable van entre
 * corchetes: hay que rellenarlos antes de publicar.
 */
@Component({
  selector: 'app-privacy',
  templateUrl: './privacy.html',
  styleUrl: './privacy.css',
})
export class Privacy {
  analytics = inject(AnalyticsService);

  constructor() {
    inject(SeoService).setPage({
      title: 'Privacidad y cookies',
      description: 'Qué datos guarda Dapokedex, para qué los usa y cómo gestionar las cookies.',
      path: '/privacidad',
    });
  }
}
