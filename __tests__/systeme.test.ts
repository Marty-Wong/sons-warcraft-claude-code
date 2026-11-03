import { describe, expect, test } from "bun:test";
import {
	commandeDeLecture,
	commandeDOuverture,
	verifierPrerequis,
	versionSuffisante,
} from "../src/systeme";

/** Un PATH imaginaire : seulement les programmes donnés. */
const avec =
	(...programmes: string[]) =>
	(nom: string) =>
		programmes.includes(nom) ? `/usr/bin/${nom}` : null;

describe("commandeDeLecture", () => {
	test("macOS : afplay, volume linéaire tel quel", () => {
		expect(
			commandeDeLecture("a.mp3", 0.15, "darwin", avec("afplay", "ffplay")),
		).toEqual(["/usr/bin/afplay", "-v", "0.15", "a.mp3"]);
	});

	test("Linux : ffplay, volume en pourcentage, sans fenêtre", () => {
		expect(
			commandeDeLecture("a.mp3", 0.15, "linux", avec("afplay", "ffplay")),
		).toEqual([
			"/usr/bin/ffplay",
			"-nodisp",
			"-autoexit",
			"-loglevel",
			"quiet",
			"-volume",
			"15",
			"a.mp3",
		]);
	});

	test("sinon mpg123", () => {
		expect(commandeDeLecture("a.mp3", 0.5, "linux", avec("mpg123"))).toEqual([
			"/usr/bin/mpg123",
			"-q",
			"-f",
			"16384",
			"a.mp3",
		]);
	});

	test("le volume reste entre 0 et 1", () => {
		expect(commandeDeLecture("a.mp3", 3, "darwin", avec("afplay"))?.[2]).toBe(
			"1",
		);
	});

	test("aucun lecteur : rien", () => {
		expect(commandeDeLecture("a.mp3", 0.1, "linux", avec())).toBeUndefined();
	});
});

describe("commandeDOuverture", () => {
	test("selon le système", () => {
		expect(commandeDOuverture("/p.html", "darwin")).toEqual([
			"open",
			"/p.html",
		]);
		expect(commandeDOuverture("C:/p.html", "win32")).toEqual([
			"cmd",
			"/c",
			"start",
			"",
			"C:/p.html",
		]);
		expect(commandeDOuverture("/p.html", "linux")).toEqual([
			"xdg-open",
			"/p.html",
		]);
	});
});

describe("prérequis", () => {
	test("versionSuffisante", () => {
		expect(versionSuffisante("1.3.10")).toBe(true);
		expect(versionSuffisante("1.1.0")).toBe(true);
		expect(versionSuffisante("1.0.36")).toBe(false);
		expect(versionSuffisante("2.0.0")).toBe(true);
	});

	test("tout est là : rien ne manque", () => {
		expect(
			verifierPrerequis({
				telechargement: true,
				plateforme: "darwin",
				trouver: avec("afplay", "ffmpeg", "ffprobe"),
				versionBun: "1.3.10",
			}),
		).toEqual([]);
	});

	test("ffmpeg manque : la commande pour l'installer selon le système", () => {
		const mac = verifierPrerequis({
			telechargement: true,
			plateforme: "darwin",
			trouver: avec("afplay"),
			versionBun: "1.3.10",
		});
		expect(mac.map((m) => m.commande)).toEqual(["brew install ffmpeg"]);
		const linux = verifierPrerequis({
			telechargement: true,
			plateforme: "linux",
			trouver: avec("mpg123", "ffmpeg"),
			versionBun: "1.3.10",
		});
		expect(linux[0].commande).toStartWith("sudo apt install ffmpeg");
	});

	test("sans téléchargement, ffmpeg n'est pas demandé, mais un lecteur si", () => {
		expect(
			verifierPrerequis({
				telechargement: false,
				plateforme: "linux",
				trouver: avec(),
				versionBun: "1.3.10",
			}).map((m) => m.outil),
		).toEqual(["un lecteur de sons (afplay, ffplay ou mpg123)"]);
	});

	test("un Bun trop ancien", () => {
		expect(
			verifierPrerequis({
				telechargement: false,
				plateforme: "darwin",
				trouver: avec("afplay"),
				versionBun: "1.0.2",
			})[0].outil,
		).toBe("Bun 1.1 ou plus récent");
	});
});
