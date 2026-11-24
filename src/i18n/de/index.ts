import play from './play';
import review from './review';
import menus from './menus';
import engine from './engine';
import guides from './guides';

/** German translations of English UI strings (merged from the per-area files). */
export const DE: Record<string, string> = { ...guides, ...engine, ...menus, ...review, ...play };
