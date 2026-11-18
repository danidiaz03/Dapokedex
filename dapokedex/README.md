# Dapokedex

Pokédex web construida con **Angular 21** que consume la [PokeAPI](https://pokeapi.co/) y usa **Firebase** (Authentication + Cloud Firestore) para el login y para guardar los datos de cada usuario: favoritos, colección y equipo.

## ✨ Funcionalidades

- 🔐 **Autenticación** con email/contraseña e inicio de sesión con Google (Firebase Auth).
- 📋 **Listado de Pokémon** con paginación, imágenes y tipos en español.
- 🔎 **Buscador** por nombre o número de Pokédex con debounce.
- 🧭 **Filtros por tipo y generación** (de Kanto a Paldea), guardados en la URL.
- 📄 **Ficha de detalle** completa:
  - Estadísticas base y **efectividad de tipos** (debilidades x4/x2, resistencias e inmunidades).
  - Descripción de la Pokédex, categoría, altura, peso, género, ratio de captura, hábitat y grupos huevo.
  - **Habilidades** con descripción en español e indicador de habilidad oculta.
  - **Movimientos** por nivel, MT, huevo y tutor del juego más reciente.
  - **Formas alternativas** (megaevoluciones, regionales, Gigamax), versión **shiny** y grito.
  - Cadena de evolución, incluidas las ramificadas (Eevee) y sus requisitos.
- ⭐ **Favoritos**, 🎒 **colección** y 👥 **equipo** persistidos por usuario en Firestore.
- 🎮 Modo **juego**: elige un inicial y combate por equipos de hasta 6 Pokémon.
  - Daño con nivel, STAB, eficacia de tipos e inmunidades.
  - Movimientos con PP y precisión; el más rápido ataca primero.
  - Los rivales derrotados se añaden a tu colección.
  - Rivales de nuevas regiones según tu nivel y rivales **shiny** por sorpresa.
- ❓ Minijuego **Adivina el Pokémon** por su silueta, con racha y filtro por generación.
- 🏅 **Progreso del entrenador**: XP y niveles, retos diarios, racha de días y logros.
- 🏆 **Ranking** semanal e histórico entre jugadores.
- 📚 Páginas de **tipos**, **movimientos** y **habilidades**, y **comparador** de Pokémon.
- ♿ Navegación con teclado y foco visible.

## 🛠️ Stack

- [Angular 21](https://angular.dev/) (componentes standalone + signals)
- [Firebase JS SDK](https://firebase.google.com/) — Authentication + Cloud Firestore
- [PokeAPI](https://pokeapi.co/) como fuente de datos de los Pokémon
- TypeScript · RxJS · Vitest (tests)

## 🚀 Puesta en marcha

### Requisitos
- Node.js 20.19+ (o 22+)
- npm 10+

### Instalación

```bash
git clone https://github.com/danidiaz03/Dapokedex.git
cd Dapokedex/dapokedex
npm install
```

### Configuración de Firebase

La app necesita un proyecto de Firebase propio. La configuración vive en
`src/environments/environment.ts` (y `environment.prod.ts`):

```ts
export const environment = {
  production: false,
  firebase: {
    apiKey: 'TU_API_KEY',
    authDomain: 'TU_PROYECTO.firebaseapp.com',
    projectId: 'TU_PROYECTO',
    storageBucket: 'TU_PROYECTO.firebasestorage.app',
    messagingSenderId: 'XXXXXXXXX',
    appId: 'X:XXXXXXXXX:web:XXXXXXXXX',
  },
  recaptchaSiteKey: 'TU_CLAVE_DE_SITIO_RECAPTCHA_V3',
};
```

> ℹ️ La `apiKey` de Firebase web **no es un secreto**: se incluye en el bundle
> del navegador por diseño. Lo que protege los datos son las **reglas de
> Firestore** y las **restricciones de la API key**, no ocultarla.

Pasos en la [consola de Firebase](https://console.firebase.google.com):

1. Crea un proyecto y registra una **app web**; copia su config al archivo de arriba.
2. Activa **Authentication** → proveedores **Email/Password** y **Google**.
3. Crea una base de datos **Cloud Firestore**.
4. Publica las **reglas de seguridad** de [`firestore.rules`](firestore.rules)
   (Firestore Database → Reglas). Cada usuario solo accede a su propio
   documento y, en el ranking, solo puede escribir su fila: la XP no puede
   bajar ni subir de golpe más de lo que da una partida. Sin estas reglas el
   ranking no se guarda.

5. Activa **App Check** con un proveedor **reCAPTCHA v3** y copia la clave de
   sitio en `recaptchaSiteKey`. En local se usa un token de depuración que
   aparece en la consola del navegador y hay que registrar en App Check.
6. (Recomendado) En Google Cloud Console → *APIs & Services → Credentials*,
   restringe la API key por **HTTP referrers** (tus dominios, incluido
   `http://localhost:4200/*`) y por **APIs** (Identity Toolkit, Cloud Firestore,
   Token Service).

### Arrancar en desarrollo

```bash
npm start
```

Abre `http://localhost:4200/`. La app recarga automáticamente al guardar cambios.

## 📦 Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm start` | Servidor de desarrollo (`ng serve`) |
| `npm run build` | Build de producción en `dist/` |
| `npm run watch` | Build en modo watch (desarrollo) |
| `npm test` | Tests unitarios con Vitest |

## 📁 Estructura del proyecto

```
src/app/
├── componentes/     Componentes reutilizables (header, footer, evolución)
├── pages/           Páginas: login, listado, detalle, colección, cuenta, juego, batalla, adivina
├── pipes/           tipo — nombres de los tipos en español
├── services/        auth · firestore · pokemon (PokeAPI con caché)
├── guards/          authGuard (rutas privadas) · guestGuard (login)
├── interfaces/      Tipos de la PokeAPI y de la app
└── firebase.ts      Inicialización única de Firebase y App Check
```

## 🌐 Despliegue

`npm run build` genera la app en `dist/dapokedex/browser`. El archivo
`public/.htaccess` se copia al build y, en servidores Apache (p. ej. Hostinger),
redirige todas las rutas a `index.html`, activa la compresión y añade cabeceras
de caché y seguridad.

Las páginas se cargan en diferido (lazy loading), así que el bundle inicial solo
incluye el layout, el login y Firebase Auth.

## 🗂️ Fuente de datos

Los datos de los Pokémon provienen de la [PokeAPI](https://pokeapi.co/), una API
pública y gratuita. La app no almacena información de Pokémon; solo guarda en
Firestore las selecciones de cada usuario (favoritos, colección y equipo).

## 📝 Licencia

Proyecto de uso personal / educativo. Pokémon y sus nombres son marcas
registradas de Nintendo / Game Freak / The Pokémon Company; este proyecto no
está afiliado ni respaldado por ellos.
