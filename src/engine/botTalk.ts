import type { Move } from 'chess.js';
import { DRAW_LINE, type Bot, type BotTalkKind } from './bots';
import { nextIndex } from './coaches';
import { voiceText } from '../lib/i18n';

/** The original single line for each kind (its voice key ends in `-0`, as before). */
const BASE: Partial<Record<BotTalkKind, { field: string; text: (b: Bot) => string }>> = {
  greeting: { field: 'greeting', text: (b) => b.greeting },
  win: { field: 'onWin', text: (b) => b.onWin },
  lose: { field: 'onLose', text: (b) => b.onLose },
  draw: { field: 'draw', text: () => DRAW_LINE },
};

/** Every line a bot can say for one kind, with its voice key. */
function pool(bot: Bot, kind: BotTalkKind): { text: string; voice: string }[] {
  const base = BASE[kind];
  const out = base ? [{ text: base.text(bot), voice: `${bot.id}-${base.field}-0` }] : [];
  (bot.talk?.[kind] ?? []).forEach((text, i) => out.push({ text, voice: `${bot.id}-talk.${kind}-${i}` }));
  return out;
}

/** A line for this moment — never the same one twice in a row, and all of them before any repeats. */
export function botSays(bot: Bot, kind: BotTalkKind): { text: string; voice: string } | null {
  const all = pool(bot, kind);
  if (!all.length) return null;
  const l = all[nextIndex(`bot:${bot.id}:${kind}`, all.length)];
  return { text: voiceText(l.voice, l.text), voice: l.voice };
}

/**
 * Should a chatty bot say something after its move? Reacts to checks and captures,
 * and now and then just muses — but never more often than every other move.
 */
export function botReaction(bot: Bot, mv: Move, playerMove: Move | undefined, movesSinceTalk: number): BotTalkKind | null {
  if (!bot.talk || movesSinceTalk < 2) return null;
  const piece = (p?: string) => !!p && p !== 'p';
  if (mv.san.includes('+') && Math.random() < 0.5) return 'check';
  if (piece(mv.captured) && Math.random() < 0.6) return 'capture';
  if (piece(playerMove?.captured) && Math.random() < 0.5) return 'hurt';
  if (movesSinceTalk >= 4 && Math.random() < 0.35) return 'move';
  return null;
}

/** Every recordable bot line, for scripts/export-voice-lines.ts. */
export function allBotVoiceLines(bots: Bot[]): { key: string; who: string; text: string }[] {
  const kinds: BotTalkKind[] = ['greeting', 'win', 'lose', 'draw', 'move', 'capture', 'check', 'hurt'];
  return bots.flatMap((b) => kinds.flatMap((k) => pool(b, k).map((l) => ({ key: l.voice, who: b.id, text: l.text }))));
}
