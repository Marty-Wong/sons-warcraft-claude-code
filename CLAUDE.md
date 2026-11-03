# Sons Warcraft pour Claude Code : mémoire du projet

Répliques de Warcraft III (VF d'origine, 2002) jouées par les hooks de Claude Code. L'utilisateur
choisit ses répliques sur une page d'écoute locale ; l'installateur télécharge les sons chez lui
et branche les hooks. Le README est pour les humains (et sa section « Pour Claude » pour l'agent
qui installe) ; ce fichier est pour qui travaille sur le code.

## Règles

- **Aucun son de Blizzard dans git** : ni mp3, ni ogg, ni `catalogue.json`. Tout ce qui est
  téléchargé ou produit chez l'utilisateur va dans `donnees/` (ignoré par git).
- Le hook n'écrit **rien sur stdout** (celui d'un UserPromptSubmit ou d'un SessionStart irait dans
  le contexte de Claude) et ne fait **jamais échouer** Claude Code : tout est rattrapé, code 0.
- Les tests n'écrivent jamais dans le vrai `~/.claude` : dossiers temporaires, avec
  `CLAUDE_CONFIG_DIR` et `SONS_WARCRAFT_DONNEES`.
- L'installateur ne touche qu'à nos 4 hooks : il garde tous les autres réglages et hooks,
  sauvegarde `settings.json` avant d'écrire, et ne branche jamais rien en double.
- Le journal dit ce qui s'est vraiment passé : la ligne s'écrit après la tentative de lecture,
  à l'heure du début du hook (« ▶ » joué, sinon « — pas joué : son absent / aucun lecteur de
  sons »). Volume 0 = muet : rien ne joue, « — muet : volume à 0 ».
- Tout est en français : identifiants, commentaires, messages, docs. Tutoiement.
- Logique dans des fonctions pures et testées (`regles.ts`, `travail.ts`, `coller.ts`, fusion de
  `installer.ts`, `systeme.ts`) ; les entrées-sorties restent minces autour.

## Comment ça marche

| Moment | Hook | Quand |
|--------|------|-------|
| `debut` | `SessionStart` (matcher `startup`) | une session s'ouvre : l'unité se présente |
| `envoi` | `UserPromptSubmit` | les messages de l'utilisateur (les sous-agents ne le déclenchent pas) |
| `insiste` | `UserPromptSubmit` | à la place d'`envoi` : 3 messages en moins d'une minute |
| `attente` ★ | `Notification` | Claude a une question ou demande une permission |
| `attente` ♥ | `Notification` (`idle_prompt`) | le rappel d'une minute sans réponse |
| `fini` ★ | `Stop` | la vraie fin : plus rien ne tourne en arrière-plan |
| `fini` ♥ | `Stop` | un agent rend son travail alors que d'autres tournent encore |

★ / ♥ (`etoiles` dans le choix) : parmi les répliques gardées d'`attente` et de `fini`,
★ = voix principales, ♥ = voix secondaires. Sans aucune ★, tout sert aux deux ; sans ♥, un moment
secondaire reste muet.

