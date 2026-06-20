ial# Plan — VALTIS MVP web (Lovable)

## Cadrage

Lovable construit une **web app React** (pas du mobile natif Flutter/RN). Le cahier des charges décrit une plateforme bancaire complète sur 6 sprints — c'est plusieurs semaines de travail. Je vais livrer un **MVP fonctionnel par phases**, chaque phase testable, en commençant par les fondations.

**Hors périmètre Lovable** (à noter pour l'équipe future) :
- App mobile native iOS/Android (Lovable = web; possible PWA installable)
- FaceID/TouchID natif (on aura WebAuthn/biométrie navigateur)
- Capteur de proximité Ghost Mode (remplacé par bouton + double-tap)
- Backend Go/NestJS dédié (on utilise Lovable Cloud = Postgres + Edge functions serverless)
- OCR KYC automatisé (on simulera; intégration réelle Onfido/Veriff plus tard)

## Phase 1 — Fondations (cette livraison)

**Design system "Valtis"**
- Tokens OKLCH dans `src/styles.css` : noir profond `#0A0A0A`, surface `#141414`, or `#D4AF37`, ivoire `#F5F5F5`
- Typo sans-serif fine (Inter Tight / Space Grotesk pour titres)
- Variantes Button (`gold`, `ghost-gold`), Card (`elevated` avec shimmer)
- Animations : shimmer cartes, transitions élastiques, fade-in

**Authentification (Lovable Cloud)**
- Email + mot de passe + OTP par email (signup/signin/signout)
- Table `profiles` liée à `auth.users` (nom, pays CA/EU, statut KYC)
- Table `user_roles` séparée (`client`, `compliance_officer`, `admin`) + RLS sécurisée via `has_role()`
- Route `/auth` publique, `_authenticated/*` protégée par layout managé

**Dashboard client + Wallets**
- Table `wallets` (user_id, currency CAD/EUR/USD, balance, masked)
- Vue dashboard : solde par wallet avec **Ghost Mode** (toggle + bouton "masquer")
- Carte premium avec effet shimmer or
- Liste des transactions récentes (vide à ce stade)

**Pages livrées** : `/` (landing Valtis), `/auth`, `/dashboard`, `/wallets`

## Phases suivantes (après validation Phase 1)

- **Phase 2** : Flux transfert P2P + jauge (Socket.io → realtime Supabase), blocage à 63% si montant ≥ 100M, notifications expéditeur/récepteur
- **Phase 3** : Back-office admin (revue transactions bloquées, upload docs KYC/EDD via Storage, prévisualisation PDF/image, actions Approuver/Compléments/Suspect, audit trail immuable)
- **Phase 4** : Polissage (confettis déblocage, micro-interactions, PWA installable)

## Détails techniques

- **Stack** : TanStack Start + React 19 + Tailwind v4 + Lovable Cloud (Supabase géré)
- **Sécurité** : RLS sur toutes tables, rôles dans table séparée, audit trail append-only (Phase 3)
- **Conformité** : journal `audit_logs` (qui/quoi/quand) câblé dès Phase 1 sur événements auth
- **Realtime** : Supabase Realtime channels (Phase 2) pour jauge de transfert

## Livrable Phase 1 maintenant

1. Activer Lovable Cloud
2. Design system noir/or + composants Card/Button premium
3. Migration : `profiles`, `user_roles`, `wallets`, `audit_logs` (+ RLS + GRANTs + trigger handle_new_user)
4. Pages : landing, auth, dashboard avec wallets de démo (CAD/EUR seed après 1er signup)
5. Ghost Mode (toggle global, persisté localement)
6. Sitemap + robots

Tu valides la Phase 1 → on enchaîne la Phase 2 (le morceau "showcase" avec la jauge 63%).
