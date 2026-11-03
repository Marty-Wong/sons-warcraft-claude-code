import { join } from "node:path";
import { DOSSIER_SONS } from "./config";
import { commandeDeLecture } from "./systeme";

/**
 * Joue une réplique et attend la fin. Rend undefined si elle a joué, sinon la raison, pour le
 * journal : volume à 0, son absent, aucun lecteur de sons, ou un lecteur qui a échoué.
 */
export async function jouer(
	id: string,
	volume: number,
): Promise<string | undefined> {
	if (!(volume > 0)) return "volume à 0";
	const son = join(DOSSIER_SONS, `${id}.mp3`);
	if (!(await Bun.file(son).exists())) return "son absent";
	const commande = commandeDeLecture(son, volume);
	if (!commande) return "aucun lecteur de sons";
	try {
		const lecture = Bun.spawn(commande, {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		const code = await lecture.exited;
		return code === 0 ? undefined : `le lecteur a échoué (code ${code})`;
	} catch {
		return "le lecteur n'a pas pu démarrer";
	}
}
