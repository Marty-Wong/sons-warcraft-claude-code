import { describe, expect, test } from "bun:test";
import { CHOIX_PAR_DEFAUT, type Choix } from "../src/config";
import {
	annonceDe,
	choisirRace,
	deLaRace,
	estAutomatique,
	estInsistant,
	racesEnJeu,
	selonImportance,
	selonTravail,
	tirerSelonRaces,
} from "../src/regles";

const SOUVENT_PARFOIS = {
	humain: "souvent",
	orc: "souvent",
	mortvivant: "parfois",
	elfe: "parfois",
} as const;

describe("racesEnJeu", () => {
	/** Un choix sans aucune réplique, pour n'en mettre que quelques-unes. */
	const vide: Choix = {
		...CHOIX_PAR_DEFAUT,
		envoi: [],
		attente: [],
		fini: [],
		insiste: [],
		debut: [],
	};

	test("les races des répliques choisies, dans l'ordre du jeu", () => {
		const choix = {
			...vide,
			envoi: ["orc-peon-oui3", "elfe-archer-oui1"],
			fini: ["humain-annonceur-batiment-termine"],
		};
		expect(racesEnJeu(choix)).toEqual(["humain", "orc", "elfe"]);
	});

	test("une race réglée sur « jamais » n'est pas distribuée", () => {
		const choix: Choix = {
			...vide,
			envoi: ["orc-peon-oui3", "elfe-archer-oui1"],
			fini: ["humain-annonceur-batiment-termine"],
			frequences: { ...SOUVENT_PARFOIS, elfe: "jamais" },
		};
		expect(racesEnJeu(choix)).toEqual(["humain", "orc"]);
	});

	test("aucune réplique : aucune race", () => {
		expect(racesEnJeu(vide)).toEqual([]);
	});
});

describe("choisirRace", () => {
	const enJeu = ["humain", "orc", "mortvivant", "elfe"] as const;

	test("jamais une race qu'une autre session ouverte a déjà, s'il en reste", () => {
		for (const alea of [0, 0.5, 0.99]) {
			expect(
				choisirRace(
					[...enJeu],
					["humain", "orc", "mortvivant"],
					SOUVENT_PARFOIS,
					() => alea,
				),
			).toBe("elfe");
		}
	});

	test("« souvent » pèse 3, « parfois » 2", () => {
		// Poids 3, 3, 2, 2 sur 10 : humain jusqu'à 0,3, orc jusqu'à 0,6, morts-vivants jusqu'à 0,8, puis elfes.
		const tirer = (alea: number) =>
			choisirRace([...enJeu], [], SOUVENT_PARFOIS, () => alea);
		expect(tirer(0.1)).toBe("humain");
		expect(tirer(0.5)).toBe("orc");
		expect(tirer(0.7)).toBe("mortvivant");
		expect(tirer(0.9)).toBe("elfe");
	});

	test("« rarement » pèse 1 : trois fois moins que « souvent »", () => {
		const frequences = { humain: "souvent", elfe: "rarement" } as const;
		const tirer = (alea: number) =>
			choisirRace(["humain", "elfe"], [], frequences, () => alea);
		expect(tirer(0.7)).toBe("humain");
		expect(tirer(0.8)).toBe("elfe");
	});

	test("toutes prises : de nouveau parmi les moins prises", () => {
		expect(
			choisirRace(
				["humain", "orc"],
				["humain", "orc", "orc"],
				SOUVENT_PARFOIS,
				() => 0.9,
			),
		).toBe("humain");
	});

	test("aucune race possible : pas de race", () => {
		expect(choisirRace([], ["humain"], SOUVENT_PARFOIS)).toBeUndefined();
		expect(
			choisirRace(["elfe"], [], { ...SOUVENT_PARFOIS, elfe: "jamais" }),
		).toBeUndefined();
	});
});

describe("tirerSelonRaces (toutes les races, au hasard)", () => {
	const ids = [
		"humain-paysan-oui1",
		"mortvivant-acolyte-oui1",
		"mortvivant-acolyte-oui2",
		"mortvivant-acolyte-oui3",
	];
	const frequences = { humain: "souvent", mortvivant: "parfois" } as const;

	test("une race pèse selon sa fréquence, pas selon son nombre de répliques", () => {
		// Poids 3 et 2 sur 5 : humain jusqu'à 0,6, puis morts-vivants.
		expect(tirerSelonRaces(ids, undefined, frequences, () => 0.5)).toBe(
			"humain-paysan-oui1",
		);
		expect(tirerSelonRaces(ids, undefined, frequences, () => 0.7)).toBe(
			"mortvivant-acolyte-oui3",
		);
	});

	test("un léger avantage : humains et orcs sur « souvent », les autres sur « parfois »", () => {
		const toutes = [
			"humain-paysan-oui1",
			"orc-peon-oui1",
			"mortvivant-acolyte-oui1",
			"elfe-archer-oui1",
		];
		let graine = 42;
		const alea = () => {
			graine = (graine * 1_103_515_245 + 12_345) % 2_147_483_648;
			return graine / 2_147_483_648;
		};
		let humainsEtOrcs = 0;
		let derniere: string | undefined;
		for (let i = 0; i < 10_000; i++) {
			derniere = tirerSelonRaces(toutes, derniere, SOUVENT_PARFOIS, alea);
			if (/^(?:humain|orc)-/.test(derniere ?? "")) humainsEtOrcs++;
		}
		// 3 + 3 sur 10 ≈ 60 %, un peu moins puisque la dernière réplique n'est jamais rejouée.
		expect(humainsEtOrcs / 10_000).toBeGreaterThan(0.5);
		expect(humainsEtOrcs / 10_000).toBeLessThan(0.65);
	});

	test("jamais deux fois de suite la même réplique", () => {
		const deux = ["humain-paysan-oui1", "humain-paysan-oui2"];
		for (const alea of [0, 0.5, 0.99]) {
			expect(
				tirerSelonRaces(deux, "humain-paysan-oui1", frequences, () => alea),
			).toBe("humain-paysan-oui2");
		}
	});

	test("une race sur « jamais » ne parle que si elle est seule", () => {
		const sansElfes = { ...SOUVENT_PARFOIS, elfe: "jamais" } as const;
		for (const alea of [0, 0.5, 0.99]) {
			expect(
				tirerSelonRaces(
					["elfe-archer-oui1", "orc-peon-oui1"],
					undefined,
					sansElfes,
					() => alea,
				),
			).toBe("orc-peon-oui1");
		}
		expect(
			tirerSelonRaces(["elfe-archer-oui1"], undefined, sansElfes, () => 0.5),
		).toBe("elfe-archer-oui1");
	});

	test("rien de choisi : silence", () => {
		expect(tirerSelonRaces([], undefined, frequences)).toBeUndefined();
	});
});

