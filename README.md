# 🍲 Popote

**L'appli qui apprend ce que tu aimes, trouve les prix les plus bas et te sort ta liste de courses toute seule, pour manger de vrais repas avec moins de 50 € par semaine.**

Popote est une « web app » (PWA) : elle s'ouvre dans Safari, et une fois ajoutée à l'écran d'accueil de l'iPhone, elle se comporte comme une vraie appli (plein écran, icône, hors ligne). Toutes tes données restent **sur ton téléphone**.

---

## Sommaire

1. [Ce qu'il te faut](#1-ce-quil-te-faut)
2. [Installer le projet sur ton Mac](#2-installer-le-projet-sur-ton-mac)
3. [Lancer Popote sur ton Mac](#3-lancer-popote-sur-ton-mac)
4. [Tester sur ton iPhone en wifi (facultatif)](#4-tester-sur-ton-iphone-en-wifi-facultatif)
5. [Mettre Popote en ligne gratuitement](#5-mettre-popote-en-ligne-gratuitement)
6. [Installer Popote sur ton iPhone](#6-installer-popote-sur-ton-iphone)
7. [Ajouter ta clé API Claude (facultatif)](#7-ajouter-ta-clé-api-claude-facultatif)
8. [Sauvegarder et transférer tes données](#8-sauvegarder-et-transférer-tes-données)
9. [Commandes utiles](#9-commandes-utiles)
10. [Problèmes fréquents](#10-problèmes-fréquents)

---

## 1. Ce qu'il te faut

- Un Mac.
- **Node.js** (version 20 ou plus récente). Pour vérifier s'il est installé, ouvre l'appli **Terminal** (⌘ + Espace, tape « Terminal ») et tape :
  ```bash
  node -v
  ```
  Si tu vois un numéro comme `v22.x.x`, c'est bon. Sinon, télécharge la version « LTS » sur [nodejs.org](https://nodejs.org) et installe-la comme n'importe quelle appli.
- Un compte **GitHub** gratuit (seulement pour la mise en ligne, étape 5).

> 💡 Dans ce guide, chaque bloc gris est une commande à copier-coller dans le Terminal, puis Entrée.

## 2. Installer le projet sur ton Mac

Place-toi dans le dossier du projet, puis installe les dépendances (une seule fois, ça prend 1 à 2 minutes) :

```bash
cd ~/Documents/02_PROJETS/popote
npm install
```

## 3. Lancer Popote sur ton Mac

```bash
npm run dev
```

Le Terminal affiche une adresse du type `http://localhost:5173`. Ouvre-la dans Safari ou Chrome. Pour arrêter : clique dans le Terminal et fais **Ctrl + C**.

👉 Pour tester sans tout remplir : sur le premier écran, touche **« Juste tester ? Charger des données de démo »** (aussi dans **Plus → Réglages**).

## 4. Tester sur ton iPhone en wifi (facultatif)

La caméra (scan de codes-barres et de tickets) exige une connexion sécurisée (HTTPS). Ce mode crée un certificat local :

1. Ton Mac et ton iPhone doivent être sur **le même wifi**.
2. Lance :
   ```bash
   npm run dev:iphone
   ```
   La première fois, le Mac peut te demander ton mot de passe pour installer le certificat local : c'est normal.
3. Le Terminal affiche une ligne `Network: https://192.168.x.x:5173`. Tape cette adresse dans Safari sur l'iPhone.
4. Safari va dire que le certificat n'est pas fiable (il ne connaît pas celui de ton Mac). Touche **Afficher les détails → visiter ce site web**. Pour tester la caméra, c'est suffisant.

> Le plus simple reste souvent la mise en ligne (étape 5) : vrai HTTPS, rien à configurer sur l'iPhone.

## 5. Mettre Popote en ligne gratuitement

On utilise **GitHub Pages** : c'est gratuit, en HTTPS, et ça se met à jour tout seul à chaque envoi de code.

1. Sur [github.com](https://github.com), crée un dépôt **vide** nommé `popote` (bouton **New**, ne coche aucune case).
2. Dans le Terminal, relie le projet à ce dépôt (remplace `TON-PSEUDO`) et envoie le code :
   ```bash
   git remote add origin https://github.com/TON-PSEUDO/popote.git
   git push -u origin main
   ```
3. Sur GitHub, dans ton dépôt : **Settings → Pages → Build and deployment → Source : GitHub Actions**.
4. Va dans l'onglet **Actions** : le déploiement « Déployer Popote » tourne (2 minutes environ). Quand il est vert ✅, ton appli est en ligne à l'adresse :
   ```
   https://TON-PSEUDO.github.io/popote/
   ```

Ensuite, à chaque modification : `git push`, et le site se met à jour tout seul.

> Le déploiement lance d'abord les tests : s'ils échouent, rien n'est publié (c'est voulu).

## 6. Installer Popote sur ton iPhone

1. Ouvre l'adresse `https://TON-PSEUDO.github.io/popote/` dans **Safari** (pas Chrome : sur iPhone, l'installation passe par Safari).
2. Touche le bouton **Partager** (le carré avec une flèche vers le haut).
3. Fais défiler et touche **« Sur l'écran d'accueil »**, puis **Ajouter**.
4. L'icône Popote apparaît sur ton écran d'accueil : ouvre-la depuis là. Elle s'ouvre en plein écran et marche **hors ligne** (la liste de courses marche même sans réseau en magasin).

Pour les notifications (promos sur ce que t'aimes, produits à manger vite) : ouvre Popote depuis l'icône, puis **Plus → Réglages → Notifications**. Il faut iOS 16.4 ou plus récent.

> ⚠️ Les données de l'appli installée sont séparées de celles de Safari. Si tu as testé dans Safari avant d'installer, refais le questionnaire (ou utilise l'export/import, étape 8).

## 7. Ajouter ta clé API Claude (facultatif)

**Tout marche sans IA.** Avec une clé, Popote propose des recettes sur mesure, comprend tes envies (« cette semaine j'ai la flemme »), invente des idées vide-frigo et lit mieux les tickets de caisse.

1. Crée un compte sur la [Console Anthropic](https://platform.claude.com) et ajoute un peu de crédit (quelques euros suffisent pour des mois : un ticket lu coûte environ un dixième de centime).
2. Dans **API Keys**, crée une clé **dédiée à Popote**. Conseils de sécurité :
   - mets une **limite de dépense** (par exemple 5 $ par mois) ;
   - mets une **date d'expiration** ;
   - n'utilise pas une clé d'une organisation professionnelle (certaines interdisent les appels depuis un navigateur).
3. Dans Popote : **Plus → Réglages → IA**, colle la clé (elle commence par `sk-ant-`) et touche **Tester**. Si c'est OK, l'IA s'active.

Ta clé est stockée **uniquement sur ton téléphone**, envoyée seulement à `api.anthropic.com`, et **jamais** incluse dans les sauvegardes. Bouton « Effacer la clé » dans les réglages. Les modèles utilisés sont définis dans un seul fichier : `src/lib/ia.ts`.

## 8. Sauvegarder et transférer tes données

**Plus → Réglages → Sauvegarde** :
- **Exporter** crée un fichier `popote-sauvegarde-AAAA-MM-JJ.json`. Sur iPhone, le bouton **Envoyer** permet de l'envoyer par AirDrop à ton Mac (ou dans Fichiers).
- **Importer** remplace toutes les données par celles du fichier (après confirmation). Pratique pour passer du Mac à l'iPhone et inversement.

## 9. Commandes utiles

| Commande | À quoi ça sert |
|---|---|
| `npm run dev` | Lancer l'appli sur le Mac |
| `npm run dev:iphone` | Lancer en HTTPS sur le wifi, pour tester sur l'iPhone |
| `npm test` | Lancer tous les tests automatiques |
| `npm run build` | Construire la version de production (dossier `dist/`) |
| `npm run preview` | Voir la version de production en local |
| `npm run icones` | Régénérer les icônes et écrans de lancement depuis `public/icons/logo.svg` |

## 10. Problèmes fréquents

- **« command not found: npm »** : Node.js n'est pas installé (étape 1).
- **La caméra ne s'ouvre pas** : il faut HTTPS (site en ligne ou `npm run dev:iphone`) et autoriser la caméra (Réglages iPhone → Safari → Caméra). Tu peux toujours taper le code-barres à la main.
- **« Oups, la base locale ne s'ouvre pas »** : la navigation privée de Safari bloque le stockage. Ouvre Popote dans un onglet normal.
- **Les prix sont « estimés »** : c'est normal au début. Open Prices a très peu de prix dans le Var ; scanne tes tickets ou note les prix en magasin et Popote apprendra tes vrais prix.
- **La clé est refusée** : vérifie qu'elle est active et a du crédit dans la Console Anthropic. Le message d'erreur dans les réglages dit précisément quoi faire.
- **Le site en ligne n'a pas changé** : ferme complètement l'appli et rouvre-la (la nouvelle version s'installe en arrière-plan).

---

Plus d'infos pour les curieux : [DECISIONS.md](DECISIONS.md) (choix techniques), [docs/API.md](docs/API.md) (API utilisées), [LIMITES.md](LIMITES.md) (limites connues et idées V2).

Prix collaboratifs : [Open Prices](https://prices.openfoodfacts.org) et [Open Food Facts](https://world.openfoodfacts.org), données sous licence ODbL.
