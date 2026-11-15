# API externes de Popote

Référence des trois API appelées par Popote, une PWA 100 % côté navigateur sans serveur, déployée sur GitHub Pages.

- Rédigé le 15/11/2026 à partir de la documentation officielle en ligne. Chaque affirmation cite sa source.
- **Doc** : l'information vient d'une page officielle, dont l'URL est citée.
- **Observé** : l'information vient d'un test `curl` lancé le 15/11/2026, avec un en-tête `Origin: https://example.github.io` pour simuler un appel depuis un navigateur. C'est un comportement constaté, pas un engagement documenté : il peut changer.
- **Non confirmé** : la doc consultée ne dit rien sur ce point.

Types concernés côté Popote : `Produit`, `PrixObservation` et `Magasin` (`src/types/index.ts`).

---

## 1. Open Food Facts (OFF) : lecture d'un produit par code-barres

Sources :
- Intro API : https://openfoodfacts.github.io/openfoodfacts-server/api/ (même contenu sur https://openfoodfacts.github.io/documentation/docs/Product-Opener/api/)
- Référence v3 GET produit : https://openfoodfacts.github.io/documentation/docs/Product-Opener/v3/products/get-api-v3-product-code/
- Tutoriel : https://openfoodfacts.github.io/openfoodfacts-server/api/tutorial-off-api/

### 1.1 Version et endpoint

- **v3 est la version recommandée** : « Current — recommended for all new integrations ». La v2 est « Deprecated — still supported for backward compatibility » (Doc, intro API).
- Production : `https://world.openfoodfacts.org`. Staging : `https://world.openfoodfacts.net`. Le staging exige une authentification HTTP basic `off` / `off` (Doc, intro API).

```
GET https://world.openfoodfacts.org/api/v3/product/{code}?fields=...&tags_lc=fr
```

Paramètres utiles (Doc, référence v3) :

| Paramètre | Rôle |
|---|---|
| `code` (chemin) | Le code-barres. |
| `fields` | Liste des champs demandés, séparés par des virgules. Valeurs spéciales : `none`, `raw`, `all` (`all` est la valeur par défaut). **Toujours le préciser** pour alléger la réponse. |
| `lc` | Langue (2 lettres) pour les champs localisés. |
| `cc` | Pays (2 lettres). S'il est absent, il peut être déduit de l'IP. |
| `tags_lc` | Langue des noms de tags (`lc_name`). |
| `product_type` | `food`, `beauty`, `petfood`, `product` ou `all`. Le serveur renvoie un 302 vers le bon serveur si nécessaire. |

### 1.2 Champs à demander et correspondance avec `Produit`

Les noms ci-dessous ont été testés sur l'endpoint v3 (Observé). Les endpoints cités sont documentés ; la liste exhaustive des champs du schéma produit n'a pas été relue champ par champ.

| `Produit` | Champ OFF | Remarque |
|---|---|---|
| `codeBarres` | `code` | OFF renvoie le code normalisé (voir 1.4). |
| `nom` | `product_name` (ou `product_name_fr`) | `product_name_fr` n'a pas été testé (non confirmé). |
| `marque` | `brands` | Chaîne, parfois plusieurs marques séparées par des virgules. `brands_tags` donne un tableau. |
| `imageUrl` | `image_front_url` (400 px) ou `image_front_small_url` (200 px) | Les deux ont été observés. |
| `nutriscore` | `nutriscore_grade` | Valeur observée : `"e"`. Les valeurs hors `a`–`e` (« unknown », etc.) ne sont **pas confirmées** : ne garder que `a`–`e`. |
| `categorie` | `categories_tags` (ex. `en:spreads`) ou `categories_tags_fr` | `categories_tags_fr` renvoie des libellés français observés (« Pâtes à tartiner »). |
| `quantiteTexte` | `quantity` | Exemple : `"400.0 g"`. Le format varie selon le contributeur. |
| `quantiteNormalisee` | `product_quantity` + `product_quantity_unit` | Exemple : `400` + `"g"` (Observé). |

Requête type :

```
GET https://world.openfoodfacts.org/api/v3/product/3017624010701?fields=code,product_name,brands,image_front_small_url,nutriscore_grade,categories_tags,quantity,product_quantity,product_quantity_unit
```

Réponse réduite (Observé) :

```json
{
  "code": "3017624010701",
  "errors": [],
  "warnings": [],
  "status": "success",
  "result": { "id": "product_found", "name": "Product found", "lc_name": "Product found" },
  "product": {
    "code": "3017624010701",
    "product_name": "Nutella",
    "brands": "Ferrero",
    "image_front_url": "https://images.openfoodfacts.org/images/products/301/762/401/0701/front_en.100.400.jpg",
    "nutriscore_grade": "e",
    "categories_tags": ["en:breakfasts", "en:spreads", "en:sweet-spreads", "fr:pates-a-tartiner"],
    "quantity": "400.0 g",
    "product_quantity": 400,
    "product_quantity_unit": "g"
  }
}
```

