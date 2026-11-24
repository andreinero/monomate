# MonoMate history

How MonoMate was built, day by day. Saved versions on GitHub start on 24 November 2026; everything
before that is written down here from the work log, because no copies of the older code were kept.

## 24 November 2026
- **Website:** the whole game now runs in the browser at https://monomate.pages.dev, free on Cloudflare
  Pages. On iPhone, "Add to Home Screen" gives it an app icon and full screen.
- Web fixes: fonts were missing on the website; text fields pushed buttons off the screen in browsers.
- Project saved to GitHub, with this history.

## 23 November 2026
- **Chess clock** for games on a real board: tap your half after your move, time controls from
  1 to 60 minutes with increment, pause, reset, screen stays on, buzz when time runs out.
- Game review scoring tuned to match other chess sites more closely: rating-aware win chances,
  new accuracy formula, better detection of missed wins ("Miss").

## 21–22 November 2026
- Faster coach games on iPhone: after a good move the coach no longer holds up the bot.
- Reported: the German coach calls every piece "Springer". Not reproduced yet (see Open issues).

## 20 November 2026
- Bot strength fix after a bot played far above its rating.
- Rougher German roast lines.

## 19 November 2026
- **German language:** all screens, coach texts and recorded voice lines.

## 18 November 2026
- **Windows version** (installer), shown in a phone-shaped window.
- **Chess.com games:** link your chess.com username and review your games in MonoMate.
- **Online play fixes:** room for chat text, clear message for a Lichess ban or cooldown.
- **Focus mode:** hides the opponent's name, picture and rating in online games.
- **Friends list** synced with Lichess, with challenges sent from MonoMate.
- Game analysis and coach brought closer to how strong chess sites judge moves.
- Coach no longer blames you for the opponent's mistakes; it says what *they* should have played.
- Faster review loading; coach and bot no longer talk or move over each other.
- Fixed dragging pieces highlighting the whole board on Windows. Whiskas the cat got stronger.

## 17 November 2026
- Whiskas says philosophical lines.
- Roast mode made much harsher; the coach screams on blunders. Shorter coach lines.
- Speed fixes on real phones; fixed a bot repeating its line and an Android sound bug.

## 16 November 2026
- **Name: MonoMate.**
- **Rating system:** pick your starting rating once; after that it only changes with rated games.
- **Online play through Lichess:** log in, play rated games, one combined account view.
- **Profile picture:** choose your own photo, with MonoMate's own picker screen.
- **Game review:** board-scan animation while analysing, coach explains each mistake,
  inaccuracy and blunder, and what would have been better.
- **Roast mode** for the coach, with many funny lines.
- **Whiskas, the cat bot:** shows a rating of 1 but plays like a grandmaster.
- Last-move arrows and black hint arrows in the app's style; bigger board.
- Deeper, more pleasant wooden move sounds; coach voice fixes (pauses, not cutting off, no overlap).
- Smarter low-rated bots (they now take a free queen).

## 15 November 2026
- **First version:** iPhone and Android app with a chess board, bots with personalities and
  the Stockfish engine, and a coach.
- Minimal black-and-white brutalist design with move animations.
- 10-minute game clock and move sounds.
- Human-sounding recorded voices for the coach and bots instead of robot speech.

## Open issues
- German coach reportedly says "Springer" for every piece (spoken and written). Needs an example
  screenshot or sentence to reproduce.
