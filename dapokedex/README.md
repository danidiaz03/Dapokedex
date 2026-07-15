# Dapokedex

Pokédex web construida con **Angular 21** que consume la [PokeAPI](https://pokeapi.co/) y usa **Firebase** (Authentication + Cloud Firestore) para el login y para guardar los datos de cada usuario: favoritos, colección y equipo.

## ✨ Funcionalidades

- 🔐 **Autenticación** con email/contraseña e inicio de sesión con Google (Firebase Auth).
- 📋 **Listado de Pokémon** con paginación, imágenes (artwork oficial) y tipos.
- 🔎 **Buscador** por nombre sobre el listado completo.
- 📄 **Ficha de detalle** de cada Pokémon con estadísticas, habilidades y cadena de evolución.
- ⭐ **Favoritos**, 🎒 **colección** y 👥 **equipo** persistidos por usuario en Firestore.
- 🎮 Modo **juego / combate** y selección de Pokémon inicial.

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
};
```

> ℹ️ La `apiKey` de Firebase web **no es un secreto**: se incluye en el bundle
> del navegador por diseño. Lo que protege los datos son las **reglas de
> Firestore** y las **restricciones de la API key**, no ocultarla.

Pasos en la [consola de Firebase](https://console.firebase.google.com):

1. Crea un proyecto y registra una **app web**; copia su config al archivo de arriba.
2. Activa **Authentication** → proveedores **Email/Password** y **Google**.
3. Crea una base de datos **Cloud Firestore**.
4. Publica estas **reglas de seguridad** (cada usuario solo accede a su propio documento):

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /users/{userId} {
         allow read, write: if request.auth != null && request.auth.uid == userId;
       }
     }
   }
   ```

5. (Recomendado) En Google Cloud Console → *APIs & Services → Credentials*,
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
├── pages/           Páginas: login, listado, detalle, colección, cuenta, juego
├── services/        auth · firestore · pokemon (PokeAPI)
├── guards/          authGuard — protege las rutas privadas
└── interfaces/      Tipos de la PokeAPI y de la app
```

## 🗂️ Fuente de datos

Los datos de los Pokémon provienen de la [PokeAPI](https://pokeapi.co/), una API
pública y gratuita. La app no almacena información de Pokémon; solo guarda en
Firestore las selecciones de cada usuario (favoritos, colección y equipo).

## 📝 Licencia

Proyecto de uso personal / educativo. Pokémon y sus nombres son marcas
registradas de Nintendo / Game Freak / The Pokémon Company; este proyecto no
está afiliado ni respaldado por ellos.
