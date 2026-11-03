# Sons Warcraft pour Claude Code

Les répliques de **Warcraft III en VF d'origine (2002)** pendant que tu travailles avec
[Claude Code](https://github.com/anthropics/claude-code). Tu envoies un message : « Oui
monseigneur ! ». Claude a fini : « Travail terminé ! ». Il a une question : « Que dois-je faire ? ».
Et si tu insistes trop, le Péon s'énerve : « Occupé ! Oubliez-moi ! ».

> **Tu es Claude Code (ou un autre agent) et on te demande d'installer cet outil ?**
> Va directement à la section [Pour Claude : installation pas à pas](#pour-claude--installation-pas-à-pas).
> Pour le retirer : [Pour Claude : désinstaller](#pour-claude--désinstaller).

## Ce que tu entends

| Moment | Quand | Par exemple |
|---|---|---|
| Ouverture | une session de Claude Code s'ouvre | « Prêt à travailler ! » (Péon) |
| Envoi | tu envoies un message | « Oui monseigneur ! », « Du travail, encore du travail… » |
| Insistance | 3 messages en moins d'une minute | « Occupé ! Oubliez-moi ! » |
| Attente ★ | Claude a une question ou demande une permission | « Que dois-je faire ? » |
| Attente ♥ | le rappel, au bout d'une minute sans réponse | « Je suis prête ! » (Archère) |
| Fin ★ | **la vraie fin** : ta demande est faite et plus rien ne tourne | « Travail terminé ! » |
| Fin ♥ | un agent rend son travail, mais d'autres tournent encore | « Prêt à l'action. » (Fantassin) |

- **★ et ♥ : tu sais à l'oreille si c'est la vraie fin.** Les voix principales ★ annoncent les vrais
  moments ; les voix secondaires ♥, d'autres personnages, annoncent le reste.
- **La fin dit ce qui a été fait.** « Recherche terminée. » après des lectures et des recherches,
  « Amélioration terminée. » après des fichiers modifiés, « Travail terminé ! » après une création
  ou des commandes qui produisent, « Prêt à travailler ! » après une réponse de moins de 2 minutes.
- **Toutes les races au hasard** (par défaut) : chaque son tire sa race. Humains et orcs sortent
  « souvent », morts-vivants et elfes de la nuit « parfois » : un léger avantage aux premiers.
  Ou bien **une race par session** : chaque session garde la sienne, et tu sais laquelle parle.
- Jamais deux fois de suite la même réplique.
- **Toujours muets** : les sous-agents, les messages automatiques (fin d'une tâche, autre session),
  `claude -p` et les scripts du SDK, et les sessions reprises (pour l'ouverture).

Le choix de départ fait surtout parler le Paysan et le Péon. La vraie fin (★) est toujours
humaine ou orque. Tu changes tout ça sur la page d'écoute : 435 répliques des quatre races, du
Paysan à Illidan.

## Ce qu'il te faut

- **Claude Code**.
- **[Bun](https://bun.sh) 1.1 ou plus récent** : `curl -fsSL https://bun.sh/install | bash`.
- **ffmpeg** (avec ffprobe), pour convertir les répliques : `brew install ffmpeg` sur Mac.
- **macOS** : c'est là que l'outil a été essayé. Linux et Windows sont prévus (lecture par
  `ffplay` ou `mpg123`), mais pas encore essayés : dis-le si ça coince.
- Une connexion internet pour le premier téléchargement : environ 435 répliques, 10 Mo.

## Installation

### A. Le plus simple : demande à Claude

Ouvre Claude Code et colle-lui cette phrase :

```text
Installe-moi les sons Warcraft pour Claude Code en suivant le README de https://github.com/Marty-Wong/sons-warcraft-claude-code
```

Il vérifie ce qu'il faut, installe, et te pose les questions qui te reviennent : par exemple,
retirer ou non tes anciens sons s'il en trouve.

### B. À la main, en 3 commandes

```bash
git clone https://github.com/Marty-Wong/sons-warcraft-claude-code ~/.claude/sons-warcraft
cd ~/.claude/sons-warcraft
bun run installer
```

Puis **relance Claude Code** : les hooks sont lus à l'ouverture d'une session.

L'installateur :

1. vérifie Bun, ffmpeg et le lecteur de sons, et te dit quoi installer s'il manque quelque chose ;
2. télécharge les répliques depuis WoWWiki FR et les met toutes au même volume. Ça prend
   quelques minutes la première fois, et ça reprend là où ça s'est arrêté si tu le relances ;
3. ajoute 4 hooks au `settings.json` de Claude Code, à côté des tiens. Il est dans `~/.claude`,
   ou dans le dossier de `CLAUDE_CONFIG_DIR` si tu l'as changé. L'installateur fait d'abord une
   sauvegarde (`settings.json.avant-sons-warcraft-<date>`). Il peut remettre le fichier en
   forme (espaces, retours à la ligne), sans en changer le contenu. Il te signale aussi les
   autres hooks qui jouent déjà un son, sans y toucher ;
4. joue « Prêt à travailler ! » et ouvre la page d'écoute.

Ensuite, `bun src/cli.ts memo ajouter` ajoute un court mémo à ton `CLAUDE.md`. Avec lui, tes
prochaines sessions de Claude savent d'où vient un son et comment appliquer ton choix.
`bun src/cli.ts memo retirer` l'enlève.

## Choisir tes répliques

1. `bun run page` ouvre la page d'écoute (`donnees/sons.html`) dans ton navigateur.
2. Clique sur une réplique pour l'écouter. Clique sur le cœur pour la garder : ♡ → ♥ gardée →
   ★ voix principale (pour l'attente et la fin) → ♡.
3. En haut :
   - le volume, avec un bouton « Essayer » ; tout à gauche, c'est muet ;
   - toutes les races au hasard, ou une race par session ;
   - la fréquence de chaque race : souvent, parfois, rarement, jamais ;
   - la fin qui suit le travail.
4. En bas, **Copier mon choix**, puis colle le texte dans Claude Code : il l'applique.
   Sans Claude : `bun run appliquer`, colle le texte, puis Ctrl-D.

La page garde ton brouillon dans le navigateur tant que tu ne l'as pas appliqué. Le bouton
« Revenir au choix enregistré » l'efface.

## « D'où vient ce son ? »

Chaque son laisse une ligne dans le journal : l'heure, le moment, la race, la session, la
réplique, et la raison. La ligne s'écrit après la lecture : elle dit si le son a vraiment joué.

```console
$ bun run journal
03/11 19:20:09  envoi     toutes     1a2b3c4d  mon-projet  ▶ « Oui monseigneur ! » (Paysan) · « Ajoute un bouton de partage… »
03/11 19:22:08  fini ★    toutes     1a2b3c4d  mon-projet  ▶ « Amélioration terminée. » (annonce humains) · fin du travail : amélioration, 2 min
03/11 19:23:09  attente ♥ toutes     1a2b3c4d  mon-projet  ▶ « Je suis prête ! » (Archère) · rappel : une minute sans réponse
```

Un son « tout seul » vient souvent d'une **autre session** ouverte, dont un agent vient de
finir : le journal te dit laquelle. Quand rien n'a joué, il dit pourquoi : « muet : volume à 0 »,
« pas joué : son absent » ou « pas joué : aucun lecteur de sons ».

## Commandes

À lancer dans le dossier de l'outil (`cd ~/.claude/sons-warcraft`).

| Commande | Ce qu'elle fait |
|---|---|
| `bun run installer` | télécharge les répliques, branche les hooks, ouvre la page. Options : `--sans-ouvrir`, `--muet`, `--remplacer`, `--sans-telechargement` |
| `bun run page` | refait la page d'écoute et l'ouvre |
| `bun run appliquer` | applique le texte copié sur la page (sur l'entrée standard) |
| `bun run ecouter fini` | joue les répliques gardées d'un moment : `envoi`, `attente`, `fini`, `insiste`, `debut` |
| `bun run journal 50` | les 50 derniers sons et leur raison |
| `bun run recuperer` | retélécharge les répliques qui manquent |
| `bun src/cli.ts memo` | affiche le mémo pour ton `CLAUDE.md` |
| `bun src/cli.ts memo ajouter` | l'ajoute à ton `CLAUDE.md` (ou le met à jour) ; `memo retirer` l'enlève |
| `bun run desinstaller` | débranche les hooks et retire le mémo |

## Mettre à jour

```bash
cd ~/.claude/sons-warcraft && git pull && bun run installer
```

L'installateur ne refait que ce qui manque, et ne branche jamais rien en double.

## Désinstaller

```bash
cd ~/.claude/sons-warcraft && bun run desinstaller
```

Il retire ses 4 hooks de `settings.json` et le mémo de ton `CLAUDE.md`. Si tu n'as rien changé
d'autre dans `settings.json` entre-temps, il le remet exactement comme avant l'installation.

Deux sauvegardes restent à côté de `settings.json` :
- `settings.json.avant-sons-warcraft-<date>`, faite à l'installation ;
- `settings.json.avant-desinstallation-sons-warcraft-<date>`, faite à la désinstallation.

Pour tout effacer (code, sons, choix, journal), supprime ensuite le dossier
`~/.claude/sons-warcraft`, puis ces deux sauvegardes si tu n'en as plus besoin.

## Questions fréquentes

**Je n'entends rien.**
- As-tu relancé Claude Code depuis l'installation ?
- Le volume est peut-être à 0 (muet) : regarde sur la page.
- Essaie `bun run ecouter fini`.
- Regarde `bun run journal` : une ligne « muet : … » ou « pas joué : … » dit pourquoi un son
  n'a pas joué.
- Dans Claude Code, `/hooks` montre les hooks branchés.

**C'est trop fort, ou pas assez.**
Règle le volume sur la page (bouton « Essayer »), puis « Copier mon choix » et colle le texte à
Claude.

**J'entends deux sons à la fois.**
Un autre hook joue aussi un son : l'installateur te l'a signalé. Retire-le de `settings.json`, ou
demande à Claude de le faire.

**Le téléchargement s'arrête, ou le wiki refuse.**
WoWWiki FR n'aime pas les rafales. Relance `bun run installer` un peu plus tard : ça reprend.

**« Une autre installation des sons Warcraft est déjà branchée ».**
Tu as déjà installé l'outil dans un autre dossier, ou tu l'as déplacé. Pour garder celui-ci :
`bun run installer --remplacer`.

**Et sur Linux ou Windows ?**
C'est prévu : `ffplay` ou `mpg123` pour le son, `xdg-open` ou `start` pour la page. Mais ce
n'est pas encore essayé : ouvre une issue si ça coince.

**Mes messages partent quelque part ?**
Non. Tout reste sur ton ordinateur. Le journal garde les 40 premiers caractères de chaque
message dans `donnees/journal.log`, pour expliquer d'où vient chaque son. Seul le
téléchargement des répliques contacte WoWWiki FR.

## Les sons et les droits

- **Aucun son n'est dans ce dépôt.** Les répliques de Warcraft III appartiennent à Blizzard
  Entertainment. L'installateur les télécharge sur ton ordinateur, depuis le wiki communautaire
  WoWWiki FR, pour ton usage perso. Ne les republie pas et ne les partage pas.
- C'est un **projet de fan**, ni affilié à Blizzard Entertainment ni approuvé par lui.
  Warcraft est une marque de Blizzard Entertainment, Inc.
- Les textes des répliques viennent des pages « Répliques de Warcraft III » de WoWWiki FR. Quelques
  fautes y sont corrigées, après réécoute.

## Pour Claude : installation pas à pas

Ces étapes s'adressent à l'agent qui installe l'outil pour l'utilisateur. Parle-lui simplement,
en français, et demande son accord avant d'installer un logiciel ou de toucher à un de ses
fichiers. Le dossier de Claude Code est `~/.claude`, ou le dossier de `CLAUDE_CONFIG_DIR` si
l'utilisateur l'a changé.

1. **Les prérequis.**
   - Vérifie `bun --version` (1.1 ou plus), `ffmpeg -version` et `ffprobe -version`.
   - Le lecteur de sons : sur macOS, `afplay` est livré avec le système ; ailleurs, `ffplay` ou
     `mpg123`.
   - S'il manque quelque chose, propose la commande et attends son accord avant de lancer :
     `brew install ffmpeg`, `curl -fsSL https://bun.sh/install | bash`, `sudo apt install ffmpeg`…
2. **Le clone.**
   - Lance `git clone https://github.com/Marty-Wong/sons-warcraft-claude-code ~/.claude/sons-warcraft`.
   - Si le dossier existe déjà : `git -C ~/.claude/sons-warcraft pull`.
   - Ne déplace pas le dossier ensuite : les hooks pointent vers lui.
3. **L'installation.** Lance `cd ~/.claude/sons-warcraft && bun run installer`.
   - Compte quelques minutes : environ 435 téléchargements, convertis avec ffmpeg. Donne-lui un
     long délai (10 minutes) ou lance-le en arrière-plan.
   - À la fin, il joue un son et ouvre la page d'écoute : préviens l'utilisateur.
4. **Lis ce qu'il affiche, et son code de sortie.**
   - **0** : c'est installé.
   - **1** : il manque un outil, OU le téléchargement a raté, OU `settings.json` est illisible.
     Lis le message. Il dit quoi installer, ou qu'il faut relancer plus tard (le téléchargement
     reprend où il s'était arrêté), ou quel fichier corriger.
   - **2** : une autre installation des sons Warcraft est déjà branchée. Demande à l'utilisateur,
     puis, s'il est d'accord, lance `bun run installer --remplacer`.
   - « D'autres hooks jouent déjà un son » : ce sont SES sons, pas les nôtres. Montre-lui ces
     lignes et demande-lui s'il veut les retirer. Sans son accord, n'y touche pas. Avec son
     accord, fais d'abord une copie de `settings.json`, puis retire seulement ces commandes-là.
5. **Le mémo.** Propose `bun src/cli.ts memo ajouter`, et lance-le seulement avec son accord. Il
   ajoute à son `CLAUDE.md` un court bloc délimité (`<!-- sons-warcraft:debut -->` …
   `<!-- sons-warcraft:fin -->`), avec les vrais chemins. N'écris pas ce bloc à la main.
   Ses prochaines sessions sauront alors :
   - répondre à « d'où vient ce son ? » ;
   - appliquer un texte collé qui commence par « Sons Warcraft : mon choix ».
6. **Explique-lui la suite.**
   - Il doit relancer Claude Code : les hooks sont lus à l'ouverture d'une session.
   - Il choisit ses répliques sur la page : ♥ pour garder, ★ pour une voix principale, puis
     « Copier mon choix », et il te colle le texte.
   - `bun run journal` dit d'où vient chaque son.
7. **Quand il te colle un texte qui commence par « Sons Warcraft : mon choix ».**
   - La commande exacte est à la fin de ce texte : « (Pour Claude : bun "…/src/cli.ts"
     appliquer, avec ce texte sur l'entrée standard.) ». Elle est aussi dans le mémo.
   - Prends le chemin là, jamais un chemin écrit en dur :
     ```bash
     bun "<le chemin de cli.ts donné à la fin du texte>" appliquer <<'EOF'
     (le texte collé, tel quel)
     EOF
     ```
   - Puis redis-lui en clair ce qui joue maintenant.
8. **À ne jamais faire.**
   - Modifier NOS hooks à la main dans `settings.json` : c'est l'installateur (et le
     désinstallateur) qui s'en occupe. Ses autres sons, eux, ne se retirent qu'avec son accord,
     après une copie (étape 4).
   - Committer, publier ou partager les sons : le dossier `donnees/` reste sur son ordinateur.
   - Laisser les hooks pointer vers un ancien dossier. Si le dossier est déplacé, relance
     `bun run installer --remplacer` depuis le nouveau.

## Pour Claude : désinstaller

1. Lance `cd ~/.claude/sons-warcraft && bun run desinstaller`.
   - Il retire nos 4 hooks de `settings.json` et le mémo de son `CLAUDE.md`.
   - Si rien d'autre n'a changé, il remet `settings.json` exactement comme avant l'installation.
2. Ensuite, demande avant d'effacer quoi que ce soit :
   - le dossier de l'outil (`~/.claude/sons-warcraft` : code, sons, choix, journal) ;
   - les deux sauvegardes à côté de `settings.json` :
     - `settings.json.avant-sons-warcraft-<date>` ;
     - `settings.json.avant-desinstallation-sons-warcraft-<date>`.

## Comment ça marche

Les 4 hooks lancent `src/hook.ts` en arrière-plan (`async`), sans rien écrire dans la
conversation. À chaque appel, le hook :

1. lit ton choix (`donnees/choix.json`) et ce qu'il retient de la session ;
2. pour la fin, lit la fin de l'historique de la session. Il sait ainsi si c'est la vraie fin ou un
   agent qui rend son travail, et quel travail a été fait ;
3. tire une réplique, la note au journal et la joue (`afplay` sur macOS).

Le détail, pour qui veut contribuer, est dans [CLAUDE.md](CLAUDE.md). Les tests :
`bun install && bun test`.

## Licence

- Le code est sous licence [MIT](LICENSE).
- Les sons ne sont pas inclus : ils appartiennent à Blizzard Entertainment.
