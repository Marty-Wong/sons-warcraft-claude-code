/**
 * Ce qui dépend de l'ordinateur : le lecteur de sons, l'ouverture de la page, les outils requis.
 * Essayé sur macOS (afplay). Linux et Windows passent par ffplay ou mpg123 : prévu, pas essayé.
 */

/** Cherche un programme dans le PATH ; injectable pour les tests. */
export type Trouver = (nom: string) => string | null;

const trouverDansLePath: Trouver = (nom) => Bun.which(nom);

/** La commande qui joue un mp3 au volume voulu (linéaire, de 0 à 1), selon le lecteur installé. */
export function commandeDeLecture(
	son: string,
	volume: number,
	plateforme: NodeJS.Platform = process.platform,
	trouver: Trouver = trouverDansLePath,
): string[] | undefined {
	const v = Math.max(0, Math.min(1, volume));
	if (plateforme === "darwin") {
		const afplay = trouver("afplay");
		if (afplay) return [afplay, "-v", String(v), son];
	}
	const ffplay = trouver("ffplay");
	if (ffplay) {
		return [
			ffplay,
			"-nodisp",
			"-autoexit",
			"-loglevel",
			"quiet",
			"-volume",
			String(Math.round(v * 100)),
			son,
		];
	}
	const mpg123 = trouver("mpg123");
	if (mpg123) return [mpg123, "-q", "-f", String(Math.round(v * 32768)), son];
	return undefined;
}

/** La commande qui ouvre un fichier (la page d'écoute) dans le navigateur. */
export function commandeDOuverture(
	chemin: string,
	plateforme: NodeJS.Platform = process.platform,
): string[] {
	if (plateforme === "darwin") return ["open", chemin];
	if (plateforme === "win32") return ["cmd", "/c", "start", "", chemin];
	return ["xdg-open", chemin];
}

export async function ouvrir(chemin: string): Promise<boolean> {
	try {
		const p = Bun.spawn(commandeDOuverture(chemin), {
			stdin: "ignore",
			stdout: "ignore",
			stderr: "ignore",
		});
		return (await p.exited) === 0;
	} catch {
		return false;
	}
}

/** Un outil qui manque, et comment l'installer. */
export interface Manque {
	outil: string;
	pourquoi: string;
	commande: string;
}

const CONSEILS = {
	bun: {
		win32: 'powershell -c "irm bun.sh/install.ps1 | iex"',
		autre: "curl -fsSL https://bun.sh/install | bash",
	},
	ffmpeg: {
		darwin: "brew install ffmpeg",
		win32: "winget install Gyan.FFmpeg",
		autre: "sudo apt install ffmpeg (ou le paquet ffmpeg de ta distribution)",
	},
	lecteur: {
		darwin: "afplay est livré avec macOS : vérifie /usr/bin/afplay",
		win32: "winget install Gyan.FFmpeg (ffplay est fourni avec)",
		autre: "sudo apt install ffmpeg (pour ffplay) ou sudo apt install mpg123",
	},
} as const satisfies Record<
	string,
	Partial<Record<NodeJS.Platform, string>> & { autre: string }
>;

function conseil(
	outil: keyof typeof CONSEILS,
	plateforme: NodeJS.Platform,
): string {
	const c: Partial<Record<NodeJS.Platform, string>> & { autre: string } =
		CONSEILS[outil];
	return c[plateforme] ?? c.autre;
}

/** « 1.3.10 » vaut au moins « 1.1.0 » ? */
export function versionSuffisante(version: string, minimum = "1.1.0"): boolean {
	const a = version.split(".").map((n) => Number.parseInt(n, 10) || 0);
	const b = minimum.split(".").map((n) => Number.parseInt(n, 10) || 0);
	for (let i = 0; i < 3; i++) {
		if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
	}
	return true;
}

/** Ce qui manque pour installer et faire parler les répliques ; vide si tout est là. */
export function verifierPrerequis(options: {
	telechargement: boolean;
	plateforme?: NodeJS.Platform;
	trouver?: Trouver;
	versionBun?: string;
}): Manque[] {
	const plateforme = options.plateforme ?? process.platform;
	const trouver = options.trouver ?? trouverDansLePath;
	const versionBun = options.versionBun ?? Bun.version;
	const manques: Manque[] = [];
	if (!versionSuffisante(versionBun)) {
		manques.push({
			outil: "Bun 1.1 ou plus récent",
			pourquoi: `Bun ${versionBun} est trop ancien`,
			commande: conseil("bun", plateforme),
		});
	}
	if (options.telechargement && (!trouver("ffmpeg") || !trouver("ffprobe"))) {
		manques.push({
			outil: "ffmpeg (avec ffprobe)",
			pourquoi:
				"convertit les répliques téléchargées en mp3, toutes au même volume",
			commande: conseil("ffmpeg", plateforme),
		});
	}
	if (!commandeDeLecture("essai.mp3", 0.1, plateforme, trouver)) {
		manques.push({
			outil: "un lecteur de sons (afplay, ffplay ou mpg123)",
			pourquoi: "joue les répliques",
			commande: conseil("lecteur", plateforme),
		});
	}
	return manques;
}
