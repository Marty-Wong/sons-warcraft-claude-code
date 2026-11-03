import { describe, expect, test } from "bun:test";
import {
	evenementsPour,
	identifiant,
	lireRepliques,
	nettoyer,
} from "../src/recuperer";

/** Extrait réel de « Répliques de Warcraft III/Humain » sur WoWWiki FR (02/11/2026). */
const WIKI = `== Alertes ==
{| class="wikitable"
|
* {{sm2|Warcraft3ClassicHumainAnnonceurBâtimentTerminé.ogg|Travail terminé !}}
* {{sm2|Warcraft3ClassicHumainAnnonceurAttaqué.ogg|Nous sommes attaqué !}}
|}

== Unités ==
=== Chevaucheur de dragon-faucon (beta) ===
Cette unité est une ancienne version du chevaucheur de dragon-faucon.
{{RépliqueBox
|prêt=
* {{sm2|Warcraft3ClassicHumainChevaucheurDeDragonFauconBetaPrêt1.ogg|Gloire aux elfes !}}
}}

=== Paysan ===
{{RépliqueBox
|quoi=
* {{sm2|Warcraft3ClassicHumainPaysanQuoi2.ogg|Qui y a-t-il ?}}
* {{sm2|Warcraft3ClassicHumainPaysanQuoi3.ogg|Encore du travail ?}}
|oui=
* {{sm2|Warcraft3ClassicHumainPaysanOui2.ogg|Oui monseigneur !}}
|énervé=
* {{sm2|Warcraft3ClassicHumainPaysanÉnervé1.ogg|Votre prénom c'est François, c'est juste ?}}
}}
`;

describe("lireRepliques", () => {
	const lignes = lireRepliques(WIKI);

	test("lit les alertes comme des annonces", () => {
		expect(lignes.filter((l) => l.unite === "Annonces")).toHaveLength(2);
	});

	test("rattache chaque réplique à son unité et sa catégorie", () => {
		const oui = lignes.find((l) => l.texte === "Oui monseigneur !");
		expect(oui).toMatchObject({ unite: "Paysan", categorie: "oui" });
	});

	test("passe le texte entre le titre et la boîte de répliques", () => {
		expect(
			lignes.some((l) => l.unite === "Chevaucheur de dragon-faucon (beta)"),
		).toBe(true);
	});
});

describe("identifiant", () => {
	test("nom du fichier en minuscules sans accents", () => {
		expect(identifiant("humain", "Warcraft3ClassicHumainPaysanOui2.ogg")).toBe(
			"humain-paysan-oui2",
		);
		expect(
			identifiant(
				"humain",
				"Warcraft3ClassicHumainAnnonceurBâtimentTerminé.ogg",
			),
		).toBe("humain-annonceur-batiment-termine");
		expect(identifiant("orc", "Warcraft3ClassicOrcPéonÉnervé1.ogg")).toBe(
			"orc-peon-enerve1",
		);
	});
});

describe("nettoyer", () => {
	test("corrige les fautes connues du wiki", () => {
		expect(nettoyer("Qui y a-t-il ?")).toBe("Qu'y a-t-il ?");
		expect(nettoyer("Nous sommes attaqué !")).toBe("Nous sommes attaqués !");
	});

	test("retire les notes de référence et met des points de suspension", () => {
		expect(nettoyer("Du travail, encore du travail ...")).toBe(
			"Du travail, encore du travail…",
		);
		expect(nettoyer("Vous avez lu Clausewitz ? (Référence aux généraux)")).toBe(
			"Vous avez lu Clausewitz ?",
		);
	});
});

describe("evenementsPour", () => {
	test("l'ordre reçu à l'envoi, la question à l'attente", () => {
		expect(evenementsPour("oui", "Paysan", "Oui monseigneur !")).toEqual([
			"envoi",
		]);
		expect(evenementsPour("quoi", "Paysan", "Oui messire ?")).toEqual([
			"attente",
		]);
	});

	test("« Encore du travail ? » vaut aussi pour l'envoi", () => {
		expect(evenementsPour("quoi", "Paysan", "Encore du travail ?")).toEqual([
			"envoi",
			"attente",
		]);
	});

	test("les fins de construction et de recherche à la fin", () => {
		expect(evenementsPour("alerte", "Annonces", "Travail terminé !")).toEqual([
			"fini",
		]);
		expect(
			evenementsPour("alerte", "Annonces", "L'invocation est accomplie."),
		).toEqual(["fini"]);
	});

	test("« Prêt à travailler ! » partout où l'unité attend un ordre", () => {
		expect(evenementsPour("prêt", "Paysan", "Prêt à travailler !")).toEqual([
			"attente",
			"fini",
			"debut",
		]);
	});

	test("les répliques énervées quand tu insistes", () => {
		expect(
			evenementsPour(
				"énervé",
				"Paysan",
				"Votre prénom c'est François, c'est juste ?",
			),
		).toEqual(["insiste"]);
	});

	test("pas les alertes des alliés", () => {
		expect(
			evenementsPour("alerte", "Annonces", "Notre allié est attaqué !"),
		).toEqual([]);
	});
});
