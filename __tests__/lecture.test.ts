import { describe, expect, test } from "bun:test";
import { jouer } from "../src/lecture";

describe("jouer", () => {
	test("volume à 0 : rien ne joue, et la raison est donnée", async () => {
		expect(await jouer("humain-paysan-pret1", 0)).toBe("volume à 0");
	});

	test("un son qui n'existe pas : la raison est donnée", async () => {
		expect(await jouer("inexistant-pour-le-test", 0.5)).toBe("son absent");
	});
});