`status` vaut `success`, `success_with_warnings`, `success_with_errors` ou `failure` (Doc, référence v3).

### 1.3 Produit inconnu

- Doc (référence v3) : si le produit n'est pas trouvé, « the API will return a 404 error ».
- Observé : un code inconnu renvoie **HTTP 404** avec ce corps :

```json
{
  "status": "failure",
  "result": { "id": "product_not_found", "name": "Product not found" },
  "errors": [ { "message": { "id": "product_not_found" }, "field": { "id": "code", "value": "…" } } ]
}
```

- Un code mal formé ajoute une erreur `invalid_code` (Observé).
- **À traiter côté Popote** : un 404 n'est pas une panne. On propose la saisie manuelle (`source: 'manuel'`).
- Avec l'ancienne v2, un produit absent renvoie un HTTP 200 avec `"status": 0` (Observé). Ne pas mélanger les deux logiques.

### 1.4 Règles d'usage

- **User-Agent** : « always use a custom User-Agent to identify your app ». Format attendu : `AppName/Version (ContactEmail)`, par exemple `MyApp/1.0 (myapp@example.com)` (Doc, intro API).
- **Authentification** : aucune pour la lecture. Les lectures « do not require authentication other than the custom User-Agent » (Doc).
- **Paramètres `app_name`, `app_version`, `app_uuid`** : la doc les demande pour les **écritures** uniquement (Doc).
- **Limites de débit** (Doc, intro API) :
  - lecture produit (`GET /api/v*/product`) : **15 req/min par IP** ;
  - recherche (`/api/v*/search` et `/cgi/search.pl`) : **10 req/min par IP**, et « don't use it for a search-as-you-type feature » ;
  - au-delà des limites globales, le serveur répond **HTTP 503**. Un dépassement peut entraîner un bannissement d'IP ;
  - pour une application dont les requêtes partent du terminal de chaque utilisateur, « the rate limits apply per user ».
- **Usage massif** : la doc recommande de télécharger les exports CSV ou JSONL plutôt que de multiplier les appels (Doc). Ce n'est pas pertinent pour un usage individuel.

### 1.5 CORS et User-Agent depuis le navigateur

- **CORS : fonctionne (Observé)**. Les réponses v2 et v3 portent `access-control-allow-origin: *`. Le preflight (204) autorise les en-têtes `DNT, User-Agent, X-User-Agent, X-Requested-With, If-Modified-Since, Cache-Control, Content-Type, Range, If-None-Match, Authorization`. **La doc OFF consultée ne parle pas de CORS** (non confirmé côté doc).
- **User-Agent depuis le navigateur** : la doc OFF ne dit pas comment s'identifier quand on ne peut pas fixer le User-Agent (non confirmé). En pratique, les navigateurs ne laissent pas toujours le JavaScript de la page remplacer `User-Agent`. Cette dernière affirmation ne vient d'aucune page consultée et doit être vérifiée.
- **Alternative proposée par la doc** : aucune.
- **Ce que Popote peut faire** (proposition, sans garantie de prise en compte par OFF) :
  1. envoyer l'en-tête **`X-User-Agent: Popote/<version> (<contact>)`**. Le serveur l'accepte en CORS (Observé), mais son usage n'est pas documenté ;
  2. respecter strictement 15 lectures par minute, avec un cache local Dexie par code-barres ;
  3. ne pas appeler la recherche à chaque frappe.
- Le SDK JS officiel (`openfoodfacts-js`) permet de passer sa propre fonction `fetch` dans le navigateur. La façon dont il gère le User-Agent n'a pas été vérifiée (non confirmé).

### 1.6 Recherche texte

- La recherche structurée par filtres (`categories_tags_en`, `nutrition_grades_tags`, `countries_tags_en`, `fields`, `sort_by`, `page_size`…) est disponible via **`GET /api/v2/search`**. La recherche plein texte n'y est **pas disponible**. La doc indique « Legacy `/cgi/search.pl` only » pour le plein texte, et annonce Search-a-licious comme futur service dédié (Doc, intro API et tutoriel).
- Il n'existe pas de recherche en v3 (non trouvée dans la doc consultée).
- Recherche plein texte de l'ancienne API (paramètres observés, renvoie du JSON et fonctionne en CORS avec `*`) :

```
GET https://world.openfoodfacts.org/cgi/search.pl?search_terms=pates%20completes&search_simple=1&json=1&page_size=20&fields=code,product_name,brands,image_front_small_url
```

- La réponse contient `count`, `page`, `page_count`, `page_size`, `skip` et `products[]` (Observé, et cohérent avec le tutoriel). La doc ne fixe pas de taille de page maximale (non confirmé).
- Search-a-licious (`https://search.openfoodfacts.org/search?q=…`) répond en JSON (`hits[]`), mais **aucun en-tête `Access-Control-Allow-Origin` n'a été renvoyé** pour une origine externe (Observé). Le service est donc inutilisable depuis Popote en l'état, et sa doc n'a pas été consultée (non confirmé).
- **Limite** : 10 req/min. Il faut un debounce et une recherche lancée à la validation, pas à chaque frappe.

