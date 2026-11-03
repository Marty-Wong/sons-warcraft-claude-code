import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import {
	chargerCatalogue,
	chargerChoix,
	DOSSIER,
	dossierClaude,
	HOOK,
	PAGE,
	RACINE,
} from "./config";
import { jouer } from "./lecture";
import { cheminDuMemo, memo, retirerMemo } from "./memo";
import { genererPage } from "./page";
import { recuperer } from "./recuperer";
import { ouvrir, verifierPrerequis } from "./systeme";

/**
 * Branche les sons dans Claude Code : quatre hooks dans settings.json, à côté de ceux qui y
 * sont déjà. Les fonctions de fusion sont pures et testées ; `lireReglages` et `ecrireReglages`
 * lisent et écrivent le fichier, avec une sauvegarde avant chaque changement.
 */

/** Les quatre hooks de Claude Code et le moment que chacun déclenche. */
export const BRANCHEMENTS = [
	{ evenement: "SessionStart", matcher: "startup", moment: "debut" },
	{ evenement: "UserPromptSubmit", moment: "envoi" },
	{ evenement: "Notification", moment: "attente" },
	{ evenement: "Stop", moment: "fini" },
] as const;
export type Moment = (typeof BRANCHEMENTS)[number]["moment"];

export interface Commande {
	type?: string;
	command?: string;
	async?: boolean;
	[cle: string]: unknown;
}
export interface Groupe {
	matcher?: string;
	hooks?: Commande[];
	[cle: string]: unknown;
}
export interface Reglages {
	hooks?: Record<string, Groupe[]>;
	[cle: string]: unknown;
}

const normal = (chemin: string) => chemin.replaceAll("\\", "/");

/** La commande d'un de nos hooks : chemins absolus entre guillemets (des espaces peuvent s'y glisser). */
export function commandeDuHook(
	bun: string,
	hook: string,
	moment: Moment,
): string {
	return `"${normal(bun)}" "${normal(hook)}" ${moment}`;
}

