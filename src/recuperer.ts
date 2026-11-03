import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	CATALOGUE,
	chargerCatalogue,
	DEPOT,
	DOSSIER_SONS,
	type Evenement,
	type Race,
	type Replique,
} from "./config";

/**
 * Récupère les répliques de Warcraft III en VF d'origine (2002) sur WoWWiki FR,
 * les met toutes au même volume perçu et écrit le catalogue de la page d'écoute.
 *
 *   bun run recuperer        (l'installateur le fait pour toi)
 *
 * Chez toi seulement : les sons appartiennent à Blizzard et ne sont jamais dans le dépôt.
 * Reprend là où il s'est arrêté : un son déjà converti n'est pas retéléchargé.
 * Le wiki donne le texte de chaque réplique (pages « Répliques de Warcraft III/<race> »)
 * et le son en .ogg, qu'afplay ne lit pas : on convertit en mp3.
 */

const API = "https://wowwiki.fandom.com/fr/api.php";
const ENTETES = { "User-Agent": `sons-warcraft-claude-code/1.0 (+${DEPOT})` };

/** Volume perçu visé ; le volume d'écoute se règle ensuite dans le choix. */
const CIBLE_LUFS = -16;

type RaceDuJeu = Race;

const PAGES: Record<RaceDuJeu, string> = {
	humain: "Humain",
	orc: "Orc",
	mortvivant: "Mort-vivant",
	elfe: "Elfe de la nuit",
};

/** Unités retenues : titre du wiki → nom affiché. Les feux follets ne parlent pas ; les goules, seulement énervées. */
const UNITES: Record<RaceDuJeu, Record<string, string>> = {
	humain: {
		Paysan: "Paysan",
		Fantassin: "Fantassin",
		Chevalier: "Chevalier",
		"Arthas (héros)": "Arthas",
		"Jaina (héros)": "Jaina",
	},
	orc: {
		Péon: "Péon",
		Grunt: "Grunt",
		"Thrall (héros)": "Thrall",
		"Maître-lame (héros)": "Maître-lame",
		"Chef tauren (héros)": "Chef tauren",
	},
	mortvivant: {
		Acolyte: "Acolyte",
		Abomination: "Abomination",
		Goule: "Goule",
		Nécromancien: "Nécromancien",
		"Chevalier de la mort (héros)": "Chevalier de la mort",
		"Liche (héros)": "Liche",
		"Arthas maléfique (héros)": "Arthas maléfique",
		"Sylvanas maléfique (héros)": "Sylvanas",
	},
	elfe: {
		Archer: "Archère",
		Chasseresse: "Chasseresse",
		Dryade: "Dryade",
		"Gardienne (héros)": "Gardienne",
		"Chasseur de démons (héros)": "Chasseur de démons",
		"Illidan (héros)": "Illidan",
		"Tyrande (héros)": "Tyrande",
	},
};

const PRINCIPALES = new Set([
	"Paysan",
	"Péon",
	"Acolyte",
	"Archère",
	"Annonces",
]);

/** Fautes de frappe du wiki, corrigées à l'affichage (« Sire ? » : réécouté avec Whisper). */
const CORRECTIONS: Record<string, string> = {
	"Sir ?": "Sire ?",
	"Qui y a-t-il ?": "Qu'y a-t-il ?",
	"Ne m'inviter jamais à dîner, j'aurais toujours un doute.":
		"Ne m'invitez jamais à dîner, j'aurai toujours un doute.",
	"C'est moi qui devrait commander.": "C'est moi qui devrais commander.",
	"Je sais c'que fais.": "Je sais c'que j'fais.",
	"Certainenement.": "Certainement.",
	"Sur le champs.": "Sur-le-champ.",
	"Sur le champs !": "Sur-le-champ !",
	"Nous sommes attaqué !": "Nous sommes attaqués !",
	"Comme le veut le déesse.": "Comme le veut la déesse.",
	"Ne nous faillirons pas.": "Nous ne faillirons pas.",
};

/** Bruits sans paroles (placeholders du wiki, cris), et la réplique de la Dryade qui contient une insulte. */
const MUETS =
	/^(?:Sélectionné|Ordre|Produit|Cri de guerre|Mort$)|^(?:A+h+|Ru+gh+|Aa+r+h+) !$|mongolien/i;

