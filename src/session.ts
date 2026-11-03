import { mkdir, readdir, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
	DOSSIER_SESSIONS,
	dossierClaude,
	type Evenement,
	type Race,
} from "./config";

/** Ce que le hook retient d'une session de Claude Code, d'un son à l'autre. */
export interface EtatSession {
	race?: Race;
	/** Dernier son de la session (ms). */
	vu: number;
	/** Heure de ton dernier message pas encore terminé ; null quand Claude a fini. */
	demande: number | null;
	/** Heures de tes derniers messages, pour repérer l'insistance. */
	envois: number[];
	/** Dernière réplique jouée par moment, pour ne pas la rejouer tout de suite. */
	derniers: Partial<Record<Evenement, string>>;
}

/** Sans registre, une session qui a fait du bruit dans les 24 h compte comme ouverte. */
const OUVERTE_MS = 24 * 3600_000;
/** L'état d'une session fermée depuis 3 jours est effacé. */
const OUBLIEE_MS = 3 * 24 * 3600_000;

function chemin(id: string): string {
	return join(DOSSIER_SESSIONS, `${id.replace(/[^\w-]/g, "_")}.json`);
}

export async function lireSession(id: string): Promise<EtatSession> {
	const vide: EtatSession = { vu: 0, demande: null, envois: [], derniers: {} };
	try {
		return { ...vide, ...(await Bun.file(chemin(id)).json()) };
	} catch {
		return vide;
	}
}

export async function ecrireSession(
	id: string,
	etat: EtatSession,
): Promise<void> {
	await mkdir(DOSSIER_SESSIONS, { recursive: true });
	await Bun.write(chemin(id), JSON.stringify(etat));
}

/**
 * Sessions dont le processus tourne encore, d'après le registre que tient Claude Code
 * (<dossier de Claude>/sessions/<pid>.json : pid et sessionId). Format interne : s'il devient
 * illisible, undefined, et on se rabat sur l'âge.
 */
async function sessionsOuvertes(): Promise<Set<string> | undefined> {
	try {
		const registre = join(dossierClaude(), "sessions");
		const ouvertes = new Set<string>();
		for (const nom of await readdir(registre)) {
			if (!nom.endsWith(".json")) continue;
			const { pid, sessionId } = await Bun.file(join(registre, nom)).json();
			try {
				process.kill(pid, 0);
				ouvertes.add(sessionId);
			} catch {
				// Processus terminé : la session est fermée.
			}
		}
		return ouvertes;
	} catch {
		return undefined;
	}
}

/** Races des autres sessions ouvertes ; efface au passage l'état des sessions fermées depuis longtemps. */
export async function racesPrises(
	sauf: string,
	maintenant: number,
): Promise<Race[]> {
	const ouvertes = await sessionsOuvertes();
	const races: Race[] = [];
	for (const nom of await readdir(DOSSIER_SESSIONS).catch(
		() => [] as string[],
	)) {
		const id = nom.replace(/\.json$/, "");
		if (id === sauf) continue;
		const etat: EtatSession | null = await Bun.file(join(DOSSIER_SESSIONS, nom))
			.json()
			.catch(() => null);
		const ouverte = ouvertes
			? ouvertes.has(id)
			: !!etat && maintenant - etat.vu <= OUVERTE_MS;
		if (ouverte && etat?.race) races.push(etat.race);
		else if (!etat || maintenant - etat.vu > OUBLIEE_MS) {
			await unlink(join(DOSSIER_SESSIONS, nom)).catch(() => {});
		}
	}
	return races;
}
