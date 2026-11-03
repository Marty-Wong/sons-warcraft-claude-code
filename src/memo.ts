import { mkdir, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { CLI, dossierClaude } from "./config";

/**
 * Le mémo du CLAUDE.md de l'utilisateur : il dit à ses prochaines sessions de Claude d'où vient
 * un son et comment appliquer un choix collé. Deux commentaires le délimitent : l'outil l'ajoute,
 * le met à jour et le retire sans toucher au reste du fichier.
 */

export const DEBUT = "<!-- sons-warcraft:debut -->";
export const FIN = "<!-- sons-warcraft:fin -->";
const BLOC = /<!-- sons-warcraft:debut -->[\s\S]*?<!-- sons-warcraft:fin -->/;

/** Le bloc, marques comprises, avec le vrai chemin de cli.ts. */
export function memo(cli: string = CLI): string {
	return `${DEBUT}
## Sons Warcraft (hooks de Claude Code)
- « D'où vient ce son ? » : \`bun "${cli}" journal 30\` (heure, moment, session, réplique et raison de chaque son).
- Un texte collé qui commence par « Sons Warcraft : mon choix » : l'appliquer avec \`bun "${cli}" appliquer\` (le texte sur l'entrée standard), puis redire en clair ce qui joue.
- Rouvrir la page d'écoute pour changer de répliques : \`bun "${cli}" page\`.
${FIN}`;
}

/**
 * Le texte avec le bloc : remplacé sur place s'il y est déjà, sinon ajouté à la fin après une
 * ligne vide. Un texte qui ne finit pas par « \n » en reçoit un.
 */
export function avecMemo(texte: string, bloc: string): string {
	if (BLOC.test(texte)) return texte.replace(BLOC, () => bloc);
	if (!texte) return `${bloc}\n`;
	return `${texte.endsWith("\n") ? texte : `${texte}\n`}\n${bloc}\n`;
}

/** Le texte sans le bloc ni la ligne vide posée avant lui : l'inverse exact d'avecMemo. */
export function sansMemo(texte: string): string {
	const m = BLOC.exec(texte);
	if (!m) return texte;
	let debut = m.index;
	let fin = m.index + m[0].length;
	if (texte[fin] === "\n") fin++;
	if (
		debut >= 1 &&
		texte[debut - 1] === "\n" &&
		(debut === 1 || texte[debut - 2] === "\n")
	) {
		debut--;
	}
	return texte.slice(0, debut) + texte.slice(fin);
}

/** ~/.claude/CLAUDE.md, ou celui du dossier de CLAUDE_CONFIG_DIR. */
export function cheminDuMemo(): string {
	return join(dossierClaude(), "CLAUDE.md");
}

export type EtatDuMemo =
	| "ajoute"
	| "mis-a-jour"
	| "deja-la"
	| "retire"
	| "absent";

/** Ajoute le mémo (ou le met à jour) ; crée le fichier s'il manque. Idempotent. */
export async function ajouterMemo(
	chemin: string = cheminDuMemo(),
): Promise<EtatDuMemo> {
	const fichier = Bun.file(chemin);
	const avant = (await fichier.exists()) ? await fichier.text() : "";
	const apres = avecMemo(avant, memo());
	if (apres === avant) return "deja-la";
	await mkdir(dirname(chemin), { recursive: true });
	await Bun.write(chemin, apres);
	return BLOC.test(avant) ? "mis-a-jour" : "ajoute";
}

/** Retire le mémo ; un fichier qui ne contenait que lui est supprimé, comme avant son ajout. */
export async function retirerMemo(
	chemin: string = cheminDuMemo(),
): Promise<EtatDuMemo> {
	const fichier = Bun.file(chemin);
	if (!(await fichier.exists())) return "absent";
	const avant = await fichier.text();
	const apres = sansMemo(avant);
	if (apres === avant) return "absent";
	if (apres === "") await unlink(chemin);
	else await Bun.write(chemin, apres);
	return "retire";
}
