import { MARQUE } from "./coller";
import {
	AVEC_ETOILES,
	type Choix,
	CLI,
	DEPOT,
	EVENEMENTS,
	type Evenement,
	NOMS_DES_RACES,
	nomUnite,
	RACES,
	type Race,
	type Replique,
} from "./config";
import { INSISTANCE, VRAI_TRAVAIL_MS } from "./regles";

/**
 * Page d'écoute (donnees/sons.html, fichier local ouvert dans le navigateur) :
 * chaque réplique s'écoute d'un clic ; ♥ la garde, ★ en fait une voix principale ;
 * « Copier mon choix » donne le texte à coller à Claude (lu par `cli.ts appliquer`).
 */

const MINUTES_DE_TRAVAIL = VRAI_TRAVAIL_MS / 60_000;

/** titre et quand : la page ; copie : le texte copié, à la première personne. */
const MOMENTS: Record<
	Evenement,
	{ titre: string; quand: string; copie: string }
> = {
	envoi: {
		titre: "Quand tu envoies un message",
		quand: "L'unité reçoit ton ordre.",
		copie: "Quand j'envoie un message",
	},
	attente: {
		titre: "Quand Claude t'attend",
		quand:
			"★ Claude a une question ou demande une permission. ♥ Le rappel quand tu n'as pas répondu depuis une minute.",
		copie: "Quand Claude m'attend",
	},
	fini: {
		titre: "Quand le travail est fini",
		quand: `★ La vraie fin : ta demande est faite et plus rien ne tourne en arrière-plan. La réplique suit le travail : « Recherche terminée » après une recherche, « Amélioration terminée » après des modifications, « Travail terminé ! » après une construction, « Prêt à travailler ! » après une réponse de moins de ${MINUTES_DE_TRAVAIL} minutes. ♥ Un agent rend son travail alors que d'autres tournent encore.`,
		copie: "Quand le travail est fini",
	},
	insiste: {
		titre: "Quand tu insistes",
		quand: `${INSISTANCE.messages} messages en moins d'une minute dans la même session : l'unité s'énerve, comme quand on cliquait trop sur un péon.`,
		copie: "Quand j'insiste",
	},
	debut: {
		titre: "Quand une session s'ouvre",
		quand:
			"L'unité se présente : avec une race par session, tu sais tout de suite laquelle tu as.",
		copie: "Quand une session s'ouvre",
	},
};