**Fin du travail** (`src/travail.ts`) : le hook lit la fin du transcript JSONL de la session
(8 Mo au plus, ~15 ms). Tâches lancées en arrière-plan = résultats d'outil qui COMMENCENT par
« Command running in background with ID », « Command did not complete … moved to the background
(ID », « Async agent launched successfully … agentId », « Workflow launched in background. Task
ID » ; revenues = `<task-id>` des notifications (messages `task-notification`, ou
`queued_command` quand elles arrivent pendant un tour). Tâches en cours après un retour d'agent
→ ♥ ; sinon ★, et la réplique suit le travail depuis le dernier message (`finSelonTravail`) :
fichier créé ou commandes qui produisent → « Travail terminé ! » ; fichiers modifiés →
« Amélioration terminée. » ; lectures et recherches → « Recherche terminée. » ; moins de 2 min
sans rien modifier, ou Claude qui rend la main pendant que des tâches tournent → « Prêt à
travailler ! ». Historique illisible : l'ancienne règle (message ou pas). Ces phrases viennent de
Claude Code : si une version les change, c'est ici qu'il faut regarder.

**Races** (`src/regles.ts`), deux modes (`raceParSession`) :
- toutes les races au hasard (par défaut) : `tirerSelonRaces` tire d'abord une race selon sa
  fréquence (souvent 3, parfois 2, rarement 1, jamais 0), parmi celles qui ont une réplique pour
  ce moment, puis une de ses répliques. Une race pèse autant avec une réplique qu'avec dix ;
- une race par session : `choisirRace` en donne une à chaque session, parmi les moins prises par
  les sessions ouvertes (registre `<dossier de Claude>/sessions/<pid>.json`, sinon 24 h), selon
  les mêmes poids. Tous les sons de la session viennent de sa race (à défaut, d'une autre).

Toujours muets : messages automatiques (`<task-notification>`, autre session, boucle `<<…>>`),
`claude -p` et le SDK (`CLAUDE_CODE_ENTRYPOINT=sdk-*`), session reprise pour `debut`. Jamais deux
fois de suite la même réplique pour un moment.

Le choix de départ (`CHOIX_PAR_DEFAUT`) : surtout le Paysan et le Péon, la ★ de fin toujours
humaine ou orque, des voix ♥ d'autres personnages pour les agents. Le fichier du hook est relu à
chaque appel : un changement du code vaut tout de suite pour toutes les sessions ouvertes.

## Installation (`src/installer.ts`)

`bun run installer` : prérequis (`systeme.ts`), téléchargement (`recuperer.ts`, reprend où il
s'est arrêté), fusion des hooks (`brancher` : pure, idempotente), page, son d'essai, mémo pour le
`CLAUDE.md` de l'utilisateur. Commande des hooks : `"<bun absolu>" "<dépôt>/src/hook.ts" <moment>`,
`async: true`. Une autre installation (un autre `…/src/hook.ts <moment>`) bloque, code 2, sauf
`--remplacer` ; les autres hooks qui jouent un son sont listés, jamais retirés.
`bun run desinstaller` (`debrancher`) ne retire que nos hooks, et le mémo. Si le résultat dit la
même chose (JSON canonique) que la sauvegarde d'avant l'installation la plus récente
(`settings.json.avant-sons-warcraft-<date>[-n]`), il réécrit le texte exact de cette sauvegarde :
settings.json revient octet pour octet.

Mémo (`src/memo.ts`) : un bloc entre `<!-- sons-warcraft:debut -->` et `<!-- sons-warcraft:fin -->`
dans `<dossier de Claude>/CLAUDE.md`. `memo ajouter` l'ajoute à la fin après une ligne vide (ou le
remplace sur place, idempotent ; crée le fichier s'il manque) ; `memo retirer` l'enlève avec cette
ligne vide (aller-retour octet pour octet si le fichier finissait par « \n » ; un fichier qui ne
contenait que lui est supprimé).

## Données

`donnees/` (ou `SONS_WARCRAFT_DONNEES`) : `sons/<id>.mp3`, `catalogue.json`, `choix.json`,
`sessions/`, `journal.log` (gardé sous 200 Ko), `sons.html`. La page garde son brouillon dans le
navigateur, rangé sous la date `maj` du choix : seul `appliquer` change `maj`, sinon les cœurs pas
encore copiés disparaissent.

## Commandes

```bash
bun run installer            # --sans-ouvrir --muet --remplacer --sans-telechargement
bun run desinstaller
bun run page                 # refait la page d'écoute et l'ouvre
bun run appliquer            # applique le texte copié (entrée standard)
bun run ecouter fini         # joue les répliques d'un moment
bun run journal 50           # les 50 derniers sons et leur raison
bun run recuperer            # retélécharge ce qui manque
bun src/cli.ts memo ajouter  # (ou retirer ; seul : l'affiche)
bun install && bun test      # 11 fichiers de tests
bun run lint                 # biome
bunx tsc --noEmit
```

## Fichiers

| Fichier | Rôle |
|---------|------|
| `src/hook.ts` | Entrée des hooks : moment, ★/♥, race, réplique ; note et joue |
| `src/regles.ts` | Règles pures : races, étoiles, réplique selon le travail, insistance, messages automatiques |
| `src/travail.ts` | Lecture du transcript : vraie fin ou retour d'agent, nature du travail |
| `src/session.ts` | État de chaque session (`donnees/sessions/<id>.json`) et races déjà prises |
| `src/installer.ts` | Installation et désinstallation ; fusion des hooks dans settings.json |
| `src/memo.ts` | Le mémo délimité du CLAUDE.md de l'utilisateur : afficher, ajouter, retirer |
| `src/systeme.ts` | Lecteur de sons, ouverture de la page, prérequis, selon le système |
| `src/lecture.ts` | Joue une réplique ; rend la raison quand elle n'a pas joué |
| `src/journal.ts` | `journal.log` |
| `src/tirage.ts` | Tirage au hasard sans répétition immédiate |
| `src/config.ts` | Chemins, adresse du dépôt (`DEPOT`), types, choix de départ |
| `src/coller.ts` | Lit le texte copié sur la page |
| `src/page.ts` | Génère la page d'écoute |
| `src/recuperer.ts` | Télécharge, normalise (-16 LUFS) et catalogue les répliques |
| `src/cli.ts` | installer, desinstaller, page, appliquer, ecouter, journal, memo [ajouter, retirer] |

## Source des sons

WoWWiki FR, pages « Répliques de Warcraft III/<race> » (texte de chaque réplique) et fichiers
audio .ogg (API MediaWiki). Unités retenues dans `UNITES` de `recuperer.ts` ; les feux follets ne
parlent pas, les goules seulement énervées ; une réplique de la Dryade est écartée (insulte). Le
serveur du wiki refuse les rafales : 2 téléchargements à la fois, trois essais espacés, et un
User-Agent qui donne l'adresse du dépôt. Fautes du wiki corrigées dans `CORRECTIONS` (vérifiées
à l'écoute). Conversion : silences coupés, -16 LUFS, limiteur, mp3 mono 44,1 kHz, écrit en
`.part` puis renommé.

## Conventions

Biome (tabulations, guillemets doubles), TypeScript strict, Bun seulement (pas de dépendance
d'exécution). Un changement de comportement = un test.
