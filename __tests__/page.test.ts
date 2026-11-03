import { describe, expect, test } from "bun:test";
import { CHOIX_PAR_DEFAUT, CLI, type Replique } from "../src/config";
import { genererPage } from "../src/page";
import { raceDe } from "../src/regles";

const PRET: Replique = {
	id: "humain-paysan-pret1",
	race: "humain",
	unite: "Paysan",
	principale: true,
	categorie: "prêt",
	texte: "Prêt à travailler !",
	duree: 1.2,
	evenements: ["attente", "fini", "debut"],
};

describe("le choix de départ", () => {
	test("la vraie fin (★) est toujours humaine ou orque", () => {
		expect(
			CHOIX_PAR_DEFAUT.etoiles.fini.every((id) =>
				["humain", "orc"].includes(raceDe(id)),
			),
		).toBe(true);
	});

	test("toutes les races au hasard, un léger avantage aux humains et aux orcs", () => {
		expect(CHOIX_PAR_DEFAUT.raceParSession).toBe(false);
		expect(CHOIX_PAR_DEFAUT.frequences).toEqual({
			humain: "souvent",
			orc: "souvent",
			mortvivant: "parfois",
			elfe: "parfois",
		});
	});

	test("chaque étoile est une réplique gardée", () => {
		for (const moment of ["attente", "fini"] as const) {
			for (const id of CHOIX_PAR_DEFAUT.etoiles[moment]) {
				expect(CHOIX_PAR_DEFAUT[moment]).toContain(id);
			}
		}
	});
});

describe("genererPage", () => {
	const page = genererPage([PRET], CHOIX_PAR_DEFAUT);

	test("le choix entre toutes les races et une race par session", () => {
		expect(page).toContain('name="races" value="toutes"');
		expect(page).toContain('name="races" value="session"');
		expect(page).toContain('<option value="rarement">');
	});

	test("le texte copié dit à Claude le vrai chemin de cli.ts", () => {
		expect(page).toContain(JSON.stringify(CLI).slice(1, -1));
	});

	test("le script de la page est du JavaScript valide", () => {
		const script = page.match(/<script>\n([\s\S]*?)<\/script>/)?.[1] ?? "";
		expect(script.length).toBeGreaterThan(1000);
		expect(() => new Function(script)).not.toThrow();
	});

	test("le texte copié met le chemin de cli.ts entre guillemets", () => {
		expect(page).toContain('bun \\"" + DONNEES.cli + "\\" appliquer');
	});

	test("chaque réplique s'écoute depuis sons/", () => {
		expect(page).toContain('data-id="humain-paysan-pret1"');
		expect(page).toContain('"sons/" + id + ".mp3"');
	});
});
