# 🚇 Incidents Transports Franciliens

Application web statique qui suit, historise et visualise les incidents du
réseau de transport d'Île-de-France (Métro, RER, Transilien, Tramway, Bus),
à partir des données officielles **PRIM (Île-de-France Mobilités)**.

## Fonctionnalités

- **Menu principal par mode de transport** : Métro → RER → Transilien →
  Tramway → Bus, avec les logos de chaque ligne cliquables.
- **Historisation** des incidents (aucune perte de données : chaque
  incident est enregistré une seule fois, avec sa première et sa dernière
  observation).
- **Camembert par ligne** : répartition en pourcentage des types
  d'incidents les plus fréquents (cause : incident technique, grève,
  météo, travaux, accident de personne…).
- **Classement comparatif** entre toutes les lignes, trié par nombre
  d'incidents, pour repérer la ligne la plus perturbée.

## Comment ça marche

```
┌────────────────────┐   toutes les 15 min   ┌──────────────────────┐
│  API PRIM (IDFM)    │ ───────────────────►  │ GitHub Action        │
│  line_reports       │                       │ scripts/collect_...  │
└────────────────────┘                        └──────────┬───────────┘
                                                          │ commit
                                                          ▼
                                            data/incidents.json (historique)
                                                          │
                                                          ▼
                                       index.html + js/app.js (front statique)
                                          → GitHub Pages
```

Il n'y a **pas de serveur backend** : une GitHub Action interroge l'API
toutes les 15 minutes, met à jour `data/incidents.json` et le commite dans
le dépôt. Le site (déployé via GitHub Pages) est un simple front statique
qui lit ce fichier JSON.

## Mise en route

### 1. Obtenir une clé API PRIM (gratuite)

1. Créez un compte sur https://prim.iledefrance-mobilites.fr/
2. Dans l'espace développeur, abonnez-vous à l'API **« line_reports »**
   (ou « Disponibilité des données temps réel » → jeu de données
   Navitia), qui donne accès aux perturbations par ligne.
3. Récupérez votre clé (`apikey`).

### 2. Configurer le dépôt GitHub

1. Forkez / poussez ce projet sur votre compte GitHub.
2. Dans **Settings → Secrets and variables → Actions**, ajoutez un secret
   nommé `IDFM_API_KEY` avec la clé obtenue à l'étape 1.
3. Dans **Settings → Actions → General → Workflow permissions**,
   sélectionnez « Read and write permissions » (nécessaire pour que
   l'Action puisse committer `data/incidents.json`).
4. Le workflow `.github/workflows/collect-incidents.yml` se déclenche
   automatiquement toutes les 15 minutes. Vous pouvez aussi le lancer
   manuellement depuis l'onglet **Actions** (`workflow_dispatch`).

### 3. Déployer le site (GitHub Pages)

1. **Settings → Pages** → Source : « Deploy from a branch » → branche
   `main`, dossier `/ (root)`.
2. Votre site sera disponible à
   `https://<votre-utilisateur>.github.io/<votre-repo>/`.

### 4. Tester en local

Aucune compilation nécessaire, c'est du HTML/CSS/JS pur :

```bash
cd idfm-incidents
python3 -m http.server 8000
# puis ouvrez http://localhost:8000
```

Pour tester la collecte en local avant de la laisser tourner en Action :

```bash
export IDFM_API_KEY="votre_cle"
python3 scripts/collect_incidents.py
```

## Structure du projet

```
idfm-incidents/
├── index.html                     # page principale
├── css/style.css                  # styles
├── js/app.js                      # logique front (menu, camembert, classement)
├── data/
│   ├── lines.json                 # référentiel statique des lignes (codes, couleurs)
│   └── incidents.json             # historique des incidents (mis à jour par l'Action)
├── scripts/
│   └── collect_incidents.py       # appelle l'API PRIM et historise les incidents
└── .github/workflows/
    └── collect-incidents.yml      # planifie la collecte + commit auto
```

## Notes et limites

- **Bus** : le réseau IDFM compte plus d'un millier de lignes de bus, un
  menu à logos n'est donc pas praticable. L'onglet « Bus » propose à la
  place une recherche par numéro de ligne.
- Les couleurs/logos affichés sont une reconstitution simplifiée (cercles
  et carrés colorés en CSS) et non les pictogrammes officiels IDFM/RATP,
  pour éviter tout problème de droits d'auteur sur les logos réels.
- La catégorisation des incidents (camembert) se base sur le champ
  `cause` renvoyé par l'API PRIM, qui peut varier légèrement selon les
  opérateurs (RATP/SNCF/Transdev/Keolis…) : le classement des causes les
  plus fréquentes reflète donc le vocabulaire brut de l'API.
- Quota API PRIM : 20 000 requêtes/jour sur ce type d'API — une collecte
  toutes les 15 minutes (96 appels/jour) laisse une large marge.

## Évolutions possibles

- Ajouter des alertes (email / notification push) quand une ligne dépasse
  un seuil d'incidents sur une période donnée (le mot « prévienne » dans
  la demande initiale) : possible en ajoutant une étape dans le workflow
  qui compare le nombre de nouveaux incidents et envoie un webhook
  (Discord/Slack/mail) si un seuil est dépassé.
- Ajouter un export CSV de l'historique pour analyse externe.
- Passer le classement filtrable par période (7 jours, 30 jours, tout
  l'historique).
