import { lireTexteColle } from "./coller";
import {
	AVEC_ETOILES,
	type AvecEtoiles,
	chargerCatalogue,
	chargerChoix,
	EVENEMENTS,
	type Evenement,
	enregistrerChoix,
	JOURNAL,
	NOMS_DES_RACES,
	nomUnite,
	PAGE,
	RACES,
} from "./config";
import { desinstaller, installer } from "./installer";
import { jouer } from "./lecture";
import { ajouterMemo, cheminDuMemo, memo, retirerMemo } from "./memo";
import { genererPage } from "./page";
import { ouvrir } from "./systeme";

const AIDE = `Sons Warcraft pour Claude Code

  bun run installer              télécharge les répliques, branche les hooks, ouvre la page
      --sans-ouvrir --muet --remplacer --sans-telechargement
  bun run desinstaller           débranche les hooks et retire le mémo (le dossier reste)
  bun run page                   refait la page d'écoute et l'ouvre (--sans-ouvrir)
  bun run appliquer < texte      applique le texte copié sur la page (« Copier mon choix »)
  bun run ecouter fini           joue les répliques d'un moment : ${EVENEMENTS.join(", ")}
  bun run journal [n]            les n derniers sons, avec leur session et leur raison (30)
  bun run recuperer              retélécharge les répliques qui manquent
  bun src/cli.ts memo            affiche le mémo pour ton CLAUDE.md
  bun src/cli.ts memo ajouter    l'ajoute à ton CLAUDE.md (ou le met à jour)
  bun src/cli.ts memo retirer    l'enlève
`;

/** 0 = muet. */
const enMots = (volume: number) =>
	volume > 0 ? `${Math.round(volume * 100)} %` : "muet";

const PAS_ENCORE =
	"Aucune réplique téléchargée pour l'instant : lance d'abord bun run installer.";

async function page(ouvrirLaPage: boolean): Promise<number> {
	const [catalogue, choix] = await Promise.all([
		chargerCatalogue(),
		chargerChoix(),
	]);
	if (!catalogue.length) console.warn(PAS_ENCORE);
	await Bun.write(PAGE, genererPage(catalogue, choix));
	if (ouvrirLaPage) await ouvrir(PAGE);
	console.log(PAGE);
	return 0;
}

async function appliquer(texte: string): Promise<number> {
	const catalogue = await chargerCatalogue();
	if (!catalogue.length) {
		// Sans catalogue, toutes les répliques sembleraient inconnues et le choix serait vidé.
		console.error(PAS_ENCORE);
		return 1;
	}
	const connus = new Set(catalogue.map((r) => r.id));
	const choix = lireTexteColle(texte, connus, await chargerChoix());
	await enregistrerChoix(choix);
	await Bun.write(PAGE, genererPage(catalogue, choix));

	const textes = new Map(
		catalogue.map((r) => [r.id, `${r.texte} (${nomUnite(r)})`]),
	);
	for (const e of EVENEMENTS) {
		const avecEtoiles = (AVEC_ETOILES as readonly string[]).includes(e);
		const etoiles = new Set(avecEtoiles ? choix.etoiles[e as AvecEtoiles] : []);
		// ★ voix principale, ♥ voix secondaire, pour l'attente et la fin.
		const marque = (id: string) =>
			avecEtoiles ? (etoiles.has(id) ? "★ " : "♥ ") : "";
		const liste = choix[e]
			.map((id) => `${marque(id)}${textes.get(id)}`)
			.join(" · ");
		console.log(`${e.padEnd(8)}: ${liste || "(silence)"}`);
	}
	const oui = (b: boolean) => (b ? "oui" : "non");
	const frequences = RACES.map(
		(race) => `${NOMS_DES_RACES[race]} ${choix.frequences[race]}`,
	).join(", ");
	console.log(
		`races   : ${choix.raceParSession ? "une race par session" : "toutes les races, au hasard"} (${frequences})`,
	);
	console.log(`fin     : suit le travail ${oui(choix.finSelonTravail)}`);
	console.log(`volume  : ${enMots(choix.volume)}`);
	return 0;
}

async function ecouter(evenement: Evenement): Promise<number> {
	const choix = await chargerChoix();
	for (const id of choix[evenement]) {
		const pasJoue = await jouer(id, choix.volume);
		if (pasJoue) console.log(`${id} : pas joué, ${pasJoue}`);
		await Bun.sleep(300);
	}
	return 0;
}

async function journal(n: number): Promise<number> {
	const texte = await Bun.file(JOURNAL)
		.text()
		.catch(() => "");
	const lignes = texte.trimEnd().split("\n").filter(Boolean);
	console.log(lignes.slice(-n).join("\n") || "(aucun son pour l'instant)");
	return 0;
}

const ETATS_DU_MEMO = {
	ajoute: "✓ Mémo ajouté à",
	"mis-a-jour": "✓ Mémo mis à jour dans",
	"deja-la": "✓ Mémo déjà là dans",
	retire: "✓ Mémo retiré de",
	absent: "Pas de mémo dans",
} as const;

/** memo : l'affiche ; memo ajouter / memo retirer : dans le CLAUDE.md de l'utilisateur. */
async function gererMemo(action: string | undefined): Promise<number> {
	if (!action) {
		console.log(memo());
		return 0;
	}
	if (action !== "ajouter" && action !== "retirer") {
		console.error(`memo : « ajouter » ou « retirer », pas « ${action} »`);
		return 1;
	}
	const etat = action === "ajouter" ? await ajouterMemo() : await retirerMemo();
	console.log(`${ETATS_DU_MEMO[etat]} ${cheminDuMemo()}`);
	return 0;
}

async function main(): Promise<number> {
	const [commande, ...reste] = process.argv.slice(2);
	const option = (nom: string) => reste.includes(nom);

	switch (commande) {
		case "installer":
			return installer({
				telechargement: !option("--sans-telechargement"),
				ouvrir: !option("--sans-ouvrir"),
				muet: option("--muet"),
				remplacer: option("--remplacer"),
			});
		case "desinstaller":
			return desinstaller();
		case "page":
			return page(!option("--sans-ouvrir"));
		case "appliquer":
			return appliquer(reste.length ? reste.join(" ") : await Bun.stdin.text());
		case "ecouter":
			if (!EVENEMENTS.includes(reste[0] as Evenement)) {
				console.error(
					`moment inconnu : ${reste[0] ?? "(rien)"} (${EVENEMENTS.join(", ")})`,
				);
				return 1;
			}
			return ecouter(reste[0] as Evenement);
		case "journal":
			return journal(Number(reste[0]) || 30);
		case "memo":
			return gererMemo(reste[0]);
		default:
			console.log(AIDE);
			return commande ? 1 : 0;
	}
}

process.exit(await main());
