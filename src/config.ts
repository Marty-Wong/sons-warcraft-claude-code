import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/** L'adresse du dépôt : User-Agent des téléchargements, page d'écoute, messages. */
export const DEPOT = "https://github.com/Marty-Wong/sons-warcraft-claude-code";

/** Le dossier du dépôt cloné : les hooks de Claude Code pointent vers son `src/hook.ts`. */
export const RACINE = resolve(import.meta.dir, "..");
export const HOOK = join(RACINE, "src", "hook.ts");
export const CLI = join(RACINE, "src", "cli.ts");

/**
 * Les données, jamais dans git : sons téléchargés, catalogue, choix, journal, page d'écoute.
 * Dans `donnees/` du dépôt, sauf si la variable SONS_WARCRAFT_DONNEES dit ailleurs.
 */
export const DOSSIER = resolve(
	process.env.SONS_WARCRAFT_DONNEES || join(RACINE, "donnees"),
);
export const DOSSIER_SONS = join(DOSSIER, "sons");
export const DOSSIER_SESSIONS = join(DOSSIER, "sessions");
export const CATALOGUE = join(DOSSIER, "catalogue.json");
export const CHOIX = join(DOSSIER, "choix.json");
export const JOURNAL = join(DOSSIER, "journal.log");
export const PAGE = join(DOSSIER, "sons.html");

