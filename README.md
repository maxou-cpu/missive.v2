# Missive

## Fichiers de l'application

- `public/index.html` contient la structure de la page.
- `public/correspondence.html` est la seconde page, ouverte par le bouton « Entrer ».
- `public/styles.css` contient son apparence.
- `public/app.js` contient le frontend et communique avec l'API.
- `server.js` sert les pages et fournit l'API de correspondance.

## Lancer en local

Il faut Node.js 18 ou une version plus récente. Depuis le dossier du projet :

```sh
npm start
```

Ouvrez ensuite <http://localhost:3000>. Arrêtez le serveur avec `Ctrl+C`.
Le backend enregistre les participants et les lettres dans `data/letters.json`.
Ce fichier est créé automatiquement et conservé entre les redémarrages.

Si le port 3000 est déjà utilisé, choisissez-en un autre :

```sh
PORT=3001 npm start
```

Ouvrez alors <http://localhost:3001>.

Pour vérifier le projet comme le fait le déploiement automatisé :

```sh
npm ci
npm run build
```

## Utiliser la correspondance à deux

Les deux personnes doivent ouvrir l'application servie par le même backend et
entrer le même code de duo. Le serveur écoute sur toutes les interfaces réseau
(`0.0.0.0`) : `localhost` reste accessible sur l'ordinateur où il est lancé, et
un port rendu public par l'environnement d'hébergement peut être joint depuis
l'extérieur. Pour échanger depuis des appareils différents, il faut déployer le
frontend et ce backend ensemble sur un hébergeur Node.js avec un disque
persistent. Firebase Hosting seul ne lance pas `server.js`.

Le code du duo et le prénom ne constituent pas une authentification forte.
N'utilisez pas ce serveur tel quel pour des correspondances sensibles ou pour
un déploiement public sans ajouter une authentification et une protection
adaptées.
