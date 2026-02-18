# CLAUDE.md — Gosbi Professional Comenzi

This document provides context for AI assistants working in this repository.

---

## Project Overview

**Gosbi-professional-comenzi** is a Romanian-language B2B order management web application (PWA) for the Gosbi pet food brand. It allows clients to browse products, place orders, and communicate with admins. Admins manage clients, promotions, delivery schedules, and orders.

- **Live site**: `gosbiromania.web.app` (Firebase Hosting, project ID: `gosbiromania`)
- **Language of UI/content**: Romanian (ro-RO)
- **Architecture**: Vanilla JS ES6 modules + Firebase backend — no build step, no bundler

---

## Directory Structure

```
/
├── index.html            # Main client-facing shell (catalog, cart, login, profile)
├── admin.html            # Admin dashboard shell
├── my-orders.html        # Client order history page
├── catalog.html          # Legacy/standalone catalog page
├── messages.html         # Messaging interface (admin ↔ client)
├── reports.html          # Admin reports page
├── orders-admin.html     # Lightweight order management page
├── styles.css            # Global stylesheet (CSS custom properties, dark theme)
├── sw.js                 # Service Worker (network-first, no-store for JS/CSS/HTML)
├── admin.js              # Root-level admin controller script
├── myOrders.js           # Root-level client orders script
├── upload.js             # Utility: upload products to Firestore
├── upload-from-url.js    # Utility: import products from URL
├── firebase.json         # Firebase Hosting config (public: ".", no build)
├── .firebaserc           # Firebase project: gosbiromania
├── package.json          # Minimal: axios, firebase-admin (for server utilities only)
├── .github/
│   └── workflows/
│       └── firebase-hosting-pull-request.yml  # CI: preview deploy on PR
└── js/                   # ES6 module library (imported by HTML pages)
    ├── config.js         # Firebase client SDK configuration object
    ├── firebase.js       # Initializes Firebase app, auth, and db exports
    ├── app.js            # Main application logic: auth state, screen routing
    ├── auth.js           # Phone-based auth helpers (phone→email mapping)
    ├── profile.js        # User profile: county/city, contact completeness
    ├── catalog.js        # Product catalog: load, filter, render products
    ├── cart.js           # Shopping cart: add/remove/get items, Firestore sync
    ├── orders.js         # Order submission with Firestore transactions
    ├── adminOrders.js    # Admin order viewing and management
    ├── clientPromos.js   # Promotion display for clients
    ├── clientDelivery.js # Delivery date/schedule logic for clients
    ├── messages.js       # Real-time messaging (Firestore onSnapshot)
    ├── reports.js        # Admin reporting and data aggregation
    ├── pdf-export.js     # PDF generation for orders/reports
    └── auth.js           # (see above)
```

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES6 modules), HTML5, CSS3 |
| Backend/DB | Firebase Firestore (real-time, NoSQL) |
| Auth | Firebase Authentication (email/password — phone numbers stored as `{phone}@phone.local`) |
| Hosting | Firebase Hosting |
| CI/CD | GitHub Actions → Firebase preview on PR |
| PWA | Service Worker (`sw.js`) with network-first strategy |
| PDF | Client-side PDF generation via `pdf-export.js` |
| Dependencies | `axios` (HTTP), `firebase-admin` (server-side upload utilities only) |

**Firebase SDK version**: `10.12.5` (loaded from CDN: `https://www.gstatic.com/firebasejs/10.12.5/`)

---

## Key Conventions

### No Build Step
There is no bundler (no Webpack, Vite, Rollup, etc.). Source files are deployed as-is. HTML pages use `<script type="module">` to load JS modules directly.

### ES6 Modules via CDN
Firebase SDK is imported directly from `gstatic.com` CDN. Do not add these as npm dependencies.

```js
// Correct pattern — CDN import
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// Internal module import
import { auth, db } from "./firebase.js";
```

### Phone Authentication Pattern
The app uses Firebase Email/Password auth with a phone-to-email mapping. This is an internal convention — not real email auth:

```js
// js/auth.js
function phoneToEmail(phone) {
  return `${phone}@phone.local`;
}
```

Phone numbers are normalized (stripped of country code `+40` / `0040`).

