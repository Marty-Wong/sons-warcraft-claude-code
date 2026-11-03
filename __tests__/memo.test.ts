import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	ajouterMemo,
	avecMemo,
	DEBUT,
	FIN,
	memo,
	retirerMemo,
	sansMemo,
} from "../src/memo";

const BLOC = memo("/chemin/du/depot/src/cli.ts");

describe("memo", () => {
	test("délimité, avec le chemin de cli.ts", () => {
		expect(BLOC.startsWith(DEBUT)).toBe(true);
		expect(BLOC.endsWith(FIN)).toBe(true);
		expect(BLOC).toContain('bun "/chemin/du/depot/src/cli.ts" appliquer');
	});
});

describe("avecMemo et sansMemo", () => {
	const texte = "# Mes règles\n\nRéponds en français.\n";

	test("ajouté à la fin après une ligne vide, puis retiré : le texte d'avant, octet pour octet", () => {
		const avec = avecMemo(texte, BLOC);
		expect(avec).toBe(`${texte}\n${BLOC}\n`);
		expect(sansMemo(avec)).toBe(texte);
	});

	test("un fichier vide ou absent : le bloc seul, et rien après le retrait", () => {
		expect(avecMemo("", BLOC)).toBe(`${BLOC}\n`);
		expect(sansMemo(`${BLOC}\n`)).toBe("");
	});

	test("idempotent : ajouté deux fois, il n'y est qu'une fois", () => {
		const une = avecMemo(texte, BLOC);
		expect(avecMemo(une, BLOC)).toBe(une);
	});

	test("un bloc d'un autre dossier est remplacé sur place", () => {
		const ancien = avecMemo(texte, memo("/ancien/src/cli.ts"));
		const nouveau = avecMemo(ancien, BLOC);
		expect(nouveau).toBe(`${texte}\n${BLOC}\n`);
		expect(nouveau).not.toContain("/ancien/");
	});

	test("sans bloc, rien ne change", () => {
		expect(sansMemo(texte)).toBe(texte);
	});

	test("un texte sans retour final en reçoit un", () => {
		expect(sansMemo(avecMemo("Sois bref.", BLOC))).toBe("Sois bref.\n");
	});

	test("un bloc au milieu : le texte autour garde une seule ligne vide", () => {
		const milieu = `Avant.\n\n${BLOC}\n\nAprès.\n`;
		expect(sansMemo(milieu)).toBe("Avant.\n\nAprès.\n");
	});
});

describe("ajouterMemo et retirerMemo", () => {
	let dossier = "";
	beforeAll(async () => {
		dossier = await mkdtemp(join(tmpdir(), "sons-warcraft-memo-"));
	});
	afterAll(async () => {
		await rm(dossier, { recursive: true, force: true });
	});

	test("crée le fichier s'il manque, et le supprime au retrait", async () => {
		const chemin = join(dossier, "neuf", "CLAUDE.md");
		expect(await ajouterMemo(chemin)).toBe("ajoute");
		expect(await ajouterMemo(chemin)).toBe("deja-la");
		expect(await retirerMemo(chemin)).toBe("retire");
		expect(await Bun.file(chemin).exists()).toBe(false);
		expect(await retirerMemo(chemin)).toBe("absent");
	});

	test("un fichier existant revient à l'identique", async () => {
		const chemin = join(dossier, "CLAUDE.md");
		const original = "## Projet\n\n- Tutoiement.\n";
		await Bun.write(chemin, original);
		expect(await ajouterMemo(chemin)).toBe("ajoute");
		expect(await Bun.file(chemin).text()).toContain(DEBUT);
		expect(await retirerMemo(chemin)).toBe("retire");
		expect(await Bun.file(chemin).text()).toBe(original);
	});
});