---

## 2. Open Prices (prices.openfoodfacts.org)

Sources :
- Schéma OpenAPI officiel, servi par l'API : https://prices.openfoodfacts.org/api/schema. Interface Swagger : https://prices.openfoodfacts.org/api/docs
- README de l'API : https://github.com/openfoodfacts/open-prices/blob/main/API.md
- Guide des données : https://github.com/openfoodfacts/open-prices/blob/main/docs/guides/data.md

Base : `https://prices.openfoodfacts.org/api/v1/`. La préproduction, pour les tests, est `https://prices.openfoodfacts.net` (Doc, API.md).

### 2.1 Authentification et licence

- **Lecture sans authentification** : `GET /api/v1/prices` déclare `security: [{}]` dans le schéma, donc aucune authentification. Les écritures (`POST`) exigent `CustomAuthentication` (Bearer) (Doc, schéma). Le README le confirme : « you can explore the data without an account ».
- **Licence** : ODbL. Il faut citer la source des données (Doc, API.md et data.md). Popote doit afficher une mention « Prix : Open Prices (Open Food Facts), ODbL ».

### 2.2 Lire des prix : `GET /api/v1/prices`

Filtres utiles relevés dans le schéma OpenAPI (Doc) :

| Besoin | Paramètres |
|---|---|
| Par code-barres | `product_code`, `product_code__in` (liste séparée par des virgules) |
| Produits sans code-barres (vrac, fruits et légumes) | `type=CATEGORY` + `category_tag` (ex. `en:tomatoes`). Filtres complémentaires : `labels_tags__contains`, `origins_tags__contains`. |
| Par type de prix | `type` = `PRODUCT` ou `CATEGORY` |
| Par lieu | `location_id`, `location_id__in`, `location_osm_id` + `location_osm_type` (`NODE`, `WAY`, `RELATION`), `location__osm_name__contains`, `location__type` (`OSM` ou `ONLINE`) |
| Par zone géographique | `lat` + `lon` + `radius_km`. Les trois sont obligatoires ensemble : « Must be sent together with … ». |
| Par date (date du prix) | `date`, `date__gt`, `date__gte`, `date__lt`, `date__lte`, `date__year`, `date__month` |
| Par date de saisie | `created__gte`, `created__lte` (date-time) |
| Par prix ou promo | `price__gte`, `price__lte`, `price_is_discounted`, `discount_type` |
| Par devise | `currency` (ex. `EUR`) |
| Par catégorie OFF du produit | `product__categories_tags__contains`, `product__categories_tags__overlap` |
| Tri | `order_by` (« Which field to use when ordering the results »). Exemple observé : `order_by=-date` donne les plus récents d'abord. La syntaxe `-champ` n'est pas décrite dans le schéma : elle est seulement observée. |
| Pagination | `page` (numéro) et `size` (taille de page) |

- La réponse paginée suit `PaginatedPriceFullList` : `{ items[], page, pages, size, total }` (Doc).
- **Taille de page maximale** : non documentée. `size=1000` a été ramené à **100** (Observé).

### 2.3 Format d'un prix (`PriceFull`, champs utiles)

D'après le schéma (Doc) :

| Champ | Contenu |
|---|---|
| `type` | `PRODUCT` (avec `product_code`) ou `CATEGORY` (avec `category_tag`, sans code-barres). |
| `product_code`, `product_name` | Code-barres et nom du produit. |
| `category_tag`, `labels_tags`, `origins_tags` | Catégorie, labels et origines, pour les prix sans code-barres. |
| `price` | Nombre. |
| `price_is_discounted`, `price_without_discount`, `discount_type` | Informations de promotion. |
| `price_per` | `UNIT`, `KILOGRAM` ou `LITER` (enum `PricePerEnum`), ou null. Observé : `KILOGRAM` sur les prix `CATEGORY`, `null` sur les prix `PRODUCT`. Pour un prix `PRODUCT`, le prix porte sur l'article, et `product.product_quantity` + `product_quantity_unit` permettent de calculer le prix au kilo. Cette interprétation n'est pas confirmée par la doc. |
| `currency` | Code ISO (`EUR`…). |
| `date` | Date `AAAA-MM-JJ` du constat. |
| `location_id`, `location_osm_id`, `location_osm_type` | Identifiants du lieu. |
| `location` | Objet `Location` imbriqué. |
| `product` | Objet produit imbriqué (`product_name`, `brands`, `image_url`, `product_quantity`, `product_quantity_unit`, `nutriscore_grade`…, Observé). |
| `proof` | Preuve (ticket ou étiquette). Le champ `type` vaut par exemple `PRICE_TAG` (Observé). |