interface Ligne {
	unite: string;
	categorie: string;
	fichier: string;
	texte: string;
}

export function lireRepliques(wikitexte: string): Ligne[] {
	const lignes: Ligne[] = [];
	const sm2 = /\{\{sm2\|([^|}]+)\|([^}]*)\}\}/g;
	const alertes = wikitexte.match(/== Alertes ==([\s\S]*?)\n== /)?.[1] ?? "";
	for (const [, fichier, texte] of alertes.matchAll(sm2)) {
		lignes.push({ unite: "Annonces", categorie: "alerte", fichier, texte });
	}
	const blocs =
		/={3,4}[ \t]*([^=\n]+?)[ \t]*={3,4}[ \t]*\n(?:(?!==)[^\n]*\n)*?\{\{RépliqueBox([\s\S]*?)\n\}\}/g;
	for (const [, unite, corps] of wikitexte.matchAll(blocs)) {
		let categorie = "";
		for (const l of corps.split("\n")) {
			const c = l.match(/^\|\s*([a-zéèêàç]+)\s*=/);
			if (c) categorie = c[1];
			for (const [, fichier, texte] of l.matchAll(sm2)) {
				lignes.push({ unite, categorie, fichier, texte });
			}
		}
	}
	return lignes;
}

export function nettoyer(texte: string): string {
	const t = texte
		.replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, "$1")
		.replace(/''+/g, "")
		.replace(/\s*\((?:Référence|référence)[^)]*\)/g, "")
		.replace(/\s*\.\.\./g, "…")
		.replace(/\s+/g, " ")
		.trim();
	return CORRECTIONS[t] ?? t;
}

/** « Warcraft3ClassicHumainPaysanOui2.ogg » → « humain-paysan-oui2 ». */
export function identifiant(race: RaceDuJeu, fichier: string): string {
	return `${race}-${fichier
		.replace(/^Warcraft3Classic(?:Humain|Orc|MortVivant|ElfeDeLaNuit)/, "")
		.replace(/\.ogg$/, "")
		.replace(/(?<=.)(\p{Lu})/gu, "-$1")
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()}`;
}

/** Où proposer une réplique : l'ordre reçu, la question, la fin du travail… */
export function evenementsPour(
	categorie: string,
	unite: string,
	texte: string,
): Evenement[] {
	switch (categorie) {
		case "oui":
			return ["envoi"];
		case "crideguerre":
			return ["envoi", "debut"];
		case "ouiattaque":
			return PRINCIPALES.has(unite) ? ["envoi"] : [];
		case "quoi":
			return /travail/i.test(texte) ? ["envoi", "attente"] : ["attente"];
		case "prêt":
			return ["attente", "fini", "debut"];
		case "énervé":
			return ["insiste"];
		case "alerte":
			if (/termin|accompli|construit/i.test(texte)) return ["fini"];
			if (/allié|frères/i.test(texte)) return [];
			if (/attaqu|assiég|infidèles|souillent|engagent/i.test(texte))
				return ["attente"];
			if (/(?:plus|assez) d'or|(?:plus|assez) de bois/i.test(texte))
				return ["attente"];
			return [];
		default:
			return [];
	}
}

/** Le serveur du wiki refuse les rafales : trois essais, de plus en plus espacés. */
async function chercher(url: string): Promise<Response | undefined> {
	for (const pause of [0, 3000, 10_000]) {
		await Bun.sleep(pause);
		const res = await fetch(url, {
			headers: ENTETES,
			signal: AbortSignal.timeout(30_000),
		}).catch(() => undefined);
		if (res?.ok) return res;
	}
}

async function api(params: Record<string, string>) {
	const url = `${API}?${new URLSearchParams({ format: "json", ...params })}`;
	const res = await chercher(url);
	if (!res) throw new Error(`le wiki ne répond pas (${url})`);
	return res.json();
}

async function wikitexte(page: string): Promise<string> {
	const d = await api({
		action: "parse",
		page: `Répliques de Warcraft III/${page}`,
		prop: "wikitext",
	});
	return d.parse.wikitext["*"];
}

/** Nom de fichier → adresse du .ogg, par lots de 50 (limite de l'API). */
async function adresses(fichiers: string[]): Promise<Map<string, string>> {
	const out = new Map<string, string>();
	for (let i = 0; i < fichiers.length; i += 50) {
		const lot = fichiers.slice(i, i + 50);
		const d = await api({
			action: "query",
			prop: "imageinfo",
			iiprop: "url",
			titles: lot.map((f) => `Fichier:${f}`).join("|"),
		});
		const origine = new Map<string, string>(
			(d.query.normalized ?? []).map((n: { from: string; to: string }) => [
				n.to,
				n.from,
			]),
		);
		for (const p of Object.values(d.query.pages) as {
			title: string;
			imageinfo?: { url: string }[];
		}[]) {
			const url = p.imageinfo?.[0]?.url;
			if (url) {
				out.set(
					(origine.get(p.title) ?? p.title).replace(/^Fichier:/, ""),
					url,
				);
			}
		}
	}
	return out;
}

async function executer(commande: string[]): Promise<string> {
	const p = Bun.spawn(commande, {
		stdin: "ignore",
		stdout: "pipe",
		stderr: "pipe",
	});
	const [sortie, erreurs] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
	]);
	await p.exited;
	return sortie + erreurs;
}