function echapper(texte: string): string {
	return texte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Une commande qui lance CE hook (ce dossier-ci), avec ou sans guillemets. */
export function estNotre(commande: string, hook: string): boolean {
	return new RegExp(`(?:^|[\\s"'])${echapper(normal(hook))}(?:["'\\s]|$)`).test(
		normal(commande),
	);
}

/** Une autre installation de l'outil : un autre …/src/hook.ts avec un de nos moments. */
const AUTRE_INSTALLATION =
	/[/\\]src[/\\]hook\.ts["']?\s+(?:debut|envoi|attente|fini)\s*$/;

/** Un hook qui joue déjà un son : lecteur audio, synthèse vocale ou fichier son. */
const JOUE_UN_SON =
	/(?:^|[\s;&|("'/])(?:afplay|paplay|aplay|ffplay|mpg123|mpv|cvlc)(?:\.exe)?\b|(?:^|[;&|]\s*)say\s|\.(?:mp3|wav|aiff?|ogg|oga|m4a|caf|flac)\b|Media\.SoundPlayer|\s-sound\s/i;

export interface Inventaire {
	notres: { evenement: string; commande: string }[];
	autresInstallations: string[];
	autresSons: { evenement: string; commande: string }[];
}

/** Ce que settings.json contient déjà : nos hooks, une autre installation, d'autres sons. */
export function inventaire(reglages: Reglages, hook: string): Inventaire {
	const inv: Inventaire = {
		notres: [],
		autresInstallations: [],
		autresSons: [],
	};
	for (const [evenement, groupes] of Object.entries(reglages.hooks ?? {})) {
		if (!Array.isArray(groupes)) continue;
		for (const groupe of groupes) {
			for (const h of Array.isArray(groupe?.hooks) ? groupe.hooks : []) {
				const commande = typeof h?.command === "string" ? h.command : "";
				if (!commande) continue;
				if (estNotre(commande, hook)) inv.notres.push({ evenement, commande });
				else if (AUTRE_INSTALLATION.test(commande))
					inv.autresInstallations.push(commande);
				else if (JOUE_UN_SON.test(commande))
					inv.autresSons.push({ evenement, commande });
			}
		}
	}
	return inv;
}

/**
 * Retire les commandes qui répondent à `retirer`. Un groupe ou un événement vidé par ce retrait
 * disparaît ; tout le reste garde sa place, à l'identique.
 */
function sans(
	reglages: Reglages,
	retirer: (commande: string) => boolean,
): Reglages {
	const copie = structuredClone(reglages);
	if (!copie.hooks || typeof copie.hooks !== "object") return copie;
	let vide = false;
	for (const [evenement, groupes] of Object.entries(copie.hooks)) {
		if (!Array.isArray(groupes)) continue;
		const restants: Groupe[] = [];
		for (const groupe of groupes) {
			if (!Array.isArray(groupe?.hooks)) {
				restants.push(groupe);
				continue;
			}
			const hooks = groupe.hooks.filter(
				(h) => !(typeof h?.command === "string" && retirer(h.command)),
			);
			if (hooks.length === groupe.hooks.length) restants.push(groupe);
			else if (hooks.length) restants.push({ ...groupe, hooks });
		}
		if (restants.length) copie.hooks[evenement] = restants;
		else if (groupes.length) {
			delete copie.hooks[evenement];
			vide = true;
		}
	}
	if (vide && !Object.keys(copie.hooks).length) delete copie.hooks;
	return copie;
}

export interface Branchement {
	reglages: Reglages;
	/** Nos quatre hooks étaient déjà là, à l'identique : rien à écrire. */
	inchange: boolean;
	/** Une autre installation est branchée et --remplacer n'est pas demandé : rien n'a changé. */
	refuse: boolean;
	autresInstallations: string[];
	autresSons: { evenement: string; commande: string }[];
}

/** Nos quatre hooks dans les réglages, à côté des autres ; idempotent. */
export function brancher(
	reglages: Reglages,
	bun: string,
	hook: string,
	remplacer = false,
): Branchement {
	const { notres, autresInstallations, autresSons } = inventaire(
		reglages,
		hook,
	);
	const bilan = { autresInstallations, autresSons };
	if (autresInstallations.length && !remplacer) {
		return { reglages, inchange: true, refuse: true, ...bilan };
	}
	const enPlace =
		!autresInstallations.length &&
		notres.length === BRANCHEMENTS.length &&
		BRANCHEMENTS.every((b) =>
			(reglages.hooks?.[b.evenement] ?? []).some(
				(g) =>
					("matcher" in b ? g.matcher === b.matcher : true) &&
					(g.hooks ?? []).some(
						(h) =>
							h.command === commandeDuHook(bun, hook, b.moment) &&
							h.async === true,
					),
			),
		);
	if (enPlace) return { reglages, inchange: true, refuse: false, ...bilan };

	const nouveaux = sans(
		reglages,
		(c) => estNotre(c, hook) || (remplacer && AUTRE_INSTALLATION.test(c)),
	);
	nouveaux.hooks ??= {};
	const hooks = nouveaux.hooks;
	for (const b of BRANCHEMENTS) {
		const groupe: Groupe = {
			...("matcher" in b ? { matcher: b.matcher } : {}),
			hooks: [
				{
					type: "command",
					command: commandeDuHook(bun, hook, b.moment),
					async: true,
				},
			],
		};
		hooks[b.evenement] = [...(hooks[b.evenement] ?? []), groupe];
	}
	return { reglages: nouveaux, inchange: false, refuse: false, ...bilan };
}

/** Retire seulement nos hooks. */
export function debrancher(
	reglages: Reglages,
	hook: string,
): { reglages: Reglages; retires: number } {
	const retires = inventaire(reglages, hook).notres.length;
	return {
		reglages: retires ? sans(reglages, (c) => estNotre(c, hook)) : reglages,
		retires,
	};
}

export function cheminDesReglages(): string {
	return join(dossierClaude(), "settings.json");
}

/** settings.json tel quel ; {} s'il n'existe pas. Refuse un fichier illisible : on n'y touche pas. */
export async function lireReglages(chemin: string): Promise<Reglages> {
	const fichier = Bun.file(chemin);
	if (!(await fichier.exists())) return {};
	const texte = await fichier.text();
	if (!texte.trim()) return {};
	try {
		const r = JSON.parse(texte);
		if (r && typeof r === "object" && !Array.isArray(r)) return r;
	} catch {
		// Traité juste en dessous.
	}
	throw new Error(
		`${chemin} n'est pas un JSON lisible : corrige-le d'abord, je n'y touche pas.`,
	);
}

/** Les tabulations ou le nombre d'espaces du fichier d'origine, pour ne pas changer son style. */
export function indentationDe(texte: string): string | number {
	if (/^\t/m.test(texte)) return "\t";
	return /^( +)"/m.exec(texte)?.[1].length ?? 2;
}

function dateDuJour(d: Date): string {
	const p = (n: number) => String(n).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Sauvegarde settings.json (settings.json.<prefixe>-AAAA-MM-JJ, sans jamais écraser une
 * sauvegarde existante), puis écrit les nouveaux réglages, à l'indentation du fichier d'origine
 * (les espaces peuvent changer, pas le contenu). `texteExact` : écrit tel quel à la place.
 * Rend le chemin de la sauvegarde.
 */
export async function ecrireReglages(
	chemin: string,
	reglages: Reglages,
	prefixe: string,
	maintenant: Date = new Date(),
	texteExact?: string,
): Promise<string | undefined> {
	let sauvegarde: string | undefined;
	let indentation: string | number = 2;
	if (await Bun.file(chemin).exists()) {
		indentation = indentationDe(await Bun.file(chemin).text());
		const base = `${chemin}.${prefixe}-${dateDuJour(maintenant)}`;
		sauvegarde = base;
		for (let n = 2; await Bun.file(sauvegarde).exists(); n++) {
			sauvegarde = `${base}-${n}`;
		}
		await copyFile(chemin, sauvegarde);
	}
	await mkdir(dirname(chemin), { recursive: true });
	await Bun.write(
		chemin,
		texteExact ?? `${JSON.stringify(reglages, null, indentation)}\n`,
	);
	return sauvegarde;
}

/** Les clés triées à tous les niveaux : deux réglages qui disent la même chose ont le même texte. */
export function canonique(valeur: unknown): string {
	const trier = (v: unknown): unknown => {
		if (Array.isArray(v)) return v.map(trier);
		if (v && typeof v === "object") {
			const o = v as Record<string, unknown>;
			return Object.fromEntries(
				Object.keys(o)
					.sort()
					.map((cle) => [cle, trier(o[cle])]),
			);
		}
		return v;
	};
	return JSON.stringify(trier(valeur));
}

/** Le texte exact de la sauvegarde s'il dit la même chose que `reglages` (sinon undefined). */
export function texteSiIdentique(
	reglages: Reglages,
	sauvegarde: string,
): string | undefined {
	try {
		return canonique(JSON.parse(sauvegarde)) === canonique(reglages)
			? sauvegarde
			: undefined;
	} catch {
		return undefined;
	}
}

/** Rang d'une sauvegarde d'installation : la date, puis le numéro du même jour (-2, -3…). */
export function rangDeSauvegarde(nom: string): [string, number] | undefined {
	const m = /\.avant-sons-warcraft-(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/.exec(nom);
	return m ? [m[1], Number(m[2] ?? 1)] : undefined;
}

/** La sauvegarde faite avant l'installation la plus récente : settings.json.avant-sons-warcraft-*. */
export async function derniereSauvegarde(
	chemin: string,
): Promise<string | undefined> {
	const dossier = dirname(chemin);
	let meilleure: { nom: string; rang: [string, number] } | undefined;
	for (const nom of await readdir(dossier).catch(() => [] as string[])) {
		if (!nom.startsWith(`${basename(chemin)}.`)) continue;
		const rang = rangDeSauvegarde(nom);
		if (!rang) continue;
		if (
			!meilleure ||
			rang[0] > meilleure.rang[0] ||
			(rang[0] === meilleure.rang[0] && rang[1] > meilleure.rang[1])
		) {
			meilleure = { nom, rang };
		}
	}
	return meilleure && join(dossier, meilleure.nom);
}

export interface OptionsInstallation {
	telechargement: boolean;
	ouvrir: boolean;
	muet: boolean;
	remplacer: boolean;
}

const dire = (texte = "") => console.log(texte);

/** `bun run installer` : prérequis, répliques, hooks, page d'écoute. Rend le code de sortie. */
export async function installer(o: OptionsInstallation): Promise<number> {
	dire("Sons Warcraft pour Claude Code : installation\n");

	const manques = verifierPrerequis({ telechargement: o.telechargement });
	if (manques.length) {
		dire("Il manque :");
		for (const m of manques) {
			dire(`  ✗ ${m.outil} : ${m.pourquoi}`);
			dire(`      → ${m.commande}`);
		}
		dire("\nInstalle-les, puis relance : bun run installer");
		return 1;
	}
	dire(
		o.telechargement
			? "✓ Bun, ffmpeg et un lecteur de sons sont là"
			: "✓ Bun et un lecteur de sons sont là",
	);

	if (o.telechargement) {
		dire(
			"Téléchargement des répliques depuis WoWWiki FR (quelques minutes la première fois)…",
		);
		try {
			const b = await recuperer((fait, total) =>
				dire(`  ${fait}/${total} répliques`),
			);
			dire(
				`✓ ${b.pretes} répliques prêtes (${b.nouvelles} téléchargées à l'instant)`,
			);
			if (b.manquantes.length) {
				dire(
					`  ${b.manquantes.length} n'ont pas pu être récupérées. Relance bun run installer plus tard : ça reprend là où ça s'est arrêté.`,
				);
				for (const m of b.manquantes.slice(0, 5)) dire(`    ✗ ${m}`);
			}
		} catch (e) {
			dire(
				`✗ Téléchargement impossible : ${e instanceof Error ? e.message : e}`,
			);
			dire(
				"  Le wiki refuse peut-être les rafales : relance bun run installer dans quelques minutes, ça reprend.",
			);
			return 1;
		}
	}
	const catalogue = await chargerCatalogue();
	if (!catalogue.length) {
		if (o.telechargement) {
			dire(
				"✗ Aucune réplique n'a pu être récupérée : relance bun run installer plus tard.",
			);
			return 1;
		}
		dire("! Pas encore de répliques téléchargées (--sans-telechargement).");
	}

	const chemin = cheminDesReglages();
	let reglages: Reglages;
	try {
		reglages = await lireReglages(chemin);
	} catch (e) {
		dire(`✗ ${e instanceof Error ? e.message : e}`);
		return 1;
	}
	const bun = Bun.which("bun") ?? process.execPath;
	const b = brancher(reglages, bun, HOOK, o.remplacer);
	if (b.refuse) {
		dire("✗ Une autre installation des sons Warcraft est déjà branchée :");
		for (const c of b.autresInstallations) dire(`    ${c}`);
		dire(
			"  Rien n'a changé. Pour la remplacer par celle-ci : bun run installer --remplacer",
		);
		return 2;
	}
	if (b.inchange) dire(`✓ Les 4 hooks sont déjà branchés dans ${chemin}`);
	else {
		const sauvegarde = await ecrireReglages(
			chemin,
			b.reglages,
			"avant-sons-warcraft",
		);
		dire(
			`✓ 4 hooks branchés dans ${chemin}${sauvegarde ? ` (sauvegarde : ${sauvegarde})` : ""}`,
		);
		if (b.autresInstallations.length)
			dire("  L'autre installation a été débranchée.");
	}
	if (b.autresSons.length) {
		dire(
			"\n! D'autres hooks jouent déjà un son. Je les ai laissés, mais tu entendrais les deux :",
		);
		for (const s of b.autresSons) dire(`    ${s.evenement} : ${s.commande}`);
		dire(
			"  Retire-les de settings.json si tu ne veux plus que les répliques de Warcraft.",
		);
	}

	const choix = await chargerChoix();
	await Bun.write(PAGE, genererPage(catalogue, choix));
	dire(`✓ Page d'écoute : ${PAGE}`);
	if (!o.muet) {
		const id = catalogue.some((r) => r.id === "humain-paysan-pret1")
			? "humain-paysan-pret1"
			: choix.debut.find((x) => catalogue.some((r) => r.id === x));
		if (id) await jouer(id, choix.volume);
	}
	if (o.ouvrir) await ouvrir(PAGE);

	dire(`
C'est installé. La suite :
  1. Relance Claude Code : les hooks sont lus à l'ouverture d'une session.
  2. Choisis tes répliques sur la page d'écoute (bun run page pour la rouvrir) :
     clique pour écouter, ♥ pour garder, ★ pour une voix principale,
     puis « Copier mon choix » et colle le texte à Claude.
  3. Pour que tes prochaines sessions sachent d'où vient un son et comment appliquer
     ton choix : bun src/cli.ts memo ajouter. Il ajoute ce mémo à ${cheminDuMemo()}
     (et bun src/cli.ts memo retirer l'enlève) :

${memo()}`);
	return 0;
}

/** `bun run desinstaller` : retire seulement nos hooks ; le dossier reste. Rend le code de sortie. */
export async function desinstaller(): Promise<number> {
	const chemin = cheminDesReglages();
	let reglages: Reglages;
	try {
		reglages = await lireReglages(chemin);
	} catch (e) {
		dire(`✗ ${e instanceof Error ? e.message : e}`);
		return 1;
	}
	const d = debrancher(reglages, HOOK);
	if (!d.retires) {
		dire(`Rien à retirer : aucun hook de cette installation dans ${chemin}.`);
	} else {
		// Rien d'autre n'a changé depuis l'installation : on remet le fichier d'avant, octet pour octet.
		const avant = await derniereSauvegarde(chemin);
		const exact = avant
			? texteSiIdentique(d.reglages, await Bun.file(avant).text())
			: undefined;
		const sauvegarde = await ecrireReglages(
			chemin,
			d.reglages,
			"avant-desinstallation-sons-warcraft",
			new Date(),
			exact,
		);
		dire(
			`✓ ${d.retires} hooks retirés de ${chemin}${sauvegarde ? ` (sauvegarde : ${sauvegarde})` : ""}`,
		);
		if (exact) dire("  settings.json est revenu tel qu'avant l'installation.");
	}
	if ((await retirerMemo()) === "retire") {
		dire(`✓ Mémo « Sons Warcraft » retiré de ${cheminDuMemo()}`);
	}
	const ailleurs = !DOSSIER.startsWith(RACINE) ? ` et ${DOSSIER}` : "";
	dire(
		`Pour tout effacer (code, sons, choix, journal) : supprime le dossier ${RACINE}${ailleurs}.`,
	);
	dire(
		`Les sauvegardes de settings.json restent à côté de lui : ${basename(chemin)}.avant-sons-warcraft-… et ${basename(chemin)}.avant-desinstallation-sons-warcraft-….`,
	);
	return 0;
}
