import { appendFile, mkdir } from "node:fs/promises";
import { DOSSIER, JOURNAL } from "./config";

/** Au-delà de 200 Ko, on ne garde que les 1 000 dernières lignes. */
const TAILLE_MAX = 200_000;
const LIGNES_GARDEES = 1000;

export function horodatage(d: Date = new Date()): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Une ligne par son joué ou retenu, avec sa raison : d'où vient chaque bruit. `quand` : l'heure
 * du début du hook, même si la ligne est écrite après la lecture du son.
 */
export async function noter(
	ligne: string,
	quand: Date = new Date(),
): Promise<void> {
	await mkdir(DOSSIER, { recursive: true });
	await appendFile(JOURNAL, `${horodatage(quand)}  ${ligne}\n`);
	if (Bun.file(JOURNAL).size > TAILLE_MAX) {
		const lignes = (await Bun.file(JOURNAL).text()).trimEnd().split("\n");
		await Bun.write(JOURNAL, `${lignes.slice(-LIGNES_GARDEES).join("\n")}\n`);
	}
}
