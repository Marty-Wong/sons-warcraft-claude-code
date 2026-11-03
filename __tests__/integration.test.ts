import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * L'installateur, le hook, le mémo et le désinstallateur pour de vrai, dans des dossiers
 * temporaires : CLAUDE_CONFIG_DIR et SONS_WARCRAFT_DONNEES ne laissent rien toucher du vrai
 * ~/.claude. Sans téléchargement (--sans-telechargement) et sans son (--muet, et aucun mp3).
 */

const SRC = join(import.meta.dir, "..", "src");
let essai = "";
let claude = "";
let donnees = "";

/** Un settings.json écrit à sa façon (sur une ligne, sans retour final) : il doit revenir à l'identique. */
const SETTINGS_ORIGINAL =
	'{"permissions":{"allow":["Edit"]},"hooks":{"Stop":[{"hooks":[{"type":"command","command":"afplay /System/Library/Sounds/Glass.aiff"}]}]},"statusLine":{"type":"command","command":"bun statusline.ts"}}';
const CLAUDE_MD_ORIGINAL = "# Mes règles\n\nRéponds en français.\n";

async function lancer(args: string[], entree = "") {
	const p = Bun.spawn([process.execPath, ...args], {
		env: {
			...process.env,
			CLAUDE_CONFIG_DIR: claude,
			SONS_WARCRAFT_DONNEES: donnees,
		},
		stdin: new Blob([entree]),
		stdout: "pipe",
		stderr: "pipe",
	});
	const [sortie, erreurs] = await Promise.all([
		new Response(p.stdout).text(),
		new Response(p.stderr).text(),
	]);
	return { code: await p.exited, sortie, erreurs };
}

const cli = (...args: string[]) => lancer([join(SRC, "cli.ts"), ...args]);
const hook = (moment: string, entree: object) =>
	lancer([join(SRC, "hook.ts"), moment], JSON.stringify(entree));
const texte = (fichier: string) => Bun.file(join(claude, fichier)).text();
const journal = () => Bun.file(join(donnees, "journal.log")).text();
const sauvegardes = async () =>
	(await readdir(claude)).filter((f) => f.includes(".avant-sons-warcraft-"));

beforeAll(async () => {
	essai = await mkdtemp(join(tmpdir(), "sons-warcraft-essai-"));
	claude = join(essai, "claude");
	donnees = join(essai, "donnees");
	await Bun.write(join(claude, "settings.json"), SETTINGS_ORIGINAL);
	await Bun.write(join(claude, "CLAUDE.md"), CLAUDE_MD_ORIGINAL);
	await Bun.write(
		join(donnees, "catalogue.json"),
		JSON.stringify([
			{
				id: "humain-paysan-oui2",
				race: "humain",
				unite: "Paysan",
				principale: true,
				categorie: "oui",
				texte: "Oui monseigneur !",
				duree: 1,
				evenements: ["envoi"],
			},
		]),
	);
	await Bun.write(join(donnees, "choix.json"), JSON.stringify({ volume: 0 }));
});

afterAll(async () => {
	await rm(essai, { recursive: true, force: true });
});

describe("installer, entendre, désinstaller", () => {
	test("l'installateur branche les hooks, garde les autres et les signale", async () => {
		const r = await cli(
			"installer",
			"--sans-telechargement",
			"--muet",
			"--sans-ouvrir",
		);
		expect(r.code).toBe(0);
		expect(r.sortie).toContain("4 hooks branchés");
		expect(r.sortie).toContain("afplay /System/Library/Sounds/Glass.aiff");
		expect(r.sortie).toContain("memo ajouter");
		const s = JSON.parse(await texte("settings.json"));
		for (const evenement of [
			"SessionStart",
			"UserPromptSubmit",
			"Notification",
			"Stop",
		]) {
			expect(JSON.stringify(s.hooks[evenement])).toContain("hook.ts");
		}
		expect(JSON.stringify(s.hooks.Stop)).toContain("Glass.aiff");
		expect(s.statusLine).toEqual({
			type: "command",
			command: "bun statusline.ts",
		});
		expect(await sauvegardes()).toHaveLength(1);
		expect(await Bun.file(join(donnees, "sons.html")).exists()).toBe(true);
	}, 30_000);

	test("relancé, il ne branche rien en double", async () => {
		const avant = await texte("settings.json");
		const r = await cli(
			"installer",
			"--sans-telechargement",
			"--muet",
			"--sans-ouvrir",
		);
		expect(r.code).toBe(0);
		expect(r.sortie).toContain("déjà branchés");
		expect(await texte("settings.json")).toBe(avant);
		expect(await sauvegardes()).toHaveLength(1);
	}, 30_000);

	test("memo ajouter : le bloc délimité, une seule fois", async () => {
		expect((await cli("memo", "ajouter")).sortie).toContain("Mémo ajouté");
		const une = await texte("CLAUDE.md");
		expect(une.startsWith(CLAUDE_MD_ORIGINAL)).toBe(true);
		expect(une).toContain("<!-- sons-warcraft:debut -->");
		expect(une).toContain("<!-- sons-warcraft:fin -->");
		expect((await cli("memo", "ajouter")).sortie).toContain("déjà là");
		expect(await texte("CLAUDE.md")).toBe(une);
	}, 30_000);

	test("volume à 0 : muet, et le journal le dit", async () => {
		const r = await hook("envoi", {
			session_id: "essai",
			cwd: "/tmp",
			prompt: "bonjour",
		});
		expect(r.code).toBe(0);
		expect(r.sortie).toBe("");
		expect(await journal()).toContain("— muet : volume à 0");
	}, 30_000);

	test("un son absent : le journal dit qu'il n'a pas joué, et pourquoi", async () => {
		await Bun.write(
			join(donnees, "choix.json"),
			JSON.stringify({ volume: 0.3 }),
		);
		const r = await hook("envoi", {
			session_id: "essai",
			cwd: "/tmp",
			prompt: "bonjour",
		});
		expect(r.sortie).toBe("");
		const derniere = (await journal()).trimEnd().split("\n").at(-1) ?? "";
		expect(derniere).toContain(
			"— pas joué : son absent · « Oui monseigneur ! » (Paysan)",
		);
		expect(derniere).toContain("« bonjour »");
	}, 30_000);

	test("un message automatique reste muet", async () => {
		const r = await hook("envoi", {
			session_id: "essai",
			prompt: "<task-notification> <task-id>x</task-id>",
		});
		expect(r.sortie).toBe("");
		expect(await journal()).toContain("muet : message automatique");
	}, 30_000);

	test("le désinstallateur rend settings.json et CLAUDE.md octet pour octet", async () => {
		const r = await cli("desinstaller");
		expect(r.code).toBe(0);
		expect(r.sortie).toContain("4 hooks retirés");
		expect(r.sortie).toContain("revenu tel qu'avant l'installation");
		expect(r.sortie).toContain("Mémo « Sons Warcraft » retiré");
		expect(await texte("settings.json")).toBe(SETTINGS_ORIGINAL);
		expect(await texte("CLAUDE.md")).toBe(CLAUDE_MD_ORIGINAL);
	}, 30_000);
});