Correspondance avec `PrixObservation` :
- `prix` ← `price` ;
- `date` ← `date` ;
- `cle` / `codeBarres` ← `product_code`, ou `alimentId` déduit de `category_tag` par une table de correspondance Popote ;
- `quantite` / `unite` ← `price_per` (`KILOGRAM` → 1000 g, `LITER` → 1000 ml, `UNIT` → 1 pièce), ou les quantités du produit ;
- `source` ← `'open-prices'` ;
- `magasinId` ← `Magasin` dont l'`osmId` vaut `location_osm_id`.

Exemple de réponse réduite (Observé, `GET /api/v1/prices?type=CATEGORY&category_tag=en:tomatoes&size=1&order_by=-date`) :

```json
{
  "items": [
    {
      "type": "CATEGORY",
      "product_code": null,
      "category_tag": "en:tomatoes",
      "labels_tags": [],
      "origins_tags": [],
      "price": 3.8,
      "currency": "EUR",
      "price_per": "KILOGRAM",
      "date": "2026-11-05",
      "location_osm_id": 67541829,
      "location_osm_type": "WAY",
      "location": { "id": 0, "osm_name": "…", "osm_address_city": "Cabriès", "osm_lat": 0, "osm_lon": 0 }
    }
  ],
  "page": 1, "pages": 375, "size": 1, "total": 375
}
```

### 2.4 Lieux : `/api/v1/locations`

Endpoints (Doc, schéma) :

| Endpoint | Usage |
|---|---|
| `GET /api/v1/locations` | Liste filtrable : `osm_address_city__like`, `osm_address_country__like`, `osm_name__like` (enseigne ou nom), `osm_tag_key`, `osm_tag_value` (ex. `shop` / `supermarket`), `osm_type`, `type` (`OSM` ou `ONLINE`), `price_count__gte`, `order_by`, `page`, `size`. |
| `GET /api/v1/locations/{id}` | Un lieu par son identifiant Open Prices. |
| `GET /api/v1/locations/osm/{osm_type}/{osm_id}` | Un lieu par son identifiant OpenStreetMap, ce qui correspond à `Magasin.osmType` + `osmId`. |
| `GET /api/v1/locations/nearby?lat=&lon=&radius_km=` | Lieux dans un rayon, triés par distance, avec un champ calculé `distance_km`. |
| `GET /api/v1/locations/compare?location_id_a=&location_id_b=` | Compare deux lieux : prix communs, dernier prix par lieu, total. Filtres : `date__gte`, `date__lte`, `price_is_discounted`. |
| `GET /api/v1/locations/osm/countries/{country_code}/cities` | Villes ayant des lieux, pour un pays donné. |

Un objet `Location` contient : `id`, `type`, `osm_id`, `osm_type`, `osm_name`, `osm_display_name`, `osm_brand`, `osm_tag_key`, `osm_tag_value`, `osm_address_postcode`, `osm_address_city`, `osm_address_country`, `osm_address_country_code`, `osm_lat`, `osm_lon`, `price_count`, `product_count`… (Doc). Le rattachement à OpenStreetMap passe par `osm_type` + `osm_id`.

### 2.5 Filtrer sur le Var (Taradeau, Draguignan, Le Luc, Les Arcs)

Méthodes possibles d'après le schéma (Doc) :

1. **Par rayon (recommandé)** : `GET /api/v1/prices?lat=43.455&lon=6.425&radius_km=25&order_by=-date&size=100`, centré sur Taradeau. Un rayon de 25 km couvre Draguignan, Les Arcs et Le Luc. Les coordonnées sont approximatives et ne viennent pas de la doc.
2. **Par ville** : `GET /api/v1/locations?osm_address_city__like=Draguignan`, puis `GET /api/v1/prices?location_id__in=…`.
3. **Par magasin connu** : `location_osm_id` + `location_osm_type` pris dans `Magasin`.

**Couverture réelle, très faible** (Observé le 15/11/2026) :
- `osm_address_city__like` : 1 lieu à Draguignan (3 prix), 0 à Taradeau, 0 au Luc, 0 aux Arcs ;
- `locations/nearby` à 25 km : 2 lieux (Draguignan, et un Intermarché à Aups) ;
- `prices` dans un rayon de 40 km : 35 prix au total, dont certains à Fréjus, les plus récents datant de février 2026.

Conséquences :
- Open Prices ne suffira pas seul pour les magasins locaux. Il faut le compléter par les tickets, les saisies manuelles et la table `prix-reference.json`.
- On peut élargir à des prix nationaux, par exemple `product_code` sans filtre de lieu, ou `category_tag` + `currency=EUR`, comme **estimation**, en signalant qu'il ne s'agit pas d'un prix local.

### 2.6 CORS, limites, données en masse

