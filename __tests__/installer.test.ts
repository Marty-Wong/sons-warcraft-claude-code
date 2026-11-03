import { describe, expect, test } from "bun:test";
import {
	brancher,
	canonique,
	commandeDuHook,
	debrancher,
	estNotre,
	indentationDe,
	inventaire,
	type Reglages,
	rangDeSauvegarde,
	texteSiIdentique,
} from "../src/installer";

const BUN = "/opt/homebrew/bin/bun";
const HOOK = "/Users/ami/.claude/sons-warcraft/src/hook.ts";

/** Un settings.json d'utilisateur : d'autres réglages, un son de fin à lui, un hook à lui. */
const ORIGINAL: Reglages = {
	permissions: { allow: ["Edit"] },
	hooks: {
		PreToolUse: [
			{ matcher: "Bash", hooks: [{ type: "command", command: "garde.sh" }] },
		],
		Stop: [
			{
				hooks: [
					{
						type: "command",
						command: "afplay /System/Library/Sounds/Glass.aiff",
					},
				],
			},
		],
	},
	statusLine: { type: "command", command: "bun statusline.ts" },
};

const commandes = (r: Reglages, evenement: string) =>
	(r.hooks?.[evenement] ?? []).flatMap((g) =>
		(g.hooks ?? []).map((h) => h.command),
	);

describe("brancher", () => {
	test("branche les 4 moments en async, SessionStart seulement au démarrage", () => {
		const { reglages, inchange } = brancher({}, BUN, HOOK);
		expect(inchange).toBe(false);
		expect(reglages.hooks?.SessionStart).toEqual([
			{
				matcher: "startup",
				hooks: [
					{
						type: "command",
						command: `"${BUN}" "${HOOK}" debut`,
						async: true,
					},
				],
			},
		]);
		expect(commandes(reglages, "UserPromptSubmit")).toEqual([
			`"${BUN}" "${HOOK}" envoi`,
		]);
		expect(commandes(reglages, "Notification")).toEqual([
			`"${BUN}" "${HOOK}" attente`,
		]);
		expect(commandes(reglages, "Stop")).toEqual([`"${BUN}" "${HOOK}" fini`]);
		expect(reglages.hooks?.Stop?.[0].hooks?.[0].async).toBe(true);
		expect("matcher" in (reglages.hooks?.Stop?.[0] ?? {})).toBe(false);
	});

	test("garde les autres réglages et les autres hooks à leur place", () => {
		const { reglages } = brancher(ORIGINAL, BUN, HOOK);
		expect(reglages.permissions).toEqual(ORIGINAL.permissions);
		expect(reglages.statusLine).toEqual(ORIGINAL.statusLine);
		expect(reglages.hooks?.PreToolUse).toEqual(ORIGINAL.hooks?.PreToolUse);
		expect(commandes(reglages, "Stop")).toEqual([
			"afplay /System/Library/Sounds/Glass.aiff",
			`"${BUN}" "${HOOK}" fini`,
		]);
	});

	test("ne touche pas aux réglages reçus", () => {
		const copie = structuredClone(ORIGINAL);
		brancher(ORIGINAL, BUN, HOOK);
		expect(ORIGINAL).toEqual(copie);
	});

	test("idempotent : rebrancher ne change rien", () => {
		const une = brancher(ORIGINAL, BUN, HOOK).reglages;
		const deux = brancher(une, BUN, HOOK);
		expect(deux.inchange).toBe(true);
		expect(deux.reglages).toEqual(une);
	});

	test("met à jour une commande dont bun a changé de place, sans doublon", () => {
		const avant = brancher(ORIGINAL, "/usr/local/bin/bun", HOOK).reglages;
		const { reglages, inchange } = brancher(avant, BUN, HOOK);
		expect(inchange).toBe(false);
		expect(commandes(reglages, "Stop")).toEqual([
			"afplay /System/Library/Sounds/Glass.aiff",
			`"${BUN}" "${HOOK}" fini`,
		]);
		expect(inventaire(reglages, HOOK).notres).toHaveLength(4);
	});

	test("une autre installation : refus sans --remplacer, remplacée avec", () => {
		const autre = brancher(
			ORIGINAL,
			BUN,
			"/Users/ami/anciens/sons/src/hook.ts",
		).reglages;
		const refus = brancher(autre, BUN, HOOK);
		expect(refus.refuse).toBe(true);
		expect(refus.reglages).toBe(autre);
		expect(refus.autresInstallations).toHaveLength(4);

		const remplace = brancher(autre, BUN, HOOK, true);
		expect(remplace.refuse).toBe(false);
		expect(inventaire(remplace.reglages, HOOK).notres).toHaveLength(4);
		expect(
			inventaire(remplace.reglages, HOOK).autresInstallations,
		).toHaveLength(0);
		expect(commandes(remplace.reglages, "Stop")).toContain(
			"afplay /System/Library/Sounds/Glass.aiff",
		);
	});

	test("liste les autres hooks qui jouent un son, sans y toucher", () => {
		const avecSons: Reglages = {
			hooks: {
				...ORIGINAL.hooks,
				Notification: [
					{
						hooks: [
							{ type: "command", command: "say 'Claude a besoin de toi'" },
							{ type: "command", command: "paplay ~/sons/ding.wav" },
							{ type: "command", command: "echo display > /tmp/x" },
						],
					},
				],
			},
		};
		const { autresSons, reglages } = brancher(avecSons, BUN, HOOK);
		expect(autresSons.map((s) => s.commande)).toEqual([
			"afplay /System/Library/Sounds/Glass.aiff",
			"say 'Claude a besoin de toi'",
			"paplay ~/sons/ding.wav",
		]);
		expect(commandes(reglages, "Notification")).toHaveLength(4);
	});
});

