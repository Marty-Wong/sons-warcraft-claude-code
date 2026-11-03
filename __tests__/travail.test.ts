import { describe, expect, test } from "bun:test";
import { bilanDeLHistorique, lectureSeule } from "../src/travail";

const T0 = Date.parse("2026-11-02T08:00:00Z");
const a = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

/** Lignes au format du transcript JSONL de Claude Code (relevé le 02/11/2026). */
const toi = (min: number, texte: string) =>
	JSON.stringify({
		type: "user",
		timestamp: a(min),
		origin: { kind: "human" },
		message: { content: texte },
	});
const outil = (min: number, name: string, input: Record<string, unknown>) =>
	JSON.stringify({
		type: "assistant",
		timestamp: a(min),
		message: { content: [{ type: "tool_use", name, input }] },
	});
const resultat = (min: number, texte: string) =>
	JSON.stringify({
		type: "user",
		timestamp: a(min),
		message: { content: [{ type: "tool_result", content: texte }] },
	});
const retour = (min: number, id: string) =>
	JSON.stringify({
		type: "user",
		timestamp: a(min),
		origin: { kind: "task-notification" },
		message: {
			content: `<task-notification> <task-id>${id}</task-id> <status>completed</status> </task-notification>`,
		},
	});

const bilan = (lignes: string[], min: number) =>
	bilanDeLHistorique(lignes, T0 + min * 60_000);

describe("bilanDeLHistorique : quel travail", () => {
	test("une réponse rapide sans rien modifier", () => {
		expect(bilan([toi(0, "Quelle heure ?")], 0.5)?.travail).toBe("rapide");
	});

	test("des lectures et des recherches pendant plus de 2 minutes", () => {
		const lignes = [
			toi(0, "Compare ces deux fichiers"),
			outil(1, "Read", { file_path: "/x" }),
			outil(2, "WebSearch", { query: "y" }),
			outil(3, "Bash", { command: "cd /p && grep -n x f | head" }),
		];
		expect(bilan(lignes, 5)?.travail).toBe("recherche");
	});

	test("des fichiers modifiés", () => {
		const lignes = [
			toi(0, "Corrige le README"),
			outil(1, "Edit", { file_path: "/x" }),
			resultat(1, "The file /x has been updated successfully."),
		];
		expect(bilan(lignes, 3)?.travail).toBe("amelioration");
	});

	test("un fichier créé, même vite", () => {
		const lignes = [
			toi(0, "Écris le script"),
			outil(0.2, "Write", { file_path: "/n" }),
			resultat(0.2, "File created successfully at: /n"),
		];
		expect(bilan(lignes, 1)?.travail).toBe("construction");
	});

	test("des commandes qui produisent, ou un workflow", () => {
		const lignes = [
			toi(0, "Refais la documentation"),
			outil(1, "Bash", { command: "bun run build" }),
		];
		expect(bilan(lignes, 4)?.travail).toBe("construction");
	});
});

describe("bilanDeLHistorique : vraie fin ou agent qui rend son travail", () => {
	const lance = [
		toi(0, "Lance les trois lots"),
		outil(0.1, "Workflow", { script: "…" }),
		resultat(0.1, "Workflow launched in background. Task ID: wzbto5xss"),
		outil(0.2, "Agent", {
			subagent_type: "general-purpose",
			run_in_background: true,
		}),
		resultat(
			0.2,
			"Async agent launched successfully.\nagentId: a943208002ea4a1ab (internal ID)",
		),
	];

	test("ton tour qui lance du travail en arrière-plan : 2 tâches en cours", () => {
		const b = bilan(lance, 1);
		expect(b?.retourDAgent).toBe(false);
		expect(b?.enCours).toBe(2);
	});

	test("un agent revient, l'autre tourne encore : retour d'agent", () => {
		const b = bilan([...lance, retour(20, "a943208002ea4a1ab")], 21);
		expect(b?.retourDAgent).toBe(true);
		expect(b?.enCours).toBe(1);
	});

	test("le dernier revient : plus rien en cours, c'est la vraie fin", () => {
		const b = bilan(
			[...lance, retour(20, "a943208002ea4a1ab"), retour(40, "wzbto5xss")],
			41,
		);
		expect(b?.enCours).toBe(0);
		expect(b?.travail).toBe("construction");
	});

	test("une tâche lancée avant ton dernier message compte toujours", () => {
		const lignes = [
			toi(0, "Télécharge"),
			outil(0.1, "Bash", { command: "yt-dlp x", run_in_background: true }),
			resultat(0.1, "Command running in background with ID: bphuq4gpa."),
			toi(5, "Ça avance ?"),
		];
		expect(bilan(lignes, 6)?.enCours).toBe(1);
	});

	test("une tâche lancée il y a plus de 12 heures sans revenir est oubliée", () => {
		const lignes = [
			outil(0, "Bash", { command: "serveur", run_in_background: true }),
			resultat(0, "Command running in background with ID: bvieuxxx1."),
			toi(13 * 60, "Bonjour"),
		];
		expect(bilan(lignes, 13 * 60 + 1)?.enCours).toBe(0);
	});

	test("sans message de toi dans l'historique lu : pas de bilan", () => {
		expect(bilan([retour(1, "x")], 2)).toBeUndefined();
	});
});

describe("lectureSeule", () => {
	test("lire, chercher, compter", () => {
		expect(lectureSeule("cd ~/p && ls -la | head")).toBe(true);
		expect(lectureSeule("git status; git diff")).toBe(true);
	});

	test("produire", () => {
		expect(lectureSeule("cd ~/p && bun test")).toBe(false);
		expect(lectureSeule("ls && python3 build.py")).toBe(false);
	});
});

describe("bilanDeLHistorique : cas relevés dans les vraies sessions", () => {
	/** Retour arrivé pendant que Claude travaillait : rangé dans la file, pas comme un message. */
	const enFile = (min: number, id: string) =>
		JSON.stringify({
			type: "attachment",
			timestamp: a(min),
			attachment: {
				type: "queued_command",
				prompt: `<task-notification>\n<task-id>${id}</task-id>\n<status>completed</status>`,
				origin: { kind: "task-notification" },
			},
		});

	test("une commande trop longue passée en arrière-plan, revenue pendant le tour", () => {
		const lignes = [
			toi(0, "Télécharge les sons"),
			resultat(
				10,
				"Command did not complete within its 600s timeout and was moved to the background (ID: b1enu0apu). Output is being written to: /tmp/x",
			),
			enFile(12, "b1enu0apu"),
		];
		const b = bilan(lignes, 13);
		expect(b?.enCours).toBe(0);
		expect(b?.retourDAgent).toBe(false);
	});

	test("un grep qui affiche la phrase de lancement ne lance rien", () => {
		const lignes = [
			toi(0, "Cherche dans les historiques"),
			resultat(
				1,
				"exemples → running in background with ID: bphuq4gpa\nCommand running in background with ID: bxxxxxxxx",
			),
		];
		expect(bilan(lignes, 2)?.enCours).toBe(0);
	});

	test("ton message envoyé pendant que Claude travaillait compte comme ton dernier message", () => {
		const humainEnFile = JSON.stringify({
			type: "attachment",
			timestamp: a(5),
			attachment: {
				type: "queued_command",
				prompt: "Montre-moi les autres races",
				origin: { kind: "human" },
			},
		});
		expect(bilan([toi(0, "Fais les sons"), humainEnFile], 6)?.depuis).toBe(
			T0 + 5 * 60_000,
		);
	});
});