- **CORS : fonctionne (Observé)**. Les réponses renvoient l'origine appelante dans `access-control-allow-origin`, avec `access-control-allow-credentials: true`. Le preflight autorise `accept, authorization, content-type, user-agent, x-csrftoken, x-requested-with, x-user-agent`, avec `max-age 86400`. La doc ne mentionne pas CORS (non confirmé côté doc).
- **Limites de débit** : **non documentées** (non confirmé). Il faut rester sobre : cache local et rafraîchissement selon `Reglages.rafraichissementHeures`.
- **Identification de l'application** : non documentée pour Open Prices (non confirmé). Popote peut envoyer `X-User-Agent`, qui est autorisé en CORS (Observé).
- **Exports quotidiens** en JSONL gzip (Doc, data.md) :
  - `https://prices.openfoodfacts.org/data/prices.jsonl.gz` ;
  - `…/locations.jsonl.gz`, `…/products.jsonl.gz`, `…/proofs.jsonl.gz` ;
  - version Parquet sur Hugging Face (`openfoodfacts/open-prices`).
  - Ces fichiers sont trop lourds pour un navigateur mobile ; leur taille n'a pas été vérifiée. Ils pourraient servir à pré-calculer `prix-reference.json` hors ligne.

---

## 3. API Anthropic (Claude), appelée directement depuis le navigateur avec la clé de l'utilisateur

Sources :
- Authentification, et section « Browser-based applications » : https://platform.claude.com/docs/en/manage-claude/authentication
- Versions d'API : https://platform.claude.com/docs/en/api/versioning
- Messages (référence) : https://platform.claude.com/docs/en/api/messages/create
- Vision : https://platform.claude.com/docs/en/build-with-claude/vision
- Sorties structurées : https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Modèles : https://platform.claude.com/docs/en/about-claude/models/overview
- Tarifs : https://platform.claude.com/docs/en/about-claude/pricing
- Erreurs : https://platform.claude.com/docs/en/api/errors
- Limites de débit : https://platform.claude.com/docs/en/api/rate-limits
- List Models : https://platform.claude.com/docs/en/api/models/list
- SDK TypeScript, section « Browser usage » : https://platform.claude.com/docs/en/cli-sdks-libraries/sdks/typescript

### 3.1 URL et en-têtes

```
POST https://api.anthropic.com/v1/messages
```

| En-tête | Valeur | Source |
|---|---|---|
| `Authorization` | `Bearer <clé>` (forme principale). L'ancien `x-api-key: <clé>` est aussi accepté. | Doc, authentication |
| `anthropic-version` | **`2026-10-21`** (dernière version ; « Anthropic recommends using the latest API version »). | Doc, versioning |
| `content-type` | `application/json` | Doc |
| **`anthropic-dangerous-direct-browser-access`** | **`true`** : en-tête obligatoire pour un appel CORS depuis un navigateur. | Doc, authentication : « The API accepts these requests only when they include the `anthropic-dangerous-direct-browser-access: true` header » |
| `anthropic-workspace-id` | Seulement si la clé n'est pas rattachée à un workspace. Sans cet en-tête, l'API répond 400 avec un message explicite. | Doc, authentication |

- Avec le SDK `@anthropic-ai/sdk`, l'option `dangerouslyAllowBrowser: true` envoie cet en-tête (Doc).
- Observé : sans l'en-tête, la réponse ne contient pas `access-control-allow-origin`, donc le navigateur la bloque. Avec l'en-tête, la réponse renvoie `access-control-allow-origin: *`.
- **Version `2026-10-21`** : `temperature`, `top_p` et `top_k` sont **supprimés**, et les envoyer provoque une erreur 400 sur tous les modèles (Doc, versioning). Ne pas les envoyer. Le SDK TypeScript 1.0.0 est le premier à utiliser `2026-10-21` (Doc, SDK TypeScript).
- **Organisations bloquées** : les organisations avec ZDR, l'API Compliance ou certains autres réglages **ne peuvent pas** appeler l'API depuis un navigateur. Elles reçoivent un **401** dont le message commence par `CORS requests are not allowed for this Organization`, même avec une clé valide. Aucun réglage côté navigateur ne contourne ce blocage (Doc, authentication et errors). Popote doit afficher ce cas distinctement.

### 3.2 Requête Messages (format minimal)

```json
{
  "model": "claude-haiku-5-5",
  "max_tokens": 2048,
  "system": "Tu extrais les lignes d'un ticket de caisse français.",
  "messages": [
    { "role": "user", "content": "…" }
  ]
}
```

- `model`, `max_tokens` et `messages` sont les paramètres requis (Doc, messages/create).
- Le premier message doit avoir le rôle `user`.
- Le **prefill** n'est pas supporté sur Claude 4.6 et suivants : une conversation qui se termine par un message `assistant` renvoie 400. Il faut utiliser les sorties structurées à la place (Doc, errors).
- **Réglages de réflexion** (Doc, errors et models overview) :
  - `output_config.effort` vaut `low`, `medium`, `high`, `xhigh` ou `max`. Par défaut : `medium` sur Haiku 5.5, `high` sur Sonnet 5.5 ;
  - **Haiku 5.5** accepte `thinking: {"type": "disabled"}`, mais seulement avec un effort `high` ou inférieur ;
  - **Sonnet 5.5** refuse `disabled` (400). Pour désactiver la réflexion préalable, envoyer `thinking: {"type": "between_tools"}` (effort `high` ou inférieur).
  - Pour de l'extraction simple, `output_config: { "effort": "low" }` limite les coûts.

