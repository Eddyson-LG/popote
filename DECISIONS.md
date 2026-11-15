# Décisions techniques de Popote

Chaque décision non couverte par le cahier des charges, avec l'option la plus simple et la plus gratuite.

| # | Sujet | Décision | Pourquoi |
|---|-------|----------|----------|
| 1 | Routage | `HashRouter` (URLs en `#/liste`) | GitHub Pages ne sait pas réécrire les URLs : avec le hash, un rechargement ne donne jamais de 404, et la PWA hors ligne reste simple. |
| 2 | Hébergement HTTPS | GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`) | Gratuit, HTTPS, déploiement automatique à chaque push, aucun compte supplémentaire. |
| 3 | « Plats » et « recettes » | Une seule table `recettes` : un plat du swipe *est* une recette | Évite de dupliquer 60 entrées ; un plat sans recette n'aurait pas d'usage dans le planning. |
| 4 | Polices | Bricolage Grotesque (titres) + Inter (texte), en variable, via `@fontsource-variable` | Auto-hébergées dans le build, donc en cache hors ligne. |
| 5 | Mode sombre | Variables CSS redéfinies sous `prefers-color-scheme: dark` | Suit automatiquement le réglage iOS, sans bouton. |
| 6 | Unités | Quantités en `g`, `ml` ou `piece` ; prix en €/kg, €/L ou €/pièce | Trois unités suffisent pour arrondir aux formats vendus et comparer les prix. |
| 7 | Villes des magasins | Laissées vides par défaut, demandées dans le questionnaire | On ne devine pas l'emplacement des magasins de l'utilisateur. |
| 8 | TypeScript | TypeScript 7 (dernière version au moment du projet) | Installé par défaut par npm ; le typecheck passe. |
| 9 | Semaine planifiée le dimanche | Le dimanche, planning et liste portent sur la semaine suivante | Jour de courses classique ; planifier une semaine qui se termine n'a pas de sens. |
| 10 | Produits de placard | Huile, sel, épices, condiments affichés à part (« vérifie si t'en as ») et hors du total principal | Sinon la 1ʳᵉ liste compterait ~20 € de produits qui durent des mois ; le questionnaire demande ce qui est déjà au placard. |
| 11 | Contrat d'identifiants d'aliments | `src/data/contrat-aliments.json` fixe ids + unités, partagé par les fichiers de données | Permet de générer aliments, recettes et prix en parallèle et de vérifier leur cohérence par test. |
| 12 | Pesto | Tagué `fromage` (contient du parmesan) donc exclu par défaut | « Fromage sous toutes ses formes, y compris dans un plat ». |