### Romanian Language
All user-facing strings, comments in HTML templates, and inline UI text are in Romanian. Code comments may be in Romanian or English.

### Screen Routing
`js/app.js` implements screen switching via `display` toggling on named `div#screen*` elements. Screens are: `screenLoading`, `screenLogin`, `screenContactGate`, `screenCatalog`, `screenAdmin`.

### Inter-module Communication
Modules communicate via custom DOM events where tight coupling is undesirable:

```js
// Emitter (catalog.js)
window.dispatchEvent(new CustomEvent("catalog:submitOrderRequested", { detail: { items } }));

// Listener (app.js)
window.addEventListener("catalog:submitOrderRequested", async (event) => { ... });
```

### Service Worker Caching Strategy
`sw.js` intentionally disables caching for JS, CSS, and HTML to prevent stale file issues on mobile devices. Only other assets (images, etc.) use browser default caching.

---

## Firestore Data Model

Key Firestore collections (inferred from code):

| Collection | Description |
|---|---|
| `users/{uid}` | User profile: phone, email, name, county, city, address, status (pending/active) |
| `products/{id}` | Product catalog items: name, price, category, image, stock |
| `orders/{id}` | Orders: clientId, clientName, items[], orderNumber, status, timestamps |
| `cart/{uid}` | Per-user cart state (synced to Firestore) |
| `promotions/{id}` | Admin-created promotions: title, content, target counties |
| `messages/{id}` | Chat messages between admin and clients |
| `config/delivery` | Delivery schedule configuration set by admin |
| `counters/orders` | Atomic order number counter (updated via Firestore transactions) |

---

## Development Workflow

### Making Changes
1. Edit the relevant `.js` or `.html` file directly — no compilation needed.
2. Test in browser by opening `index.html` (via a local server or Firebase emulator).
3. The service worker bypasses local caches, so JS/CSS changes are always fresh.

### Local Development
There is no local dev server configured. Options:
- Use Firebase CLI: `firebase serve` (requires Firebase CLI installed)
- Use any static file server: `npx serve .` or VS Code Live Server
- Firebase emulators: `firebase emulators:start` (for Firestore/Auth locally)

### Deployment
Deployment happens automatically via GitHub Actions on pull requests (preview channel). For production, merge to main branch (Firebase deploy triggered separately or manually).

**Manual deploy** (if needed):
```bash
firebase deploy --only hosting
```

### No Tests
There is no automated test suite. Testing is done manually in the browser. Do not add a test runner without discussing with the project owner.

---

## CI/CD

File: `.github/workflows/firebase-hosting-pull-request.yml`

- **Trigger**: Pull request events
- **Build step**: None (`echo "no build"`)
- **Action**: `FirebaseExtended/action-hosting-deploy@v0` — creates a preview URL per PR
- **Secrets required**: `FIREBASE_SERVICE_ACCOUNT_GOSBIROMANIA`, `GITHUB_TOKEN`

---

## Important Files Reference

| File | Role |
|---|---|
| `js/config.js` | Single source of Firebase client config — edit here to change project |
| `js/firebase.js` | Exports `auth` and `db` — always import from here, never re-initialize |
| `js/app.js` | Central routing and auth state machine — read before modifying screen flow |
| `js/orders.js` | Order submission uses Firestore transactions for atomic order numbering |
| `sw.js` | Modifying caching strategy here affects all update delivery to users |
| `admin.js` | Root-level script for admin panel — separate from `js/adminOrders.js` |

---

## Gotchas and Notes

- **Do not add npm packages for frontend use** — there is no bundler to process them. Frontend JS must use CDN imports or inline code.
- **Firebase SDK version must stay consistent** — all CDN imports use `10.12.5`. Mixing versions will cause runtime errors.
- **Phone auth is email/password under the hood** — `{phone}@phone.local` is an internal email format, not a real email. Do not change this pattern without migrating existing users.
- **Admin vs client code is separated by HTML page** — `index.html`/`js/app.js` is for clients; `admin.html`/`admin.js` is for admins. Security rules in Firestore enforce access control.
- **UI language is Romanian** — all user-facing strings, error messages, and alerts must remain in Romanian.
- **No TypeScript, no linter, no formatter** — the project uses plain JS. Do not add tooling without confirmation.
