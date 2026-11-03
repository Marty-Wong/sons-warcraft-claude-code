import { basename } from "node:path";
import {
	chargerCatalogue,
	chargerChoix,
	type Evenement,
	nomUnite,
} from "./config";
import { noter } from "./journal";
import { jouer } from "./lecture";
import {
	annonceDe,
	choisirRace,
	deLaRace,
	estAutomatique,
	estInsistant,
	racesEnJeu,
	selonImportance,
	selonTravail,
	type Travail,
	tirerSelonRaces,
	VRAI_TRAVAIL_MS,
} from "./regles";
import { ecrireSession, lireSession, racesPrises } from "./session";
import { tirer } from "./tirage";
import { lireBilan } from "./travail";

/**
 * Hook Claude Code : joue une réplique de Warcraft III.
 *
 *   bun <dépôt>/src/hook.ts debut|envoi|attente|fini
 *
 * Branché par l'installateur avec `async: true` : la réplique joue pendant que Claude travaille.
 * N'écrit rien sur stdout : celui d'un UserPromptSubmit ou d'un SessionStart irait dans le
 * contexte de Claude. Chaque appel laisse une ligne dans journal.log. Ne fait jamais échouer
 * Claude Code.
 */

const HOOKS = ["debut", "envoi", "attente", "fini"] as const;
type Hook = (typeof HOOKS)[number];

interface EntreeHook {
	session_id?: string;
	cwd?: string;
	transcript_path?: string;
	prompt?: string;
	source?: string;
	notification_type?: string;
}

const NOMS_DU_TRAVAIL: Record<Travail, string> = {
	rapide: "réponse rapide",
	recherche: "recherche",
	amelioration: "amélioration",
	construction: "construction",
};

function lire(brut: string): EntreeHook {
	try {
		return JSON.parse(brut);
	} catch {
		return {};
	}
}

function extrait(texte: string): string {
	const t = texte.replace(/\s+/g, " ").trim();
	return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

function duree(ms: number): string {
	return ms < 60_000
		? `${Math.round(ms / 1000)} s`
		: `${Math.round(ms / 60_000)} min`;
}

async function main(): Promise<void> {
	// Lue même quand elle ne sert pas : celle de Stop contient toute la réponse.
	const entree = lire(await Bun.stdin.text().catch(() => ""));
	const hook = process.argv[2] as Hook;
	if (!HOOKS.includes(hook)) return;

	const maintenant = Date.now();
	const sessionId = entree.session_id ?? "inconnue";
	const ou = `${sessionId.slice(0, 8)}  ${basename(entree.cwd ?? "") || "?"}`;
	const muet = (raison: string) =>
		noter(
			`${hook.padEnd(9)} ${"".padEnd(10)} ${ou}  — muet : ${raison}`,
			new Date(maintenant),
		);

	// `claude -p` et le SDK : un Claude lancé par un script reste muet.
	if (process.env.CLAUDE_CODE_ENTRYPOINT?.startsWith("sdk")) {
		return muet("Claude lancé par un script");
	}
	if (hook === "debut" && entree.source && entree.source !== "startup") {
		return muet(`session reprise (${entree.source})`);
	}
	if (hook === "envoi" && estAutomatique(entree.prompt ?? "")) {
		return muet(`message automatique « ${extrait(entree.prompt ?? "")} »`);
	}

	const [choix, catalogue, session] = await Promise.all([
		chargerChoix(),
		chargerCatalogue(),
		lireSession(sessionId),
	]);
	if (!(choix.volume > 0)) return muet("volume à 0");
	const repliques = new Map(catalogue.map((r) => [r.id, r]));
	if (choix.raceParSession && !session.race) {
		session.race = choisirRace(
			racesEnJeu(choix),
			await racesPrises(sessionId, maintenant),
			choix.frequences,
		);
	}
	const race = choix.raceParSession ? session.race : undefined;

	let moment: Evenement = hook;
	let principal = true;
	let travail: Travail | undefined;
	let pourquoi = "";
	if (hook === "envoi") {
		session.envois = [...session.envois, maintenant].slice(-5);
		session.demande = maintenant;
		pourquoi = `« ${extrait(entree.prompt ?? "")} »`;
		if (choix.insiste.length && estInsistant(session.envois, maintenant)) {
			moment = "insiste";
			pourquoi = `3 messages en moins d'une minute · ${pourquoi}`;
		}
	} else if (hook === "attente") {
		principal = entree.notification_type !== "idle_prompt";
		pourquoi = principal
			? (entree.notification_type ?? "question")
			: "rappel : une minute sans réponse";
	} else if (hook === "fini") {
		const bilan = await lireBilan(entree.transcript_path, maintenant);
		const depuis = bilan?.depuis ?? session.demande ?? undefined;
		const temps = depuis ? `, ${duree(maintenant - depuis)}` : "";
		const enCours = bilan?.enCours ?? 0;
		const retour = bilan ? bilan.retourDAgent : !session.demande;
		if (retour && (enCours > 0 || !bilan)) {
			principal = false;
			pourquoi = bilan
				? `un agent a rendu son travail, ${enCours} encore en cours`
				: "sans message de ta part (historique illisible)";
		} else if (enCours > 0) {
			travail = "rapide";
			pourquoi = `travail lancé en arrière-plan, ${enCours} en cours`;
		} else {
			travail =
				bilan?.travail ??
				(depuis && maintenant - depuis >= VRAI_TRAVAIL_MS
					? "construction"
					: "rapide");
			session.demande = null;
			pourquoi = `fin du travail : ${NOMS_DU_TRAVAIL[travail]}${temps}`;
		}
	}

	let ids =
		moment === "attente" || moment === "fini"
			? selonImportance(choix, moment, principal)
			: choix[moment];
	// Seulement les répliques téléchargées, celles de la race de la session s'il y en a une.
	ids = deLaRace(
		ids.filter((id) => repliques.has(id)),
		race,
	);
	if (moment === "fini" && travail && choix.finSelonTravail) {
		const annonce = (id: string) => annonceDe(id, repliques.get(id)?.categorie);
		ids = selonTravail(ids, annonce, travail);
	}
	// Une race par session : une de ses répliques au hasard. Sinon, chaque son tire sa race selon les fréquences.
	const id = choix.raceParSession
		? tirer(ids, session.derniers[moment])
		: tirerSelonRaces(ids, session.derniers[moment], choix.frequences);
	session.vu = maintenant;
	if (id) session.derniers[moment] = id;
	await ecrireSession(sessionId, session);

	// La ligne du journal s'écrit après la lecture : elle dit si le son a vraiment joué.
	const r = id ? repliques.get(id) : undefined;
	const pasJoue = r ? await jouer(r.id, choix.volume) : undefined;
	const etiquette = `${moment}${moment === "attente" || moment === "fini" ? (principal ? " ★" : " ♥") : ""}`;
	const replique = r ? `« ${r.texte} » (${nomUnite(r)})` : "";
	const joue = !r
		? `— aucune réplique ${principal ? "" : "secondaire "}choisie`
		: pasJoue
			? `— pas joué : ${pasJoue} · ${replique}`
			: `▶ ${replique}`;
	await noter(
		`${etiquette.padEnd(9)} ${(race ?? "toutes").padEnd(10)} ${ou}  ${joue}${pourquoi ? ` · ${pourquoi}` : ""}`,
		new Date(maintenant),
	);
}

main()
	.catch(() => {
		// Un hook ne fait jamais échouer Claude Code.
	})
	.finally(() => process.exit(0));