describe("debrancher", () => {
	test("ne retire que les nôtres : on retrouve les réglages d'avant", () => {
		const branche = brancher(ORIGINAL, BUN, HOOK).reglages;
		const { reglages, retires } = debrancher(branche, HOOK);
		expect(retires).toBe(4);
		expect(reglages).toEqual(ORIGINAL);
	});

	test("sur des réglages sans hooks, on retrouve des réglages sans hooks", () => {
		const branche = brancher({ model: "opus" }, BUN, HOOK).reglages;
		expect(debrancher(branche, HOOK).reglages).toEqual({ model: "opus" });
	});

	test("rien de nous : rien ne change", () => {
		const { reglages, retires } = debrancher(ORIGINAL, HOOK);
		expect(retires).toBe(0);
		expect(reglages).toBe(ORIGINAL);
	});

	test("laisse une autre installation en place", () => {
		const autre = brancher(
			ORIGINAL,
			BUN,
			"/Users/ami/anciens/sons/src/hook.ts",
		).reglages;
		expect(debrancher(autre, HOOK).retires).toBe(0);
	});
});

describe("reconnaître nos hooks", () => {
	test("les chemins sont entre guillemets", () => {
		expect(commandeDuHook("/a b/bun", "/c d/src/hook.ts", "fini")).toBe(
			'"/a b/bun" "/c d/src/hook.ts" fini',
		);
	});

	test("le nôtre, avec ou sans guillemets", () => {
		expect(estNotre(`"${BUN}" "${HOOK}" fini`, HOOK)).toBe(true);
		expect(estNotre(`bun ${HOOK} envoi`, HOOK)).toBe(true);
	});

	test("pas un autre dossier dont le chemin finit pareil", () => {
		expect(estNotre(`bun /x${HOOK} fini`, HOOK)).toBe(false);
		expect(
			estNotre(
				`bun ${HOOK.replace("sons-warcraft", "sons-warcraft-2")} fini`,
				HOOK,
			),
		).toBe(false);
	});
});

describe("indentationDe", () => {
	test("garde le style du fichier d'origine", () => {
		expect(indentationDe('{\n\t"a": 1\n}')).toBe("\t");
		expect(indentationDe('{\n    "a": 1\n}')).toBe(4);
		expect(indentationDe('{"a":1}')).toBe(2);
	});
});

describe("revenir au settings.json d'avant, octet pour octet", () => {
	test("canonique : l'ordre des clés ne compte pas, celui des listes si", () => {
		expect(canonique({ b: 1, a: { d: 2, c: 3 } })).toBe(
			canonique({ a: { c: 3, d: 2 }, b: 1 }),
		);
		expect(canonique({ a: [1, 2] })).not.toBe(canonique({ a: [2, 1] }));
	});

	test("même contenu : le texte exact de la sauvegarde", () => {
		const sauvegarde =
			'{"statusLine":{"command":"x"},"permissions":{"allow":["Edit"]}}';
		expect(
			texteSiIdentique(
				{ permissions: { allow: ["Edit"] }, statusLine: { command: "x" } },
				sauvegarde,
			),
		).toBe(sauvegarde);
	});

	test("un réglage ajouté depuis l'installation : pas de retour en arrière", () => {
		expect(
			texteSiIdentique({ model: "opus" }, '{"permissions":{}}'),
		).toBeUndefined();
	});

	test("une sauvegarde illisible n'est pas reprise", () => {
		expect(texteSiIdentique({}, "{pas du json")).toBeUndefined();
	});

	test("le rang d'une sauvegarde : la date, puis le numéro du jour", () => {
		expect(
			rangDeSauvegarde("settings.json.avant-sons-warcraft-2026-11-03"),
		).toEqual(["2026-11-03", 1]);
		expect(
			rangDeSauvegarde("settings.json.avant-sons-warcraft-2026-11-03-12"),
		).toEqual(["2026-11-03", 12]);
		expect(
			rangDeSauvegarde(
				"settings.json.avant-desinstallation-sons-warcraft-2026-11-03",
			),
		).toBeUndefined();
	});
});
