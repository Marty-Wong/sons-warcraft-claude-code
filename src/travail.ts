import { estAutomatique, type Travail, VRAI_TRAVAIL_MS } from "./regles";

/**
 * Ce que l'historique de la session (transcript JSONL de Claude Code) dit du tour qui vient
 * de finir : est-ce la vraie fin du travail ou un agent qui rend le sien, et quel travail.
 */
export interface Bilan {
	/** Heure de ton dernier message (ms). */
	depuis: number;
	/** Le tour a commencé par le retour d'une tâche, d'un agent ou d'une autre session, pas par toi. */
	retourDAgent: boolean;
	/** Tâches lancées en arrière-plan et pas encore revenues (12 dernières heures). */
	enCours: number;
	travail: Travail;
}

/** Fin de l'historique lue : assez pour des heures de travail sans relire 20 Mo à chaque fois. */
const QUEUE_MAX = 8_000_000;
/** Une tâche lancée il y a plus longtemps sans jamais revenir est oubliée. */
const OUBLI_MS = 12 * 3600_000;

/** Commandes qui lisent sans rien produire : elles ne font pas un « travail ». */
const LECTURE_SEULE =
	/^(?:ls|cat|head|tail|grep|rg|ugrep|find|jq|wc|echo|printf|pwd|which|file|stat|du|df|ps|pgrep|lsof|date|sed -n|awk|sort|uniq|cut|diff|column|tree|git (?:status|log|diff|show|branch|blame)|afinfo|ffprobe|pdfinfo|pdftotext|open|curl|mdfind|xxd|shasum|md5|env|uname|sw_vers|defaults read|sleep|true|test)\b/;

/** Agents qui cherchent ou lisent sans modifier. */
const AGENTS_DE_RECHERCHE =
	/^(?:Explore|explore[-\w]*|websearch|fast-websearch|code-explorer|claude-code-guide|Plan|code-reviewer)$/i;

const OUTILS_DE_MODIFICATION = new Set(["Edit", "MultiEdit", "NotebookEdit"]);