function esc(texte: string): string {
	return texte
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

/** Espaces insécables avant ? ! : ; » et après « : rien ne passe seul à la ligne. */
function typo(texte: string): string {
	return esc(texte)
		.replace(/ ([?!:;»])/g, "&nbsp;$1")
		.replace(/« /g, "«&nbsp;");
}

const ICONE_LECTURE =
	'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2v9.6L12.6 8z"/></svg>';

function ligne(r: Replique, evenement: Evenement): string {
	return `<li class="ligne" data-id="${r.id}">
<button type="button" class="jouer" aria-label="Écouter « ${esc(r.texte)} »">${ICONE_LECTURE}</button>
<span class="texte">${typo(r.texte)}</span>
<button type="button" class="garde" data-ev="${evenement}" value="${r.id}" data-texte="${esc(r.texte)}"></button>
</li>`;
}

/** Unités d'une race : l'ouvrier d'abord, les annonces en tête pour la fin du travail. */
function unites(
	repliques: Replique[],
	evenement: Evenement,
): [string, Replique[]][] {
	const groupes = new Map<string, Replique[]>();
	for (const r of repliques)
		groupes.set(r.unite, [...(groupes.get(r.unite) ?? []), r]);
	const rang = (unite: string, liste: Replique[]) => {
		if (unite === "Annonces") return evenement === "fini" ? 0 : 2;
		return liste[0].principale ? 1 : 3;
	};
	return [...groupes.entries()].sort(
		([a, la], [b, lb]) => rang(a, la) - rang(b, lb),
	);
}

function blocRace(
	race: Race,
	repliques: Replique[],
	evenement: Evenement,
): string {
	const groupes = unites(repliques, evenement)
		.map(
			([unite, liste]) => `<div class="unite">
<h4>${esc(unite)}</h4>
<ul>${liste.map((r) => ligne(r, evenement)).join("")}</ul>
</div>`,
		)
		.join("");
	return `<div class="race ${race}" id="${evenement}-${race}">
<h3><span class="blason" aria-hidden="true"></span>${NOMS_DES_RACES[race]}</h3>
<div class="unites">${groupes}</div>
</div>`;
}

function section(evenement: Evenement, catalogue: Replique[]): string {
	const { titre, quand } = MOMENTS[evenement];
	const ici = catalogue.filter((r) => r.evenements.includes(evenement));
	const races = RACES.filter((race) => ici.some((r) => r.race === race));
	const liens = races
		.map(
			(race) =>
				`<a class="vers ${race}" href="#${evenement}-${race}">${NOMS_DES_RACES[race]}</a>`,
		)
		.join("");
	const blocs = races.map((race) =>
		blocRace(
			race,
			ici.filter((r) => r.race === race),
			evenement,
		),
	);
	const etoiles = (AVEC_ETOILES as readonly string[]).includes(evenement);
	return `<section class="moment${etoiles ? " avec-etoiles" : ""}" id="${evenement}">
<header class="moment-tete">
<span class="medaille" aria-hidden="true">${EVENEMENTS.indexOf(evenement) + 1}</span>
<div class="moment-titre"><h2>${titre}</h2><p>${typo(quand)}</p></div>
<div class="moment-actions"><span class="compte" data-compte="${evenement}"></span>
<button type="button" class="bouton" data-ecouter="${evenement}">▶ Écouter mon choix</button></div>
${etoiles ? `<p class="legende">Clique sur le cœur : <span class="g-coeur">♥</span> gardée en voix secondaire, encore une fois : <span class="g-etoile">★</span> voix principale, encore : plus gardée.</p>` : ""}
<nav class="aller" aria-label="Aller à une race">${liens}</nav>
</header>
${blocs.join("\n")}
</section>`;
}

function reglageRace(race: Race): string {
	const options = ["souvent", "parfois", "rarement", "jamais"]
		.map((f) => `<option value="${f}">${f}</option>`)
		.join("");
	return `<label class="frequence ${race}"><span class="blason" aria-hidden="true"></span>${NOMS_DES_RACES[race]}
<select data-race="${race}">${options}</select></label>`;
}

export function genererPage(catalogue: Replique[], choix: Choix): string {
	const donnees = {
		choix,
		marque: MARQUE,
		evenements: EVENEMENTS,
		avecEtoiles: AVEC_ETOILES,
		moments: Object.fromEntries(EVENEMENTS.map((e) => [e, MOMENTS[e].copie])),
		races: Object.fromEntries(RACES.map((r) => [r, NOMS_DES_RACES[r]])),
		cli: CLI,
		repliques: Object.fromEntries(
			catalogue.map((r) => [r.id, { t: r.texte, u: nomUnite(r) }]),
		),
	};
	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Voix de Warcraft III</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;800&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<div class="page">
<header class="banniere">
<p class="surtitre">Claude Code · sons de travail</p>
<h1>Les voix de Warcraft III</h1>
<p class="intro">La VF d'origine (2002). Clique sur une réplique pour l'écouter, et sur le cœur pour la garder :
à chaque fois, une des répliques gardées est tirée au hasard. Pour la fin du travail et l'attente,
<span class="g-etoile">★</span> distingue tes voix principales des voix secondaires <span class="g-coeur">♥</span>.
En bas, <b>Copier mon choix</b>, puis colle le texte à Claude.</p>
<p class="mention">Projet de fan, non affilié à Blizzard Entertainment. Les répliques ont été téléchargées
sur ton ordinateur depuis WoWWiki FR, pour ton usage perso. <a href="${DEPOT}">Le projet sur GitHub</a></p>
<div class="reglages">
<label for="volume">Volume</label>
<input type="range" id="volume" min="0" max="0.6" step="0.01">
<output id="volume-valeur" for="volume"></output>
<button type="button" class="bouton" id="essayer">▶ Essayer</button>
<small>tout à gauche : muet. Le même volume que dans le terminal.</small>
</div>
<fieldset class="regles">
<legend>Règles</legend>
<label><input type="radio" name="races" value="toutes">
<span><b>Toutes les races, au hasard.</b> Dans chaque session, chaque son tire sa race selon les fréquences ci-dessous : plus de variété.</span></label>
<label><input type="radio" name="races" value="session">
<span><b>Une race par session.</b> Chaque session Claude parle avec une seule race, tirée parmi celles que les autres sessions ouvertes n'ont pas : tu sais laquelle parle.</span></label>
<div class="frequences"><span>Les races, au tirage :</span>
${RACES.map(reglageRace).join("\n")}
<small>« souvent » sort une fois et demie plus que « parfois », et trois fois plus que « rarement ».</small></div>
<label><input type="checkbox" class="regle" data-regle="finSelonTravail">
<span><b>La fin suit le travail.</b> Recherche terminée, Amélioration terminée, Travail terminé, ou Prêt à travailler après une réponse rapide, parmi tes ★ de fin.</span></label>
</fieldset>
</header>
${EVENEMENTS.map((e) => section(e, catalogue)).join("\n")}
</div>
<footer class="barre">
<span id="resume"></span>
<button type="button" class="bouton principal" id="copier">Copier mon choix</button>
<button type="button" class="bouton" id="voir" aria-expanded="false">Voir le texte</button>
<button type="button" class="bouton discret" id="revenir" hidden>Revenir au choix enregistré</button>
<pre id="texte" hidden></pre>
</footer>
<script>
const DONNEES = ${JSON.stringify(donnees).replace(/</g, "\\u003c")};
${JS}
</script>
</body>
</html>
`;
}

const CSS = `
:root {
  color-scheme: dark;
  --fond: #0e0a07; --pierre: #17110c; --panneau: #1e1610;
  --bord: #4f3b1d; --bord-or: #a07a2c; --or: #e6c068; --or-clair: #f6e2a6;
  --texte: #efe4cc; --texte-2: #b8a888; --texte-3: #85775f; --coeur: #e2574c; --etoile: #ffd23f;
  --humain: #5b8fe0; --orc: #d4573a; --mortvivant: #86bd4c; --elfe: #a585ea; --neutre: #a29c91;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0; color: var(--texte); background: var(--fond);
  background-image: radial-gradient(ellipse 120% 60% at 50% 0%, #2b1e12 0%, transparent 70%);
  font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
.page { max-width: 1180px; margin: 0 auto; padding: 28px 20px 140px; }
h1, h2, h3, h4, .bouton { font-family: "Cinzel", "Trajan Pro", Georgia, serif; }
h1 { margin: 2px 0 10px; color: var(--or); font-size: clamp(30px, 4.4vw, 46px); font-weight: 800;
  letter-spacing: .02em; text-shadow: 0 2px 0 #000, 0 0 28px rgba(230,192,104,.28); }
.banniere, .moment {
  border: 2px solid var(--bord-or); border-radius: 12px;
  background: linear-gradient(180deg, #281d13, #19120c);
  box-shadow: inset 0 0 0 4px var(--pierre), inset 0 0 0 5px var(--bord), 0 12px 32px rgba(0,0,0,.55);
}
.banniere { padding: 26px 30px 22px; margin-bottom: 26px; }
.surtitre { margin: 0; color: var(--texte-3); text-transform: uppercase; letter-spacing: .14em; font-size: 12px; }
.intro { max-width: 800px; margin: 0 0 18px; color: var(--texte-2); }
.intro b { color: var(--or-clair); font-weight: 600; }
.mention { max-width: 800px; margin: -8px 0 18px; color: var(--texte-3); font-size: 13px; }
.mention a { color: var(--or); }
.g-coeur { color: var(--coeur); } .g-etoile { color: var(--etoile); }
.reglages { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; }
.reglages label { font-family: "Cinzel", Georgia, serif; color: var(--or-clair); }
.reglages input[type=range] { width: min(260px, 60vw); accent-color: var(--or); }
.reglages output { min-width: 3.5em; color: var(--or); font-variant-numeric: tabular-nums; }
.reglages small { color: var(--texte-3); }
.regles { margin: 18px 0 0; padding: 12px 16px 6px; border: 1px solid var(--bord); border-radius: 10px; background: rgba(0,0,0,.22); }
.regles legend { padding: 0 6px; font-family: "Cinzel", Georgia, serif; color: var(--or-clair); }
.regles > label { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px; color: var(--texte-2); cursor: pointer; }
.regles input { margin-top: 3px; accent-color: var(--or); width: 16px; height: 16px; flex: none; }
.regles b { color: var(--texte); font-weight: 600; }
.frequences { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 0 0 10px 26px; color: var(--texte-2); }
.frequences small { color: var(--texte-3); flex-basis: 100%; }
.frequence { display: inline-flex; align-items: center; gap: 6px; color: var(--teinte); font-weight: 600; }
.frequence select { background: #120d08; color: var(--texte); border: 1px solid var(--bord-or); border-radius: 6px; padding: 3px 6px; font: inherit; font-weight: 400; }
.moment { padding: 22px 24px 26px; margin-bottom: 26px; }
.moment-tete { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 16px; margin-bottom: 18px; }
.medaille { flex: none; display: grid; place-items: center; width: 44px; height: 44px; border-radius: 50%;
  font: 800 20px "Cinzel", Georgia, serif; color: #2a1c0a;
  background: radial-gradient(circle at 35% 30%, #fbe7a4, #c99a3c 60%, #7d5a1c);
  box-shadow: 0 0 0 2px #2a1c0a, 0 0 0 3px var(--bord-or), 0 4px 10px rgba(0,0,0,.6); }
.moment-titre { flex: 1 1 260px; }
.moment-titre h2 { margin: 0; color: var(--or-clair); font-size: 23px; }
.moment-titre p { margin: 2px 0 0; color: var(--texte-2); max-width: 820px; }
.moment-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
.compte { padding: 4px 11px; border-radius: 999px; border: 1px solid var(--bord); color: var(--texte-2); font-size: 13px; }
.compte.choisi { border-color: var(--coeur); color: #ffd2cc; }
.legende { flex-basis: 100%; margin: 0; padding-left: 60px; color: var(--texte-3); font-size: 13px; }
.race, .vers, .frequence { --teinte: var(--neutre); }
.humain { --teinte: var(--humain); } .orc { --teinte: var(--orc); }
.mortvivant { --teinte: var(--mortvivant); } .elfe { --teinte: var(--elfe); }
.aller { flex-basis: 100%; display: flex; flex-wrap: wrap; gap: 6px 8px; padding-left: 60px; }
.vers { padding: 3px 11px; border-radius: 999px; border: 1px solid var(--teinte); background: rgba(0,0,0,.25);
  color: var(--teinte); font-size: 13px; text-decoration: none; }
.vers:hover, .vers:focus-visible { background: color-mix(in srgb, var(--teinte) 20%, transparent); outline: none; }
.race { margin-top: 18px; scroll-margin-top: 14px; }
.race h3 { display: flex; align-items: center; gap: 10px; margin: 0 0 10px; font-size: 18px; color: var(--teinte); }
.blason { width: 16px; height: 19px; background: var(--teinte); flex: none;
  clip-path: polygon(0 0, 100% 0, 100% 62%, 50% 100%, 0 62%); box-shadow: 0 0 10px var(--teinte); }
.frequence .blason { width: 11px; height: 13px; }
.unites { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); }
.unite { padding: 10px 10px 8px; border: 1px solid var(--bord); border-top: 2px solid var(--teinte);
  border-radius: 8px; background: rgba(0,0,0,.28); }
.unite h4 { margin: 0 0 6px 4px; color: var(--or-clair); font-size: 14px; letter-spacing: .04em; }
.unite ul { list-style: none; margin: 0; padding: 0; }
.ligne { display: grid; grid-template-columns: 30px 1fr 30px; align-items: center; gap: 8px;
  padding: 4px 4px 4px 2px; border-radius: 7px; cursor: pointer; transition: background .15s; }
.ligne:hover { background: rgba(230,192,104,.07); }
.ligne.coeur { background: rgba(226,87,76,.10); }
.ligne.etoile { background: rgba(255,210,63,.12); }
.ligne.joue { background: rgba(230,192,104,.16); box-shadow: inset 0 0 0 1px var(--bord-or); }
.jouer { display: grid; place-items: center; width: 28px; height: 28px; padding: 0; border-radius: 50%; cursor: pointer;
  border: 1px solid var(--bord-or); background: radial-gradient(circle at 40% 35%, #3d2d1b, #1b130c); color: var(--or); }
.jouer svg { width: 13px; height: 13px; fill: currentColor; margin-left: 2px; }
.jouer:hover, .jouer:focus-visible { color: var(--or-clair); box-shadow: 0 0 10px rgba(230,192,104,.45); outline: none; }
.ligne.joue .jouer { animation: pouls 0.9s ease-in-out infinite; }
@keyframes pouls { 50% { box-shadow: 0 0 0 4px rgba(230,192,104,.25), 0 0 14px rgba(230,192,104,.5); } }
.texte { color: var(--texte); }
.garde { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 6px;
  background: transparent; cursor: pointer; font-size: 19px; line-height: 1; color: #4d3f2e;
  transition: color .15s, transform .15s, text-shadow .15s; }
.garde:hover { color: #8a5b4f; }
.garde.coeur { color: var(--coeur); text-shadow: 0 0 10px rgba(226,87,76,.6); transform: scale(1.12); }
.garde.etoile { color: var(--etoile); text-shadow: 0 0 12px rgba(255,210,63,.7); transform: scale(1.2); }
.garde:focus-visible { outline: 2px solid var(--or); outline-offset: 1px; }
.bouton { cursor: pointer; padding: 8px 15px; border-radius: 7px; border: 1px solid var(--bord-or);
  background: linear-gradient(180deg, #4e3a20, #2a1e11); color: var(--or-clair); font-size: 14px; font-weight: 600;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 2px 0 #000; }
.bouton:hover { background: linear-gradient(180deg, #634a28, #342513); }
.bouton:focus-visible { outline: 2px solid var(--or); outline-offset: 2px; }
.bouton.principal { padding: 11px 22px; font-size: 16px; color: #241705;
  background: linear-gradient(180deg, #f2d27e, #b88a32); border-color: #f6e2a6; }
.bouton.principal:hover { background: linear-gradient(180deg, #f8de96, #c99a3c); }
.bouton.discret { background: transparent; box-shadow: none; border-color: var(--bord); color: var(--texte-2); }
.barre { position: fixed; left: 0; right: 0; bottom: 0; z-index: 5; display: flex; flex-wrap: wrap;
  align-items: center; justify-content: center; gap: 10px 14px;
  padding: 12px 20px calc(12px + env(safe-area-inset-bottom, 0px));
  background: linear-gradient(180deg, rgba(24,17,11,.94), #110b07); border-top: 2px solid var(--bord-or);
  box-shadow: 0 -10px 30px rgba(0,0,0,.6); }
#resume { color: var(--texte-2); font-size: 14px; }
#texte { flex-basis: 100%; max-width: 900px; max-height: 38vh; overflow: auto; margin: 4px 0 0; padding: 12px 14px;
  white-space: pre-wrap; background: #0a0705; border: 1px solid var(--bord); border-radius: 8px; color: var(--texte);
  font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace; }
@media (max-width: 560px) {
  .page { padding: 18px 16px 170px; }
  .banniere, .moment { padding: 18px 16px; }
  .aller, .legende { padding-left: 0; }
  .frequences { margin-left: 0; }
}
`;

const JS = `
const EVS = DONNEES.evenements;
const AVEC_ETOILES = DONNEES.avecEtoiles;
const REGLES = ["raceParSession", "finSelonTravail"];
const RACES = Object.keys(DONNEES.races);
const COURTS = { envoi: "Envoi", attente: "Attente", fini: "Fin", insiste: "Insiste", debut: "Ouverture" };
const R = DONNEES.repliques;
const CLE = "sons-warcraft:" + DONNEES.choix.maj;
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const copie = (o) => JSON.parse(JSON.stringify(o));
function enregistre() {
  const c = DONNEES.choix, s = { volume: c.volume, frequences: copie(c.frequences), etoiles: copie(c.etoiles) };
  for (const r of REGLES) s[r] = c[r];
  for (const e of EVS) s[e] = [...c[e]];
  return s;
}
let etat = enregistre();
try { const b = JSON.parse(localStorage.getItem(CLE) || "null"); if (b) etat = { ...etat, ...b }; } catch (e) {}
for (const e of AVEC_ETOILES) etat.etoiles[e] = (etat.etoiles[e] || []).filter((id) => etat[e].includes(id));

function garder() { try { localStorage.setItem(CLE, JSON.stringify(etat)); } catch (e) {} }
const pareil = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
function modifie() {
  const s = enregistre();
  return s.volume !== etat.volume || REGLES.some((r) => s[r] !== etat[r])
    || RACES.some((r) => s.frequences[r] !== etat.frequences[r])
    || EVS.some((e) => !pareil(s[e], etat[e]))
    || AVEC_ETOILES.some((e) => !pareil(s.etoiles[e], etat.etoiles[e]));
}

const lecteur = new Audio();
let file = [];
function surligner(id) {
  for (const l of $$(".ligne.joue")) l.classList.remove("joue");
  if (id) for (const l of $$('.ligne[data-id="' + id + '"]')) l.classList.add("joue");
}
function jouer(ids) { file = [...ids]; suivant(); }
function suivant() {
  const id = file.shift();
  if (!id) { surligner(null); return; }
  lecteur.src = "sons/" + id + ".mp3";
  lecteur.volume = Math.min(1, etat.volume);
  surligner(id);
  lecteur.play().catch(() => surligner(null));
}
lecteur.addEventListener("ended", () => setTimeout(suivant, file.length ? 350 : 0));

/** non, coeur (gardée, voix secondaire) ou etoile (voix principale). */
function niveau(e, id) {
  if (!etat[e].includes(id)) return "non";
  return AVEC_ETOILES.includes(e) && etat.etoiles[e].includes(id) ? "etoile" : "coeur";
}
function changer(e, id) {
  const avant = niveau(e, id);
  const apres = avant === "non" ? "coeur" : avant === "coeur" && AVEC_ETOILES.includes(e) ? "etoile" : "non";
  etat[e] = etat[e].filter((x) => x !== id);
  if (apres !== "non") etat[e].push(id);
  if (AVEC_ETOILES.includes(e)) {
    etat.etoiles[e] = etat.etoiles[e].filter((x) => x !== id);
    if (apres === "etoile") etat.etoiles[e].push(id);
  }
}
const SYMBOLES = { non: "♡", coeur: "♥", etoile: "★" };
/** 0 = muet : aucun son ne joue. */
function volumeEnMots(v) { return v > 0 ? Math.round(v * 100) + " %" : "muet"; }
const ETATS = { non: "pas gardée", coeur: "gardée", etoile: "voix principale" };
function compte(e) {
  const n = etat[e].length;
  if (!AVEC_ETOILES.includes(e)) return n === 0 ? "aucune : silence" : n === 1 ? "1 gardée" : n + " gardées";
  const p = etat.etoiles[e].length;
  return n === 0 ? "aucune : silence" : p + " ★ · " + (n - p) + " ♥";
}
function peindre() {
  for (const b of $$("button.garde")) {
    const e = b.dataset.ev, n = niveau(e, b.value);
    b.textContent = SYMBOLES[n];
    b.className = "garde " + n;
    b.closest(".ligne").classList.toggle("coeur", n === "coeur");
    b.closest(".ligne").classList.toggle("etoile", n === "etoile");
    const secondaire = AVEC_ETOILES.includes(e) && n === "coeur" ? " en voix secondaire" : "";
    b.setAttribute("aria-label", "« " + b.dataset.texte + " » : " + ETATS[n] + secondaire + ". Cliquer pour changer.");
  }
  for (const e of EVS) {
    const c = $('[data-compte="' + e + '"]');
    c.textContent = compte(e);
    c.classList.toggle("choisi", etat[e].length > 0);
  }
  for (const cb of $$("input.regle")) cb.checked = etat[cb.dataset.regle];
  for (const r of $$('input[name="races"]')) r.checked = (r.value === "session") === etat.raceParSession;
  for (const s of $$("select[data-race]")) s.value = etat.frequences[s.dataset.race];
  $("#volume").value = etat.volume;
  $("#volume-valeur").textContent = volumeEnMots(etat.volume);
  $("#resume").textContent = EVS.map((e) => COURTS[e] + " " + (AVEC_ETOILES.includes(e) ? etat.etoiles[e].length + "★ " + (etat[e].length - etat.etoiles[e].length) + "♥" : etat[e].length)).join(" · ");
  $("#revenir").hidden = !modifie();
  if (!$("#texte").hidden) $("#texte").textContent = texte();
}

function texte() {
  const l = ["Sons Warcraft : mon choix"];
  for (const e of EVS) {
    const noms = etat[e].filter((id) => R[id]).map((id) => (AVEC_ETOILES.includes(e) ? SYMBOLES[niveau(e, id)] + " " : "") + "« " + R[id].t + " » (" + R[id].u + ")");
    l.push("• " + DONNEES.moments[e] + " : " + (noms.length ? noms.join(", ") : "rien (silence)"));
  }
  const oui = (b) => (b ? "oui" : "non");
  l.push("• Races : " + (etat.raceParSession ? "une race par session" : "toutes les races, au hasard") + " (" + RACES.map((r) => DONNEES.races[r] + " " + etat.frequences[r]).join(", ") + ")");
  l.push("• La fin suit le travail : " + oui(etat.finSelonTravail));
  l.push("• Volume : " + volumeEnMots(etat.volume));
  const machine = { volume: etat.volume, frequences: etat.frequences, etoiles: etat.etoiles };
  for (const r of REGLES) machine[r] = etat[r];
  for (const e of EVS) machine[e] = etat[e];
  l.push(DONNEES.marque + " " + JSON.stringify(machine));
  l.push("(Pour Claude : bun \\"" + DONNEES.cli + "\\" appliquer, avec ce texte sur l'entrée standard.)");
  return l.join("\\n");
}
function montrer(oui) {
  $("#texte").hidden = !oui;
  $("#voir").textContent = oui ? "Cacher le texte" : "Voir le texte";
  $("#voir").setAttribute("aria-expanded", oui ? "true" : "false");
  if (oui) $("#texte").textContent = texte();
}
function selectionner() { const r = document.createRange(); r.selectNodeContents($("#texte")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
async function copier() {
  const t = texte(), b = $("#copier");
  $("#texte").textContent = t;
  try { await navigator.clipboard.writeText(t); b.textContent = "Copié ✓ : colle-le à Claude"; return; } catch (e) {}
  montrer(true); selectionner();
  let ok = false;
  try { ok = document.execCommand("copy"); } catch (e) {}
  b.textContent = ok ? "Copié ✓ : colle-le à Claude" : "Sélectionné : ⌘C";
}
function apresChangement() { $("#copier").textContent = "Copier mon choix"; garder(); peindre(); }

document.addEventListener("change", (ev) => {
  const regle = ev.target.closest("input.regle");
  if (regle) { etat[regle.dataset.regle] = regle.checked; apresChangement(); }
  const mode = ev.target.closest('input[name="races"]');
  if (mode) { etat.raceParSession = mode.value === "session"; apresChangement(); }
  const race = ev.target.closest("select[data-race]");
  if (race) { etat.frequences[race.dataset.race] = race.value; apresChangement(); }
});
document.addEventListener("click", (ev) => {
  const ecouter = ev.target.closest("[data-ecouter]");
  if (ecouter) { jouer(etat[ecouter.dataset.ecouter]); return; }
  const garde = ev.target.closest("button.garde");
  if (garde) { changer(garde.dataset.ev, garde.value); apresChangement(); return; }
  const l = ev.target.closest(".ligne");
  if (l) jouer([l.dataset.id]);
});
$("#volume").addEventListener("input", (ev) => {
  etat.volume = Number(ev.target.value);
  lecteur.volume = Math.min(1, etat.volume);
  apresChangement();
});
$("#essayer").addEventListener("click", () => jouer(etat.fini.length ? [etat.fini[0]] : etat.envoi.slice(0, 1)));
$("#copier").addEventListener("click", copier);
$("#voir").addEventListener("click", () => montrer($("#texte").hidden));
$("#revenir").addEventListener("click", () => {
  try { localStorage.removeItem(CLE); } catch (e) {}
  etat = enregistre();
  $("#copier").textContent = "Copier mon choix";
  peindre();
});
peindre();
`;
