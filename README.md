# MÉTÉO 11 — APK Android (CDT BENACER WALID)

Application hors-ligne : génération d'une Météo 11, lecture d'un bulletin réel, corrections de tir D-30 / 2C1 / 2C3
(Dm, ΔPm, Hausse corrigée), revue des tables, fond animé qui exprime le temps saisi.

## Méthode DMK officielle (bulletin approximatif)
Mode par défaut du générateur : ΔTv (table) → Tv → ΔT0 = Tv − 15,9 ; ΔH0 = H0 − 750 ; Δt, vitesses et directions par couche (200 → 4000 m)
d'après les tables du formulaire. Les tables sont dans `www/js/dmk-data.js` (transcrites d'une photo : les cellules douteuses sont
orange dans l'onglet Tables — à vérifier sur le livre et corriger dans ce fichier). Le mode « نموذج تدريبي » garde le modèle physique.

## Obtenir l'APK avec GitHub (une seule fois)
1. Créer un dépôt GitHub (privé conseillé) et y envoyer **tout le contenu de ce dossier**, y compris le dossier caché `.github/`.
   - En ligne de commande : `git init && git add -A && git commit -m "MÉTÉO 11" && git branch -M main && git remote add origin <URL> && git push -u origin main`
2. Onglet **Actions** → workflow **Build APK** (il démarre tout seul au push, ou bouton *Run workflow*).
3. Quand il est vert (≈ 6-10 min) : ouvrir l'exécution → **Artifacts** → `METEO11-apk` → télécharger → décompresser → `METEO11.apk`.
4. Copier l'APK sur le téléphone et l'installer (autoriser « sources inconnues » pour le navigateur / le gestionnaire de fichiers).

Pour publier dans *Releases* : créer un tag `v1.0` (`git tag v1.0 && git push --tags`) ; l'APK est joint automatiquement.

## Modifier
- Tables de tir : remplacer `www/tables/D30.json`, `2C1.json`, `2C3.json` (même format que l'application Tkinter).
- Moteur : `www/js/meteo.js` (identique au moteur Python — vérifié sur 300 cas aléatoires).
- Fonds météo : `www/js/weather.js` ; interface : `www/js/app.js`, `www/css/style.css`.
- Icône / écran de démarrage : `resources/` (le script `scripts/prepare-android.js` les installe au build).

## Test rapide sur PC (sans Android)
`cd www && python -m http.server 8000` puis ouvrir http://localhost:8000