describe("deLaRace", () => {
	const ids = ["humain-paysan-oui2", "orc-peon-oui3", "orc-peon-oui1"];

	test("garde les répliques de la race de la session", () => {
		expect(deLaRace(ids, "orc")).toEqual(["orc-peon-oui3", "orc-peon-oui1"]);
	});

	test("si la race n'a rien pour ce moment, toutes", () => {
		expect(deLaRace(ids, "elfe")).toEqual(ids);
	});

	test("sans race (règle désactivée), toutes", () => {
		expect(deLaRace(ids, undefined)).toEqual(ids);
	});
});

describe("selonImportance", () => {
	const choix: Choix = {
		...CHOIX_PAR_DEFAUT,
		fini: ["humain-annonceur-batiment-termine", "humain-fantassin-pret1"],
		etoiles: { attente: [], fini: ["humain-annonceur-batiment-termine"] },
	};

	test("la vraie fin : les voix principales ★", () => {
		expect(selonImportance(choix, "fini", true)).toEqual([
			"humain-annonceur-batiment-termine",
		]);
	});

	test("un agent qui rend son travail : les voix secondaires ♥", () => {
		expect(selonImportance(choix, "fini", false)).toEqual([
			"humain-fantassin-pret1",
		]);
	});

	test("sans aucune étoile, toutes les répliques gardées font les deux", () => {
		const sansEtoile = { ...choix, etoiles: { attente: [], fini: [] } };
		expect(selonImportance(sansEtoile, "fini", true)).toEqual(choix.fini);
		expect(selonImportance(sansEtoile, "fini", false)).toEqual(choix.fini);
	});

	test("tout en étoiles : un moment secondaire reste muet", () => {
		const toutEtoile = {
			...choix,
			etoiles: { attente: [], fini: [...choix.fini] },
		};
		expect(selonImportance(toutEtoile, "fini", false)).toEqual([]);
	});
});

describe("selonTravail", () => {
	const ids = [
		"humain-annonceur-batiment-termine",
		"humain-annonceur-recherche-terminee",
		"humain-annonceur-amelioration-terminee",
		"humain-paysan-pret1",
	];
	const annonce = (id: string) =>
		annonceDe(id, id.endsWith("pret1") ? "prêt" : "alerte");

	test("chaque travail sa réplique", () => {
		expect(selonTravail(ids, annonce, "recherche")).toEqual([
			"humain-annonceur-recherche-terminee",
		]);
		expect(selonTravail(ids, annonce, "amelioration")).toEqual([
			"humain-annonceur-amelioration-terminee",
		]);
		expect(selonTravail(ids, annonce, "construction")).toEqual([
			"humain-annonceur-batiment-termine",
		]);
		expect(selonTravail(ids, annonce, "rapide")).toEqual([
			"humain-paysan-pret1",
		]);
	});

	test("sans la bonne réplique : « Travail terminé ! », puis n'importe laquelle", () => {
		expect(
			selonTravail(
				["humain-annonceur-batiment-termine", "humain-paysan-pret1"],
				annonce,
				"recherche",
			),
		).toEqual(["humain-annonceur-batiment-termine"]);
		expect(selonTravail(["humain-paysan-pret1"], annonce, "recherche")).toEqual(
			["humain-paysan-pret1"],
		);
	});
});

describe("estInsistant", () => {
	const maintenant = 1_000_000;

	test("3 messages en moins d'une minute", () => {
		expect(
			estInsistant(
				[maintenant - 50_000, maintenant - 20_000, maintenant],
				maintenant,
			),
		).toBe(true);
	});

	test("2 messages seulement : non", () => {
		expect(estInsistant([maintenant - 20_000, maintenant], maintenant)).toBe(
			false,
		);
	});

	test("le premier trop ancien ne compte plus", () => {
		expect(
			estInsistant(
				[maintenant - 90_000, maintenant - 20_000, maintenant],
				maintenant,
			),
		).toBe(false);
	});
});

describe("estAutomatique", () => {
	test("fin de tâche ou d'agent", () => {
		expect(
			estAutomatique("<task-notification> <task-id>bclz5ytgu</task-id>"),
		).toBe(true);
	});

	test("message d'une autre session", () => {
		expect(
			estAutomatique(
				'Another Claude session sent a message: <agent-message from="autre-session">',
			),
		).toBe(true);
	});

	test("boucle planifiée", () => {
		expect(estAutomatique("<<autonomous-loop-dynamic>>")).toBe(true);
	});

	test("un message de toi, même avec une balise dedans", () => {
		expect(estAutomatique("Peux-tu me montrer les autres races ?")).toBe(false);
		expect(estAutomatique("Regarde <task-notification> dans le log")).toBe(
			false,
		);
	});
});
