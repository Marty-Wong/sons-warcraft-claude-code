import {
	type AvecEtoiles,
	type Choix,
	EVENEMENTS,
	type Frequence,
	POIDS,
	RACES,
	type Race,
} from "./config";

/**
 * Les règles qui rendent les sons cohérents : toutes les races au hasard ou une race par
 * session, ★ voix principales pour les vrais moments et ♥ voix secondaires pour le reste, une
 * fin qui suit le travail, et l'unité qui s'énerve si tu insistes. Fonctions pures, testées.
 */

/** En dessous, sans fichier créé ni modifié, c'était une réponse rapide : « Prêt à travailler ! ». */
export const VRAI_TRAVAIL_MS = 2 * 60_000;

/** 3 messages en moins d'une minute dans la même session : l'unité s'énerve. */
export const INSISTANCE = { messages: 3, fenetreMs: 60_000 };

export function raceDe(id: string): Race {
	return id.split("-")[0] as Race;
}

/** Races des répliques choisies et pas réglées sur « jamais », dans l'ordre du jeu. */
export function racesEnJeu(choix: Choix): Race[] {
	const ids = EVENEMENTS.flatMap((e) => choix[e]);
	return RACES.filter(
		(race) =>
			choix.frequences[race] !== "jamais" &&
			ids.some((id) => raceDe(id) === race),
	);
}

/**
 * Une race par session : parmi les races les moins prises par les autres sessions ouvertes,
 * une au hasard, selon sa fréquence (souvent 3, parfois 2, rarement 1).
 */
export function choisirRace(
	enJeu: Race[],
	prises: Race[],
	frequences: Partial<Record<Race, Frequence>>,
	alea: () => number = Math.random,
): Race | undefined {
	const poids = (race: Race) => POIDS[frequences[race] ?? "souvent"];
	const possibles = enJeu.filter((race) => poids(race) > 0);
	if (!possibles.length) return undefined;
	const compte = (race: Race) => prises.filter((r) => r === race).length;
	const moins = Math.min(...possibles.map(compte));
	const libres = possibles.filter((race) => compte(race) === moins);
	let tirage = alea() * libres.reduce((s, race) => s + poids(race), 0);
	for (const race of libres) {
		tirage -= poids(race);
		if (tirage < 0) return race;
	}
	return libres[libres.length - 1];
}

/**
 * Toutes les races dans la même session : chaque son tire d'abord une race selon sa fréquence
 * (souvent 3, parfois 2, rarement 1), parmi celles qui ont une réplique pour ce moment, puis une
 * de ses répliques. Une race pèse autant qu'elle ait une réplique ou dix. Jamais deux fois de
 * suite la même réplique quand il y a le choix ; une race sur « jamais » ne parle que si elle
 * est seule.
 */
export function tirerSelonRaces(
	ids: string[],
	derniere: string | undefined,
	frequences: Partial<Record<Race, Frequence>>,
	alea: () => number = Math.random,
): string | undefined {
	const possibles = ids.length > 1 ? ids.filter((id) => id !== derniere) : ids;
	const parRace = new Map<Race, string[]>();
	for (const id of possibles) {
		parRace.set(raceDe(id), [...(parRace.get(raceDe(id)) ?? []), id]);
	}
	const poids = (race: Race) => POIDS[frequences[race] ?? "souvent"];
	const races = [...parRace.keys()].filter((race) => poids(race) > 0);
	if (!races.length) return possibles[Math.floor(alea() * possibles.length)];
	let tirage = alea() * races.reduce((s, race) => s + poids(race), 0);
	let race = races[races.length - 1];
	for (const r of races) {
		tirage -= poids(r);
		if (tirage < 0) {
			race = r;
			break;
		}
	}
	const siennes = parRace.get(race) ?? [];
	return siennes[Math.floor(alea() * siennes.length)];
}

/** Les répliques de la race de la session ; si elle n'en a aucune, toutes. */
export function deLaRace(ids: string[], race: Race | undefined): string[] {
	const siennes = race ? ids.filter((id) => raceDe(id) === race) : ids;
	return siennes.length ? siennes : ids;
}

/**
 * ★ pour les vrais moments, ♥ pour les secondaires. Sans aucune étoile, toutes les répliques
 * gardées font les deux ; sans voix secondaire, un moment secondaire reste muet.
 */
export function selonImportance(
	choix: Choix,
	moment: AvecEtoiles,
	principal: boolean,
): string[] {
	const etoiles = new Set(choix.etoiles[moment]);
	const principales = choix[moment].filter((id) => etoiles.has(id));
	const secondaires = choix[moment].filter((id) => !etoiles.has(id));
	if (principal) return principales.length ? principales : secondaires;
	return principales.length ? secondaires : choix[moment];
}

/** Ce qu'a été le travail depuis ton message, d'après les outils utilisés. */
export type Travail = "rapide" | "recherche" | "amelioration" | "construction";

/** Ce que dit une réplique de fin. */
export type Annonce = "pret" | "recherche" | "amelioration" | "travail";

export function annonceDe(id: string, categorie: string | undefined): Annonce {
	if (id.includes("recherche-terminee")) return "recherche";
	if (id.includes("amelioration-terminee")) return "amelioration";
	if (categorie === "prêt") return "pret";
	return "travail";
}

const ANNONCE_DU_TRAVAIL: Record<Travail, Annonce> = {
	rapide: "pret",
	recherche: "recherche",
	amelioration: "amelioration",
	construction: "travail",
};

/**
 * La réplique qui dit ce qui vient d'être fait : « Recherche terminée. » après une recherche,
 * « Amélioration terminée. » après des modifications, « Travail terminé ! » après une
 * construction, « Prêt à travailler ! » après une réponse rapide. À défaut, « Travail terminé ! »,
 * puis n'importe laquelle.
 */
export function selonTravail(
	ids: string[],
	annonce: (id: string) => Annonce,
	travail: Travail,
): string[] {
	for (const voulue of [ANNONCE_DU_TRAVAIL[travail], "travail"]) {
		const justes = ids.filter((id) => annonce(id) === voulue);
		if (justes.length) return justes;
	}
	return ids;
}

/** Tes messages de la dernière minute, celui-ci compris. */
export function estInsistant(envois: number[], maintenant: number): boolean {
	const recents = envois.filter((t) => maintenant - t <= INSISTANCE.fenetreMs);
	return recents.length >= INSISTANCE.messages;
}

/**
 * Messages qui ne viennent pas de toi : fin d'une tâche ou d'un agent, message d'une
 * autre session, boucle planifiée. Ils ne font pas « Oui monseigneur ! ».
 */
export function estAutomatique(prompt: string): boolean {
	return /^\s*(?:<task-notification>|<agent-message|<scheduled|<<|Another Claude session sent a message)/.test(
		prompt,
	);
}