### 3.3 Envoi d'image (vision, par exemple un ticket de caisse)

Bloc à placer dans `content` (Doc, vision) :

```json
{
  "role": "user",
  "content": [
    { "type": "image", "source": { "type": "base64", "media_type": "image/jpeg", "data": "<base64 sans préfixe data:>" } },
    { "type": "text", "text": "Extrais les articles et leurs prix." }
  ]
}
```

Formats et limites (Doc, vision) :
- **Formats** : `image/jpeg`, `image/png`, `image/gif`, `image/webp`. Pour un GIF animé, seule la première image est utilisée.
- **Taille maximale par image** : **10 Mo encodé en base64** sur l'API Claude.
- **Requête entière** : 128 Mo au maximum, sinon erreur `413 request_too_large`.
- **Dimensions maximales** : 8000×8000 px. Au-delà de 20 images dans une requête, une limite plus stricte s'applique (environ 3000 px).
- **Nombre d'images** : jusqu'à 600 par requête pour les modèles à 1 M de tokens de contexte.
- **Coût** : `⌈largeur/28⌉ × ⌈hauteur/28⌉` tokens visuels. Les modèles « Claude 4.7 et suivants » (donc Haiku 5.5 et Sonnet 5.5) ont un bord long maximal de 2576 px et 4784 tokens visuels au plus. Au-delà, l'image est réduite.
- **Conseil Popote** : redimensionner le ticket côté client, par exemple à 1568 px de bord long, en JPEG de qualité correcte pour que le texte reste lisible. Cela fait environ 1 500 à 3 000 tokens d'entrée par image.

### 3.4 Sortie JSON stricte

Deux mécanismes, **stables, sans en-tête bêta** (Doc, structured-outputs). Haiku 5.5 et Sonnet 5.5 figurent dans la liste des modèles supportés.

**a) JSON outputs**, la solution recommandée pour Popote :

```json
"output_config": {
  "effort": "low",
  "format": {
    "type": "json_schema",
    "schema": {
      "type": "object",
      "properties": {
        "articles": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "libelle": { "type": "string" },
              "prix": { "type": "number" },
              "quantite": { "type": "number" }
            },
            "required": ["libelle", "prix", "quantite"],
            "additionalProperties": false
          }
        },
        "total": { "type": "number" }
      },
      "required": ["articles", "total"],
      "additionalProperties": false
    }
  }
}
```

- Le JSON valide arrive dans le **bloc `text`** de `content`. Il faut chercher ce bloc par son `type`, sans supposer qu'il est en `content[0]` (Doc).
- **Contraintes du schéma** (Doc) :
  - `additionalProperties: false` est obligatoire sur chaque objet ;
  - **non supportés** : `minimum`, `maximum`, `multipleOf`, `minLength`, `maxLength`, schémas récursifs, `$ref` externes, contraintes de tableau au-delà de `minItems` 0 ou 1. Les utiliser provoque une erreur 400.
- La première utilisation d'un schéma ajoute de la latence, le temps de compiler la grammaire (Doc).

**b) Outil strict** : mettre `strict: true` sur la définition de l'outil, avec `additionalProperties: false`. Attention, `tool_choice` `any` ou `tool` (outil forcé) renvoie une erreur 400 sur Opus 5.5, Sonnet 5.5 et Fable 5.x (Doc, errors). Utiliser `auto`, ou préférer a).

Toujours vérifier `stop_reason` avant de lire le JSON :
- `max_tokens` signifie que la sortie est tronquée ;
- `refusal` signifie que le modèle a refusé. `stop_details` donne alors la catégorie.

Valeurs possibles de `stop_reason` : `end_turn`, `max_tokens`, `stop_sequence`, `tool_use`, `pause_turn`, `refusal`, `model_context_window_exceeded` (Doc, messages/create).

### 3.5 Modèles à utiliser et prix

Source : models overview et pricing (Doc). Prix en USD par million de tokens (MTok), tarif standard.