/** Coupe les silences du début et de la fin : la réplique part tout de suite. */
const RACCOURCIR =
	"silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.03,areverse," +
	"silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.08,areverse";

/** Convertit en mp3 au volume perçu visé et rend la durée en secondes (0 si la conversion rate). */
async function normaliser(entree: string, sortie: string): Promise<number> {
	const ffmpeg = ["ffmpeg", "-hide_banner", "-nostats", "-i", entree, "-af"];
	const mesure = await executer([
		...ffmpeg,
		`${RACCOURCIR},ebur128=peak=true`,
		"-f",
		"null",
		"-",
	]);
	const resume = mesure.slice(mesure.lastIndexOf("Summary:"));
	let lufs = Number(resume.match(/I:\s+(-?[\d.]+) LUFS/)?.[1]);
	const crete = Number(resume.match(/Peak:\s+(-?[\d.]+) dBFS/)?.[1] ?? 0);
	if (!(lufs > -60)) {
		// Trop court pour la mesure intégrée (moins de 0,4 s) : on se rabat sur le volume moyen.
		const vd = await executer([
			...ffmpeg,
			`${RACCOURCIR},volumedetect`,
			"-f",
			"null",
			"-",
		]);
		lufs = Number(vd.match(/mean_volume:\s+(-?[\d.]+) dB/)?.[1] ?? CIBLE_LUFS);
	}
	// Le limiteur rattrape jusqu'à 6 dB de crête ; au-delà, on baisse le gain.
	const gain = Math.min(CIBLE_LUFS - lufs, -1 - crete + 6);
	// Écrit à côté puis renomme : une conversion coupée ne laisse pas de mp3 à moitié fait.
	const partiel = `${sortie}.part`;
	await executer([
		...ffmpeg,
		`${RACCOURCIR},volume=${gain.toFixed(1)}dB,alimiter=limit=0.89:level=0`,
		"-y",
		"-ac",
		"1",
		"-ar",
		"44100",
		"-c:a",
		"libmp3lame",
		"-q:a",
		"4",
		"-f",
		"mp3",
		partiel,
	]);
	const d = await duree(partiel);
	if (!(d > 0)) {
		await rm(partiel, { force: true });
		return 0;
	}
	await rename(partiel, sortie);
	return d;
}

async function duree(fichier: string): Promise<number> {
	const s = await executer([
		"ffprobe",
		"-v",
		"error",
		"-show_entries",
		"format=duration",
		"-of",
		"csv=p=0",
		fichier,
	]);
	return Math.round(Number(s) * 10) / 10;
}

async function telecharger(url: string): Promise<ArrayBuffer | undefined> {
	return (await chercher(url))?.arrayBuffer();
}

