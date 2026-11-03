/**
 * Tire une réplique au hasard parmi celles choisies, jamais deux fois de suite
 * la même quand il y a le choix : avec deux répliques, elles alternent.
 */
export function tirer(
	ids: string[],
	derniere: string | undefined,
	alea: () => number = Math.random,
): string | undefined {
	const possibles = ids.length > 1 ? ids.filter((id) => id !== derniere) : ids;
	return possibles[Math.floor(alea() * possibles.length)];
}