| Usage Popote | Modèle | ID API | Entrée | Sortie | Contexte / sortie max |
|---|---|---|---|---|---|
| Rapide et économique (OCR de ticket, classement, correspondance d'aliments) | Claude Haiku 5.5 | `claude-haiku-5-5` | **0,10 $** (prompt ≤ 100 000 tokens) / 0,50 $ au-delà | **0,50 $** / 2,50 $ au-delà | 1 M / 128 K |
| Plus capable (génération de recettes, planning) | Claude Sonnet 5.5 | `claude-sonnet-5-5` | **2 $** | **10 $** | 1 M / 128 K |

- Les ID sont des instantanés figés, sans date à ajouter (Doc).
- Les lectures de cache coûtent 0,01 $/MTok sur Haiku 5.5 et 0,10 $/MTok sur Sonnet 5.5 (Doc, pricing). Le Batch API est à -50 %, mais il n'est pas pertinent pour une application interactive.
- Ordre de grandeur pour un ticket sur Haiku 5.5 : environ 3 000 tokens d'entrée et 500 de sortie, soit 0,0003 $ + 0,00025 $ ≈ **0,0006 $**. C'est un calcul indicatif, pas une valeur documentée.

### 3.6 Comptage des tokens (`usage`)

Chaque réponse contient `usage` (Doc, messages/create) :
- `input_tokens` ;
- `output_tokens`, qui inclut les tokens de réflexion. `output_tokens_details.thinking_tokens` en donne la part ;
- `cache_creation_input_tokens` et `cache_read_input_tokens` ;
- `service_tier`, `inference_geo`, `speed`.

Total des tokens d'entrée = `input_tokens + cache_creation_input_tokens + cache_read_input_tokens`.

Pour Popote, ajouter `input_tokens` (et les deux champs de cache) à `Reglages.tokensEntree`, et `output_tokens` à `Reglages.tokensSortie`, puis estimer le coût avec le tableau 3.5.

Pour estimer le coût avant d'envoyer, l'endpoint de comptage `POST /v1/messages/count_tokens` existe (Doc, errors, limites de taille). Son prix et ses limites de débit n'ont pas été vérifiés (non confirmé).

### 3.7 Erreurs

Format d'erreur (Doc, errors) :

```json
{ "type": "error", "error": { "type": "…", "message": "…" }, "request_id": "req_…" }
```

L'en-tête `request-id` est présent sur chaque réponse.

| Code | `error.type` | Traitement dans Popote |
|---|---|---|
| 400 | `invalid_request_error` | Requête invalide (schéma, prefill, `temperature`…). Aussi renvoyé quand une limite de dépense fixée par l'utilisateur est atteinte : le message commence par `You have reached your specified API usage limits`. |
| 401 | `authentication_error` | Clé invalide, révoquée ou expirée → « Vérifie ta clé ». Cas particulier : un message qui commence par `CORS requests are not allowed for this Organization` → « Ton organisation interdit l'appel depuis un navigateur ». |
| 402 | `billing_error` | Problème de paiement → renvoyer vers la Console. |
| 403 | `permission_error` | La clé n'a pas accès à la ressource. |
| 404 | `not_found_error` | Mauvais endpoint ou modèle inconnu. |
| 413 | `request_too_large` | Image trop lourde → la réduire. |
| 429 | `rate_limit_error` | Limite de débit : attendre `retry-after` secondes. Si `error.details.error_code` vaut `enforced_spend_limit_reached`, le plafond mensuel est atteint : il n'y a **pas** d'en-tête `retry-after` et réessayer est inutile. `ramp_limit_exceeded` signale une montée en charge trop brusque (Doc, rate-limits). |
| 500 | `api_error` | Réessayer avec un backoff exponentiel. |
| 504 | `timeout_error` | Délai dépassé : utiliser le streaming pour les longues réponses. |
| 529 | `overloaded_error` | API surchargée pour tous les utilisateurs : réessayer plus tard, ou basculer vers le mode sans IA. |

Le SDK officiel réessaie automatiquement deux fois les erreurs de connexion, 408, 409, 429 et ≥ 500 (Doc, SDK TypeScript).

En-têtes de limite renvoyés : `retry-after`, `anthropic-ratelimit-requests-remaining`, `anthropic-ratelimit-input-tokens-remaining`, `anthropic-ratelimit-output-tokens-remaining`… (Doc, rate-limits). Leur lisibilité depuis JavaScript en CORS n'a pas été vérifiée, car `access-control-expose-headers` n'a pas été observé (non confirmé).

À titre indicatif, le palier Start autorise 4 000 RPM sur Haiku 5.5 et Sonnet 5.5 (Doc, rate-limits). Les nouvelles organisations peuvent démarrer sur un palier Evaluation plus bas.

### 3.8 Tester la clé (endpoint léger)

```
GET https://api.anthropic.com/v1/models?limit=1
Authorization: Bearer <clé>
anthropic-version: 2026-10-21
anthropic-dangerous-direct-browser-access: true
```

- Cet appel ne génère aucun token de modèle : il liste les modèles disponibles (Doc, models/list). La doc ne dit pas explicitement qu'il est gratuit (non confirmé), mais il ne déclenche aucune inférence.
- Réponse attendue : 200 avec `data[]`. Une clé invalide donne 401 `authentication_error` avec le message `"invalid x-api-key"` (Observé).
- CORS : le preflight `GET /v1/models` renvoie 200 avec `access-control-allow-origin: *`, et une requête réelle portant l'en-tête navigateur renvoie aussi `*` (Observé).
- Variante : `GET /v1/models/claude-haiku-5-5` (Doc, `GET /v1/models/{model_id}`) confirme en plus que le modèle est accessible.
- Ce test **ne détecte pas** forcément le blocage CORS d'organisation (401 `CORS requests are not allowed…`) ni un plafond de dépense atteint. Le premier vrai appel `messages` reste la vérification finale (non confirmé).

### 3.9 Avertissement de sécurité (à afficher dans les réglages)

La doc est explicite :
- « Call the Claude API from your own back end, not from code that runs in your users' browsers. Anyone who uses a webpage can read an API key in that page's code » (Doc, authentication) ;
- côté SDK : « Enabling the `dangerouslyAllowBrowser` option can be dangerous because it exposes your secret API credentials in the client-side code » (Doc, SDK TypeScript).

Popote n'a pas de serveur, donc l'appel direct est le seul possible. Le risque est accepté sous les conditions suivantes :
1. **La clé appartient à l'utilisateur** et n'est jamais intégrée au code publié sur GitHub Pages.
2. Elle est stockée **uniquement en local** (`Reglages.cleApi` dans IndexedDB). Elle n'est envoyée qu'à `api.anthropic.com` et n'apparaît jamais dans les logs ni dans les exports de sauvegarde.
3. Il est conseillé de créer une **clé dédiée à Popote**, avec une **date d'expiration** (préréglages de 3 h à 30 jours, ou durée personnalisée) et une **limite de dépense** (Doc, authentication et rate-limits). Il faut aussi pouvoir la désactiver ou la supprimer depuis la Console en cas de doute.
4. Toute extension de navigateur ou tout script injecté (XSS) peut lire la clé. Il faut donc une CSP stricte, aucun script tiers et aucun `innerHTML` alimenté par des données externes (OFF, Open Prices, réponses de Claude).
5. Un bouton « Effacer la clé » doit exister.

---

## 4. Récapitulatif

| API | CORS navigateur OK ? | Authentification | Limite | Repli conseillé si indisponible |
|---|---|---|---|---|
| **Open Food Facts**, produit (`/api/v3/product/{code}`) | **Oui** : `ACAO: *` observé. Non mentionné dans la doc. | Aucune pour la lecture. User-Agent personnalisé demandé : depuis le navigateur, envoyer `X-User-Agent` (accepté, non documenté). | 15 req/min par IP (par utilisateur pour une application côté client). 503 si dépassement. | Cache Dexie des `Produit` déjà vus, puis saisie manuelle (`source: 'manuel'`). Un 404 signifie « produit inconnu » et mène à la saisie. |
| **Open Food Facts**, recherche (`/cgi/search.pl`, `/api/v2/search`) | **Oui** : `ACAO: *` observé. Search-a-licious : **non**, aucun ACAO observé. | Aucune | 10 req/min par IP, pas de recherche à chaque frappe. | Recherche locale dans `aliments.json` et dans le cache produits. |
| **Open Prices** (`/api/v1/prices`, `/api/v1/locations`) | **Oui** : l'origine est renvoyée dans ACAO (observé). Non mentionné dans la doc. | Aucune pour la lecture (`security: {}` dans OpenAPI). Bearer pour écrire. | Non documentée. Taille de page plafonnée à 100 (observé). | Tickets ou saisie manuelle, puis `prix-reference.json` (`estime: true`). Les prix nationaux peuvent servir d'estimation. Couverture du Var quasi nulle à ce jour. |
| **Anthropic** (`/v1/messages`, `/v1/models`) | **Oui, avec `anthropic-dangerous-direct-browser-access: true`** (doc). **Non** pour les organisations ZDR, Compliance ou dont les réglages l'interdisent (401 `CORS requests are not allowed…`). | Clé de l'utilisateur (`Authorization: Bearer` ou `x-api-key`) + `anthropic-version: 2026-10-21` | Selon le palier (Start : 4 000 RPM sur Haiku 5.5 / Sonnet 5.5), avec limites de montée en charge et plafond de dépense mensuel. 429 avec `retry-after`. 529 en cas de surcharge. | Mode sans IA (`iaActive: false`) : saisie manuelle du ticket et recettes de base (`recettes.json`). Pour une 429 ou 529, réessayer avec backoff, puis basculer. |

---

## Points non confirmés (à vérifier avant ou pendant l'implémentation)

1. **OFF** : la façon recommandée de s'identifier depuis un navigateur (User-Agent impossible à fixer). La doc n'en parle pas. `X-User-Agent` est accepté en CORS mais non documenté.
2. **OFF** : CORS n'est pas documenté, seulement observé.
3. **OFF** : les valeurs de `nutriscore_grade` hors `a`–`e`.
4. **OFF** : la taille de page maximale pour la recherche.
5. **OFF** : la disponibilité de Search-a-licious en CORS (non observée).
6. **Open Prices** : limites de débit, identification de l'application, CORS. Seul CORS est observé.
7. **Open Prices** : taille de page maximale (100 observé) et syntaxe `order_by=-champ` (observée).
8. **Open Prices** : l'interprétation de `price_per = null` sur les prix `PRODUCT` (prix à l'article).
9. **Anthropic** : la gratuité de `GET /v1/models` et le prix ou les limites de `count_tokens`.
10. **Anthropic** : l'exposition des en-têtes `anthropic-ratelimit-*` et `retry-after` à JavaScript en CORS.
