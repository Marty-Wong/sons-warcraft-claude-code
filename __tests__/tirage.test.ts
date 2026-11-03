import { describe, expect, test } from "bun:test";
import { tirer } from "../src/tirage";

describe("tirer", () => {
	test("jamais deux fois de suite la même quand il y a le choix", () => {
		for (const alea of [0, 0.49, 0.5, 0.99]) {
			expect(tirer(["a", "b"], "a", () => alea)).toBe("b");
		}
	});

	test("avec trois répliques, tire parmi les deux autres", () => {
		expect(tirer(["a", "b", "c"], "b", () => 0)).toBe("a");
		expect(tirer(["a", "b", "c"], "b", () => 0.99)).toBe("c");
	});

	test("une seule réplique : on la rejoue", () => {
		expect(tirer(["a"], "a")).toBe("a");
	});

	test("rien de choisi : silence", () => {
		expect(tirer([], undefined)).toBeUndefined();
	});
});