export function lectureSeule(commande: string): boolean {
	return commande
		.split(/&&|;|\|\|/)
		.map((s) => s.trim().replace(/^[({]\s*/, ""))
		.filter((s) => s && !s.startsWith("cd "))
		.every((s) => LECTURE_SEULE.test(s));
}

interface Entree {
	type?: string;
	isMeta?: boolean;
	timestamp?: string;
	origin?: { kind?: string };
	message?: { content?: unknown };
	attachment?: {
		type?: string;
		prompt?: string;
		timestamp?: string;
		origin?: { kind?: string };
	};
	/** Arrivé pendant que Claude travaillait (file d'attente) : ne démarre pas de tour. */
	enFile?: boolean;
}

/** Un message de la file d'attente, ramené à la forme d'un message ordinaire. */
function sansFile(e: Entree): Entree {
	const a = e.attachment;
	if (e.type !== "attachment" || a?.type !== "queued_command") return e;
	return {
		type: "user",
		timestamp: e.timestamp ?? a.timestamp,
		origin: a.origin,
		message: { content: a.prompt ?? "" },
		enFile: true,
	};
}

type Morceau = {
	type?: string;
	text?: string;
	name?: string;
	input?: Record<string, unknown>;
	content?: unknown;
};

function morceaux(e: Entree): Morceau[] {
	const c = e.message?.content;
	if (typeof c === "string") return [{ type: "text", text: c }];
	return Array.isArray(c) ? (c as Morceau[]) : [];
}

function texte(m: Morceau): string {
	if (typeof m.text === "string") return m.text;
	if (typeof m.content === "string") return m.content;
	if (Array.isArray(m.content)) {
		return (m.content as Morceau[]).map((x) => x.text ?? "").join(" ");
	}
	return "";
}

function texteDuMessage(e: Entree): string {
	return morceaux(e)
		.filter((m) => m.type === "text")
		.map(texte)
		.join(" ");
}

function estDeToi(e: Entree): boolean {
	if (e.type !== "user" || e.isMeta) return false;
	if (e.origin?.kind) return e.origin.kind === "human";
	const t = texteDuMessage(e);
	return !!t && !estAutomatique(t);
}

function estUnRetour(e: Entree): boolean {
	if (e.type !== "user") return false;
	const kind = e.origin?.kind;
	if (kind === "task-notification" || kind === "peer") return true;
	return estAutomatique(texteDuMessage(e));
}

/**
 * Identifiant de la tâche lancée en arrière-plan, lu au début du résultat de l'outil :
 * ancré au début, pour ne pas compter un grep qui afficherait la même phrase.
 */
const ACCUSES_DE_LANCEMENT = [
	/^\s*Command running in background with ID: ?(\w+)/,
	/^\s*Command did not complete[^\n]*?moved to the background \(ID: ?(\w+)\)/,
	/^\s*Async agent launched successfully[\s\S]{0,600}?agentId: ?(\w+)/,
	/^\s*Workflow launched in background\. Task ID: ?(\w+)/,
];

function lancement(resultat: string): string | undefined {
	for (const motif of ACCUSES_DE_LANCEMENT) {
		const id = resultat.match(motif)?.[1];
		if (id) return id;
	}
}

export function bilanDeLHistorique(
	lignes: string[],
	maintenant: number,
): Bilan | undefined {
	const entrees: Entree[] = [];
	for (const l of lignes) {
		try {
			entrees.push(sansFile(JSON.parse(l)));
		} catch {
			// Ligne coupée ou vide.
		}
	}
	const iToi = entrees.findLastIndex(estDeToi);
	if (iToi < 0) return undefined;
	const depuis = Date.parse(entrees[iToi].timestamp ?? "") || maintenant;

	// Tâches lancées et revenues, sur toute la fin lue de l'historique.
	const lancees = new Map<string, { quand: number; indice: number }>();
	const revenues = new Set<string>();
	entrees.forEach((e, indice) => {
		const quand = Date.parse(e.timestamp ?? "") || maintenant;
		for (const m of morceaux(e)) {
			const id = m.type === "tool_result" ? lancement(texte(m)) : undefined;
			if (id) lancees.set(id, { quand, indice });
		}
		if (estUnRetour(e)) {
			for (const [, id] of texteDuMessage(e).matchAll(
				/<task-id>(\w+)<\/task-id>/g,
			)) {
				revenues.add(id);
			}
		}
	});
	const enCours = [...lancees].filter(
		([id, { quand }]) => !revenues.has(id) && maintenant - quand < OUBLI_MS,
	).length;

	// Le travail se compte depuis ton message, ou depuis le lancement d'une tâche revenue après lui.
	let debut = iToi;
	let retourDAgent = false;
	for (const e of entrees.slice(iToi + 1)) {
		if (!estUnRetour(e)) continue;
		if (!e.enFile) retourDAgent = true;
		for (const [, id] of texteDuMessage(e).matchAll(
			/<task-id>(\w+)<\/task-id>/g,
		)) {
			const lancee = lancees.get(id);
			if (lancee && lancee.indice < debut) debut = lancee.indice;
		}
	}

	let crees = false;
	let modifies = false;
	let travaille = false;
	for (const e of entrees.slice(debut)) {
		for (const m of morceaux(e)) {
			if (m.type === "tool_result") {
				const t = texte(m);
				if (/^\s*File created successfully/.test(t)) crees = true;
				if (/^\s*The file [^\n]* has been updated successfully/.test(t))
					modifies = true;
			}
			if (m.type !== "tool_use" || !m.name) continue;
			const entree = m.input ?? {};
			if (OUTILS_DE_MODIFICATION.has(m.name)) modifies = true;
			else if (m.name === "Bash") {
				if (!lectureSeule(String(entree.command ?? ""))) travaille = true;
			} else if (m.name === "Agent" || m.name === "Task") {
				if (!AGENTS_DE_RECHERCHE.test(String(entree.subagent_type ?? "")))
					travaille = true;
			} else if (m.name === "Workflow") travaille = true;
			// Read, Grep, WebSearch… : de la recherche, la nature par défaut.
		}
	}

	let travail: Travail;
	if (crees) travail = "construction";
	else if (modifies) travail = "amelioration";
	else if (maintenant - depuis < VRAI_TRAVAIL_MS) travail = "rapide";
	else if (travaille) travail = "construction";
	else travail = "recherche";

	return { depuis, retourDAgent, enCours, travail };
}

/** Lit la fin de l'historique ; undefined s'il est introuvable ou illisible. */
export async function lireBilan(
	chemin: string | undefined,
	maintenant: number,
): Promise<Bilan | undefined> {
	if (!chemin) return undefined;
	try {
		const f = Bun.file(chemin);
		const debut = Math.max(0, f.size - QUEUE_MAX);
		const lignes = (await f.slice(debut).text()).split("\n");
		if (debut > 0) lignes.shift();
		return bilanDeLHistorique(lignes, maintenant);
	} catch {
		return undefined;
	}
}
