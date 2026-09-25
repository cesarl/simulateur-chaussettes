# Mise en place du simulateur de chaussettes — pas à pas (Windows)

Temps estimé : 15 minutes. À faire une fois, avant de partir voir tes clients.

## 1. Sortir le projet du Google Drive
Un projet de code ne doit pas vivre dans un dossier Google Drive : `node_modules` (des dizaines de milliers de fichiers) et `.git` s'y synchronisent mal et peuvent se corrompre.

1. Crée un dossier local, par exemple `C:\Projets\`.
2. Décompresse `simulateur-chaussettes.zip` dedans → `C:\Projets\simulateur-chaussettes\`.
   Le dossier contient déjà un dépôt Git avec un premier commit (le dossier caché `.git`).

Ce dossier Drive ne garde que la documentation (ce guide, l'archive).

## 2. Vérifier Node.js
Dans un terminal (PowerShell) : `node -v`. Il faut **v22 ou plus**. Sinon, installe la version LTS depuis nodejs.org.

## 3. Créer le dépôt GitHub
1. Sur github.com → **New repository** → nom `simulateur-chaussettes`, **Private**, **sans** README ni .gitignore (le projet les a déjà).
2. Dans PowerShell :
   ```powershell
   cd C:\Projets\simulateur-chaussettes
   git remote add origin https://github.com/<ton-compte>/simulateur-chaussettes.git
   git push -u origin main
   ```
   (Ou avec GitHub Desktop : *Add existing repository* → ce dossier → *Publish repository*, en privé.)

## 4. Ouvrir dans Cursor et tester l'installation
1. Cursor → *Open Folder* → `C:\Projets\simulateur-chaussettes`.
2. Dans le terminal de Cursor :
   ```powershell
   npm install
   npx playwright install chromium
   npm run verify
   ```
   Tu dois voir `3 passed` (tests unitaires) puis `1 passed` (test navigateur).
3. `npm run dev` puis ouvre http://localhost:5173 : un cylindre rouge tourne à la souris. C'est normal, l'agent va le remplacer par la chaussette.

## 5. Lancer l'agent — deux façons

### Option A (recommandée quand tu es absent) : agent cloud
L'agent tourne sur une machine de Cursor, ton ordinateur peut être fermé. Il faut un abonnement Cursor payant et GitHub connecté à Cursor.
1. Va sur **cursor.com/agents** (ou, dans Cursor, choisis **Cloud** dans le menu sous la zone de saisie de l'agent).
2. Choisis le dépôt `simulateur-chaussettes`, branche `main`.
3. Colle le message de `docs/PROMPT_LANCEMENT.md`.
4. L'agent travaille sur une branche à part et pousse ses commits ; tu relis et fusionnes (pull request) à ton retour. Tu peux suivre depuis ton téléphone.

### Option B : agent local dans Cursor
1. Ouvre le panneau Agent, choisis un modèle puissant.
2. Dans les réglages de l'agent, autorise l'exécution automatique des commandes du terminal (au minimum `npm`, `npx`, `git`), sinon il s'arrêtera à chaque commande pour te demander la permission.
3. Colle le message de `docs/PROMPT_LANCEMENT.md`.
4. Laisse l'ordinateur allumé, sur secteur, sans mise en veille. Si l'agent s'arrête en route, colle le message « Pour relancer » du même fichier.

## 6. À ton retour
1. Lis `docs/PROGRESS.md` (section « Point pour César » en bas) et `docs/DECISIONS.md`.
2. Regarde `tasks/TASKS.md` : cases cochées = critères vérifiés.
3. `git pull` (ou fusionne la pull request de l'agent cloud), `npm install`, `npm run dev`, et teste avec tes vrais carreaux.

## 7. Après l'appel avec le fabricant
1. Reporte ses réponses (voir `docs/QUESTIONS_FABRICANT.md`) dans `config/sizes.json` : aiguilles, rangs par zone, jauge, couleurs max, flotté max.
2. Commit, push, puis relance l'agent sur la tâche T18 (« Valeurs fabricant »).

## Conseils
- Si tu veux que l'agent reprenne la logique de ton simulateur de carreaux, dépose son code (sans `node_modules`) dans le dossier `reference/` avant de lancer l'agent.
- Ne modifie pas les fichiers pendant que l'agent travaille (sauf `config/sizes.json` entre deux sessions).
- Les exports PNG de la vue 3D sont prévus pour l'IA d'image : fond uni, 2048 px, 5 angles fixes. Donne à l'IA la consigne de conserver le motif et de ne changer que la matière, la lumière et la mise en scène.
