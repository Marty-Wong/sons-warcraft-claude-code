import {
	AVEC_ETOILES,
	type Choix,
	EVENEMENTS,
	type Frequence,
	POIDS,
	RACES,
} from "./config";

/** Repère de la ligne lisible par la machine, à la fin du texte copié sur la page. */
export const MARQUE = "#sons-warcraft";

/**
 * Lit le texte copié sur la page d'écoute (« Copier mon choix ») et rend le nouveau choix.
 * Les identifiants inconnus sont écartés ; le volume reste entre 0 (muet) et 1 ; une étoile
 * n'existe que sur une réplique gardée ; ce que le texte ne dit pas reste comme avant.
 */
export function lireTexteColle(
	texte: string,
	connus: Set<string>,
	actuel: Choix,
	maintenant: Date = new Date(),
): Choix {
	const ligne = texte
		.split("\n")
		.map((l) => l.trim())
		.find((l) => l.startsWith(MARQUE));
	if (!ligne) throw new Error(`pas de ligne « ${MARQUE} » dans le texte collé`);
	const brut = JSON.parse(ligne.slice(MARQUE.length));
	const ids = (liste: unknown): string[] =>
		Array.isArray(liste)
			? liste.filter(
					(id): id is string => typeof id === "string" && connus.has(id),
				)
			: [];

	const choix: Choix = {
		...structuredClone(actuel),
		maj: maintenant.toISOString(),
	};
	for (const e of EVENEMENTS) {
		if (Array.isArray(brut[e])) choix[e] = ids(brut[e]);
	}
	for (const e of AVEC_ETOILES) {
		if (Array.isArray(brut.etoiles?.[e]))
			choix.etoiles[e] = ids(brut.etoiles[e]);
		choix.etoiles[e] = choix.etoiles[e].filter((id) => choix[e].includes(id));
	}
	if (typeof brut.volume === "number" && Number.isFinite(brut.volume)) {
		choix.volume = Math.min(1, Math.max(0, brut.volume));
	}
	for (const regle of ["raceParSession", "finSelonTravail"] as const) {
		if (typeof brut[regle] === "boolean") choix[regle] = brut[regle];
	}
	for (const race of RACES) {
		const f = brut.frequences?.[race];
		if (typeof f === "string" && f in POIDS)
			choix.frequences[race] = f as Frequence;
	}
	return choix;
}
