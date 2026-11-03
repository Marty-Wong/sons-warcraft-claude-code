import { describe, expect, test } from "bun:test";
import { lireTexteColle } from "../src/coller";
import { CHOIX_PAR_DEFAUT } from "../src/config";

const CONNUS = new Set([
	"humain-paysan-oui2",
	"orc-peon-quoi4",
	"orc-annonceur-batiment-termine",
]);
const MAINTENANT = new Date("2026-11-02T10:00:00Z");

/** Texte tel que le copie la page d'écoute. */
const COLLE = `Sons Warcraft : mon choix
• Quand j'envoie un message : « Oui monseigneur ! » (Paysan)
• Quand Claude m'attend : « Que dois-je faire ? » (Péon)
• Quand Claude a fini : rien (silence)
• Volume : 20 %
#sons-warcraft {"volume":0.2,"envoi":["humain-paysan-oui2"],"attente":["orc-peon-quoi4","inconnu"],"fini":[]}
(Pour Claude : bun "/chemin/du/depot/src/cli.ts" appliquer, avec ce texte sur l'entrée standard.)`;

describe("lireTexteColle", () => {
	test("reprend le choix de la ligne #sons-warcraft", () => {
		const choix = lireTexteColle(COLLE, CONNUS, CHOIX_PAR_DEFAUT, MAINTENANT);
		expect(choix.envoi).toEqual(["humain-paysan-oui2"]);
		expect(choix.volume).toBe(0.2);
		expect(choix.maj).toBe("2026-11-02T10:00:00.000Z");
	});

	test("écarte les répliques inconnues", () => {
		const choix = lireTexteColle(COLLE, CONNUS, CHOIX_PAR_DEFAUT, MAINTENANT);
		expect(choix.attente).toEqual(["orc-peon-quoi4"]);
	});

	test("un moment vidé reste silencieux", () => {
		expect(
			lireTexteColle(COLLE, CONNUS, CHOIX_PAR_DEFAUT, MAINTENANT).fini,
		).toEqual([]);
	});

	test("supporte le texte recollé avec une indentation", () => {
		const indente = COLLE.split("\n")
			.map((l) => `  ${l}`)
			.join("\n");
		expect(lireTexteColle(indente, CONNUS, CHOIX_PAR_DEFAUT).envoi).toEqual([
			"humain-paysan-oui2",
		]);
	});

	test("borne le volume", () => {
		const fort = COLLE.replace('"volume":0.2', '"volume":7');
		expect(lireTexteColle(fort, CONNUS, CHOIX_PAR_DEFAUT).volume).toBe(1);
	});

	test("volume à 0 : muet, et pas en dessous", () => {
		const muet = COLLE.replace('"volume":0.2', '"volume":0');
		expect(lireTexteColle(muet, CONNUS, CHOIX_PAR_DEFAUT).volume).toBe(0);
		const negatif = COLLE.replace('"volume":0.2', '"volume":-1');
		expect(lireTexteColle(negatif, CONNUS, CHOIX_PAR_DEFAUT).volume).toBe(0);
	});

	test("refuse un texte sans la ligne #sons-warcraft", () => {
		expect(() =>
			lireTexteColle("Oui monseigneur !", CONNUS, CHOIX_PAR_DEFAUT),
		).toThrow("#sons-warcraft");
	});
});

describe("règles", () => {
	test("reprend les deux règles cochées ou décochées sur la page", () => {
		const regles = COLLE.replace(
			'"volume":0.2',
			'"volume":0.2,"raceParSession":true,"finSelonTravail":false',
		);
		const choix = lireTexteColle(regles, CONNUS, CHOIX_PAR_DEFAUT);
		expect(choix.raceParSession).toBe(true);
		expect(choix.finSelonTravail).toBe(false);
	});

	test("un ancien texte sans règles garde les règles actuelles", () => {
		const choix = lireTexteColle(COLLE, CONNUS, CHOIX_PAR_DEFAUT);
		expect(choix.raceParSession).toBe(CHOIX_PAR_DEFAUT.raceParSession);
	});

	test("reprend la fréquence de chaque race, et ignore les valeurs inconnues", () => {
		const freq = COLLE.replace(
			'"volume":0.2',
			'"volume":0.2,"frequences":{"elfe":"jamais","mortvivant":"rarement","orc":"toujours"}',
		);
		const choix = lireTexteColle(freq, CONNUS, CHOIX_PAR_DEFAUT);
		expect(choix.frequences.elfe).toBe("jamais");
		expect(choix.frequences.mortvivant).toBe("rarement");
		expect(choix.frequences.orc).toBe(CHOIX_PAR_DEFAUT.frequences.orc);
	});
});

describe("étoiles", () => {
	test("une étoile n'existe que sur une réplique gardée", () => {
		const etoiles = COLLE.replace(
			'"fini":[]',
			'"fini":["orc-annonceur-batiment-termine"],"etoiles":{"fini":["orc-annonceur-batiment-termine","humain-paysan-oui2"],"attente":[]}',
		);
		const choix = lireTexteColle(etoiles, CONNUS, CHOIX_PAR_DEFAUT);
		expect(choix.etoiles.fini).toEqual(["orc-annonceur-batiment-termine"]);
		expect(choix.etoiles.attente).toEqual([]);
	});
});