async function parLots<T>(
	elements: T[],
	n: number,
	f: (e: T) => Promise<void>,
): Promise<void> {
	let i = 0;
	await Promise.all(
		Array.from({ length: n }, async () => {
			while (i < elements.length) await f(elements[i++]);
		}),
	);
}

export interface BilanRecuperation {
	/** Répliques retenues sur le wiki. */
	total: number;
	/** Répliques prêtes à jouer, dans le catalogue. */
	pretes: number;
	/** Téléchargées et converties pendant ce passage. */
	nouvelles: number;
	/** Ce qui n'a pas pu être récupéré, avec la raison. */
	manquantes: string[];
}

/**
 * Télécharge et convertit les répliques qui manquent, puis écrit le catalogue.
 * `progression` est appelée toutes les 50 répliques, et à la fin.
 */
export async function recuperer(
	progression: (fait: number, total: number) => void = () => {},
): Promise<BilanRecuperation> {
	await mkdir(DOSSIER_SONS, { recursive: true });
	const brut = await mkdtemp(join(tmpdir(), "sons-warcraft-"));
	try {
		const retenues = new Map<
			string,
			Omit<Replique, "duree"> & { fichier: string }
		>();
		for (const [race, page] of Object.entries(PAGES) as [RaceDuJeu, string][]) {
			for (const l of lireRepliques(await wikitexte(page))) {
				const unite = l.unite === "Annonces" ? l.unite : UNITES[race][l.unite];
				const texte = nettoyer(l.texte);
				if (!unite || MUETS.test(texte)) continue;
				const evenements = evenementsPour(l.categorie, unite, texte);
				const id = identifiant(race, l.fichier);
				if (!evenements.length || retenues.has(id)) continue;
				retenues.set(id, {
					id,
					race,
					unite,
					principale: PRINCIPALES.has(unite),
					categorie: l.categorie,
					texte,
					evenements,
					fichier: l.fichier,
				});
			}
		}

		const connues = new Map(
			(await chargerCatalogue()).map((r) => [r.id, r.duree]),
		);
		const urls = await adresses([...retenues.values()].map((r) => r.fichier));
		const durees = new Map<string, number>();
		const manquantes: string[] = [];
		const total = retenues.size;
		let fait = 0;
		let nouvelles = 0;
		await parLots([...retenues.values()], 2, async (r) => {
			const mp3 = join(DOSSIER_SONS, `${r.id}.mp3`);
			if (await Bun.file(mp3).exists()) {
				// Déjà converti lors d'un passage précédent : pour tout refaire, vider sons/.
				durees.set(r.id, connues.get(r.id) || (await duree(mp3)));
			} else {
				const url = urls.get(r.fichier);
				const son = url ? await telecharger(url) : undefined;
				if (!son) {
					manquantes.push(
						`${r.fichier} : ${url ? "téléchargement refusé (relance plus tard : ça reprend)" : "absent du wiki"}`,
					);
				} else {
					const ogg = join(brut, `${r.id}.ogg`);
					await Bun.write(ogg, son);
					const d = await normaliser(ogg, mp3);
					if (d > 0) {
						durees.set(r.id, d);
						nouvelles++;
					} else manquantes.push(`${r.fichier} : conversion ratée`);
				}
			}
			fait++;
			if (fait % 50 === 0 || fait === total) progression(fait, total);
		});

		const catalogue: Replique[] = [];
		for (const { fichier, ...r } of retenues.values()) {
			const d = durees.get(r.id);
			if (d) catalogue.push({ ...r, duree: d });
		}
		await Bun.write(CATALOGUE, `${JSON.stringify(catalogue, null, 1)}\n`);
		return { total, pretes: catalogue.length, nouvelles, manquantes };
	} finally {
		await rm(brut, { recursive: true, force: true });
	}
}

if (import.meta.main) {
	const bilan = await recuperer((fait, total) =>
		console.log(`  ${fait}/${total} répliques`),
	);
	console.log(
		`${bilan.pretes} répliques prêtes dans ${DOSSIER_SONS} (${bilan.nouvelles} nouvelles)`,
	);
	for (const m of bilan.manquantes) console.warn(`  ✗ ${m}`);
}
