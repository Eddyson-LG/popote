# Limites connues et idées pour la V2

## Limites connues

### Prix
- **Pas d'API officielle des enseignes** (Carrefour, Leclerc, Lidl) : Popote ne scrape pas leurs sites. Les prix viennent d'Open Prices, de tes tickets, de tes saisies, des promos que tu notes, et sinon d'une table de prix moyens **estimés** (`src/data/prix-reference.json`, ordres de grandeur, pas des prix vérifiés).
- **Open Prices est quasi vide dans le Var** (35 prix dans un rayon de 40 km mi-novembre 2026). Popote utilise alors une **médiane nationale** récente pour une vingtaine de fruits et légumes, affichée « médiane France ». Le comparateur de magasins ne devient vraiment utile qu'après quelques tickets scannés.
- Les promos des catalogues ne sont pas récupérées automatiquement : il faut les saisir.

### iPhone
- Le **scan de codes-barres** passe par la caméra (bibliothèque ZXing) : plus lent sur les petits codes ou les emballages courbés. La saisie manuelle du code reste possible.
- iOS peut **redemander l'autorisation caméra** à chaque lancement de l'appli installée.
- **Notifications** : uniquement des notifications locales, affichées à l'ouverture de l'appli (le vrai « push » nécessiterait un serveur). iOS 16.4+ et appli installée obligatoires.
- **Export PDF** : passe par la feuille d'impression d'iOS (« Enregistrer dans Fichiers »). Peut ne rien faire sur des iOS anciens (< 15).
- Les données de Safari et de l'appli installée sont **séparées** (comportement d'iOS).
- iOS peut effacer les données d'un site **non installé** et non visité depuis 7 jours : installe Popote sur l'écran d'accueil et fais des sauvegardes régulières.

### Tickets de caisse
- L'OCR sans IA (Tesseract) est approximatif sur les tickets froissés ou mal éclairés : la correction manuelle est prévue pour ça. La lecture par Claude est nettement plus fiable.
- La correspondance « ligne de ticket → aliment » se trompe parfois sur les abréviations ; à corriger à la main.

### Recettes et planning
- Les quantités, temps et prix des 86 recettes de départ sont **réalistes mais pas testés en cuisine**. Les overnight oats et le chia pudding demandent un temps de repos non compté.
- Quelques quantités sont fractionnaires pour des pièces (¼ de chou, ½ avocat).
- Le planning ne gère qu'**une personne** (portions = 1 par repas, plus les restes du batch cooking).
- La fréquence « grosse course mensuelle + complément » est enregistrée mais la liste reste hebdomadaire.
- Les produits scannés sans correspondance avec un aliment de base ne peuvent pas être ajoutés à la liste.

### IA
- La clé API est dans le navigateur : n'importe quelle extension ou script malveillant sur l'appareil pourrait la lire. D'où les conseils (clé dédiée, limite de dépense, expiration).
- Les organisations Anthropic avec certaines options (ZDR…) interdisent les appels depuis un navigateur : il faut une clé d'une organisation personnelle.
- Le coût affiché est une estimation (au tarif du modèle rapide).
- Toute recette proposée par l'IA est filtrée (fromage, purée, soupe, temps, aliments inconnus) : certaines propositions sont donc écartées sans prévenir.

## Synchronisation Mac ↔ iPhone (phase 11, reportée)

Non codée en V1 : l'**export/import JSON** (avec AirDrop) couvre le besoin d'un utilisateur unique, sans compte ni serveur.

Plan pour une V2 si besoin :
1. Créer un projet **Supabase** (offre gratuite) avec une table par table Dexie (ou une table unique `documents(table, id, data jsonb, maj_le, supprime)`), et Row Level Security sur l'utilisateur.
2. Connexion par lien magique (e-mail), désactivée par défaut, activable dans les Réglages.
3. Ajouter un champ `majLe` à chaque enregistrement (via un hook Dexie `creating`/`updating`), puis synchroniser par différence (« tout ce qui a changé depuis la dernière synchro »), règle « le plus récent gagne ».
4. Ne **jamais** synchroniser `reglages.cleApi`.
5. Alternative sans serveur : Dexie Cloud (offre gratuite limitée), qui fait exactement ça sur une base Dexie existante.

## Idées V2

- Emballer Popote avec **Capacitor** pour l'App Store (le code est déjà 100 % côté client) : scan natif plus rapide, vraies notifications.
- Contribution des prix scannés à **Open Prices** (avec compte Open Food Facts), pour améliorer la couverture du Var pour tout le monde.
- Import automatique des catalogues de promos (PDF) via l'IA.
- Liste « mensuelle + hebdo » vraiment séparée.
- Correction manuelle de la correspondance produit scanné → aliment.
- Recettes favorites et recettes perso saisies à la main.
- Mode « invités » (portions × 2 pour un repas).
- Graphiques d'économies sur plusieurs mois.