/** Le dossier de configuration de Claude Code : ~/.claude, ou CLAUDE_CONFIG_DIR. */
export function dossierClaude(): string {
	return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

/**
 * Les moments, dans l'ordre de la page. Quatre hooks de Claude Code les déclenchent :
 *   debut   → SessionStart (une session s'ouvre : l'unité se présente)
 *   envoi   → UserPromptSubmit (tes messages ; les sous-agents ne le déclenchent pas)
 *             insiste à la place si tu envoies 3 messages en moins d'une minute
 *   attente → Notification : ★ une question ou une permission, ♥ le rappel d'une minute sans réponse
 *   fini    → Stop (la session principale a fini un tour ; les sous-agents passent par SubagentStop) :
 *             ★ la vraie fin du travail, ♥ un agent qui rend son travail alors que d'autres tournent encore
 */
export const EVENEMENTS = [
	"envoi",
	"attente",
	"fini",
	"insiste",
	"debut",
] as const;
export type Evenement = (typeof EVENEMENTS)[number];

export type Race = "humain" | "orc" | "mortvivant" | "elfe";

/** Les quatre races, dans l'ordre du jeu. */
export const RACES: Race[] = ["humain", "orc", "mortvivant", "elfe"];

export const NOMS_DES_RACES: Record<Race, string> = {
	humain: "Humains",
	orc: "Orcs",
	mortvivant: "Morts-vivants",
	elfe: "Elfes de la nuit",
};

export interface Replique {
	/** « humain-paysan-oui2 » : le son est sons/<id>.mp3. */
	id: string;
	race: Race;
	unite: string;
	/** Ouvrier ou annonce de la race : montré en premier sur la page. */
	principale: boolean;
	/** Catégorie du wiki : prêt, quoi, oui, ouiattaque, crideguerre, énervé, alerte. */
	categorie: string;
	texte: string;
	duree: number;
	/** Moments pour lesquels la réplique est proposée sur la page. */
	evenements: Evenement[];
}

/** « Paysan », ou « annonce orcs » : les deux « Travail terminé ! » se distinguent. */
export function nomUnite(r: Replique): string {
	return r.unite === "Annonces"
		? `annonce ${NOMS_DES_RACES[r.race].toLowerCase()}`
		: r.unite;
}

/** Moments où ★ (voix principale) et ♥ (voix secondaire) se distinguent. */
export const AVEC_ETOILES = ["attente", "fini"] as const;
export type AvecEtoiles = (typeof AVEC_ETOILES)[number];

/**
 * Place d'une race au tirage : poids 3, 2, 1 ou 0. Sert à chaque son quand toutes les races
 * parlent (« souvent » contre « parfois » : un léger avantage), et au choix de la race d'une
 * session quand chacune garde la sienne.
 */
export type Frequence = "souvent" | "parfois" | "rarement" | "jamais";
export const POIDS: Record<Frequence, number> = {
	souvent: 3,
	parfois: 2,
	rarement: 1,
	jamais: 0,
};

export interface Choix {
	/** Volume de lecture, linéaire de 0 à 1 ; les répliques sont normalisées à -16 LUFS. */
	volume: number;
	/**
	 * true : chaque session garde une race pour tous ses sons, tirée parmi les moins prises par les
	 * sessions ouvertes. false : toutes les races parlent dans chaque session, chaque son tire sa
	 * race selon `frequences`.
	 */
	raceParSession: boolean;
	/** La réplique de fin suit le travail : recherche, amélioration, construction, ou réponse rapide. */
	finSelonTravail: boolean;
	frequences: Record<Race, Frequence>;
	envoi: string[];
	attente: string[];
	fini: string[];
	insiste: string[];
	debut: string[];
	/**
	 * ★ préférées (voix principales), parmi les répliques gardées : la vraie fin d'un travail,
	 * Claude qui a une question. Les autres (♥) : un agent qui rend son travail, le rappel d'une minute.
	 */
	etoiles: Record<AvecEtoiles, string[]>;
	/** Date du dernier choix appliqué : la page s'en sert pour oublier un brouillon périmé. */
	maj: string;
}

/**
 * Le choix de départ : surtout le Paysan et le Péon, toutes les races au hasard avec un léger
 * avantage aux humains et aux orcs, et une vraie fin (★) toujours humaine ou orque : « Travail
 * terminé ! », « Recherche terminée. », « Amélioration terminée. » ou « Prêt à travailler ! ».
 * Les voix ♥ des autres personnages annoncent les agents qui rendent leur travail.
 */
export const CHOIX_PAR_DEFAUT: Choix = {
	volume: 0.15,
	raceParSession: false,
	finSelonTravail: true,
	frequences: {
		humain: "souvent",
		orc: "souvent",
		mortvivant: "parfois",
		elfe: "parfois",
	},
	envoi: [
		"humain-paysan-oui2",
		"orc-peon-oui3",
		"humain-paysan-quoi3",
		"humain-paysan-oui1",
		"humain-paysan-oui3",
		"humain-paysan-oui4",
		"humain-paysan-oui-attaque1",
		"humain-paysan-oui-attaque2",
		"humain-paysan-oui-attaque3",
		"humain-paysan-oui-attaque4",
		"orc-peon-oui1",
		"orc-peon-oui2",
		"orc-peon-oui4",
		"orc-peon-oui-attaque1",
		"orc-peon-oui-attaque3",
		"orc-peon-cri-de-guerre1",
	],
	attente: [
		"orc-peon-quoi4",
		"humain-paysan-quoi3",
		"humain-paysan-pret1",
		"orc-peon-pret1",
		"orc-maitre-lame-quoi2",
		"mortvivant-acolyte-quoi3",
		"mortvivant-arthas-malefique-quoi1",
		"mortvivant-liche-quoi2",
		"elfe-archer-pret1",
		"elfe-chasseur-de-demons-quoi5",
		"elfe-dryade-quoi2",
		"elfe-gardienne-quoi1",
		"elfe-gardienne-quoi2",
	],
	fini: [
		"humain-annonceur-batiment-termine",
		"orc-annonceur-batiment-termine",
		"humain-paysan-pret1",
		"orc-peon-pret1",
		"humain-annonceur-recherche-terminee",
		"humain-annonceur-amelioration-terminee",
		"orc-annonceur-recherche-terminee",
		"orc-annonceur-amelioration-terminee",
		"humain-fantassin-pret1",
		"humain-chevalier-pret1",
		"orc-grunt-pret1",
		"orc-maitre-lame-pret1",
		"orc-chef-tauren-pret1",
		"mortvivant-necromancien-pret1",
		"mortvivant-chevalier-de-la-mort-pret1",
		"elfe-chasseresse-pret1",
		"elfe-gardienne-pret1",
		"mortvivant-abomination-pret1",
		"mortvivant-acolyte-pret1",
		"elfe-archer-pret1",
	],
	etoiles: {
		attente: [
			"orc-peon-quoi4",
			"humain-paysan-quoi3",
			"mortvivant-acolyte-quoi3",
			"elfe-gardienne-quoi1",
		],
		fini: [
			"humain-annonceur-batiment-termine",
			"orc-annonceur-batiment-termine",
			"humain-paysan-pret1",
			"orc-peon-pret1",
			"humain-annonceur-recherche-terminee",
			"humain-annonceur-amelioration-terminee",
			"orc-annonceur-recherche-terminee",
			"orc-annonceur-amelioration-terminee",
		],
	},
	insiste: [
		"orc-peon-enerve2",
		"orc-peon-enerve3",
		"orc-peon-enerve4",
		"humain-jaina-enerve2",
		"humain-jaina-enerve5",
		"orc-peon-enerve1",
		"orc-grunt-enerve1",
		"mortvivant-liche-enerve2",
		"mortvivant-sylvanas-malefique-enerve4",
		"elfe-dryade-enerve3",
		"elfe-gardienne-enerve1",
	],
	debut: [
		"orc-peon-pret1",
		"humain-paysan-pret1",
		"mortvivant-acolyte-pret1",
		"elfe-archer-pret1",
	],
	maj: "",
};

/** Les répliques téléchargées ; aucune tant que l'installateur n'est pas passé. */
export async function chargerCatalogue(): Promise<Replique[]> {
	try {
		return await Bun.file(CATALOGUE).json();
	} catch {
		return [];
	}
}

/** Un choix enregistré, complété par le choix de départ pour ce qui y manque. */
export function completerChoix(brut: Partial<Choix>): Choix {
	const choix: Choix = { ...structuredClone(CHOIX_PAR_DEFAUT), ...brut };
	choix.frequences = { ...CHOIX_PAR_DEFAUT.frequences, ...brut.frequences };
	choix.etoiles = { ...CHOIX_PAR_DEFAUT.etoiles, ...brut.etoiles };
	return choix;
}

export async function chargerChoix(): Promise<Choix> {
	try {
		return completerChoix(await Bun.file(CHOIX).json());
	} catch {
		return structuredClone(CHOIX_PAR_DEFAUT);
	}
}

export async function enregistrerChoix(choix: Choix): Promise<void> {
	await mkdir(DOSSIER, { recursive: true });
	await Bun.write(CHOIX, `${JSON.stringify(choix, null, 2)}\n`);
}
