/** German UI strings (engine). Keys are the exact English strings passed to t(). */
const de: Record<string, string> = {
  // --- Move classes (analysis.ts CLASS_META) ---
  Brilliant: 'Brillant',
  Great: 'Großartig',
  Best: 'Bester Zug',
  Excellent: 'Exzellent',
  Good: 'Gut',
  Book: 'Buchzug',
  Forced: 'Erzwungen',
  Inaccuracy: 'Ungenauigkeit',
  Mistake: 'Fehler',
  Miss: 'Verpasst',
  Blunder: 'Patzer',

  // --- What a move does (explainMove.ts; the piece-dependent sentences are built in code) ---
  'Castles kingside: the king gets to safety and the rook joins the game.': 'Kurze Rochade: Der König bringt sich in Sicherheit, und der Turm kommt ins Spiel.',
  'Castles queenside: the king tucks away and the rook lands on the central d-file.': 'Lange Rochade: Der König geht in Deckung, und der Turm landet auf der zentralen d-Linie.',
  'Captures en passant, taking the pawn that just went past.': 'Schlägt en passant den Bauern, der gerade vorbeigezogen ist.',
  'Recaptures on {sq}, restoring the material balance.': 'Schlägt auf {sq} zurück und stellt das materielle Gleichgewicht wieder her.',
  'Strikes at the centre with a pawn, challenging the pawn on {sq}.': 'Stößt mit einem Bauern ins Zentrum vor und greift den Bauern auf {sq} an.',
  'Grabs space in the centre and opens lines for the bishop and queen.': 'Gewinnt Raum im Zentrum und öffnet Linien für Läufer und Dame.',
  'Claims a central square.': 'Besetzt ein Zentrumsfeld.',
  'A solid pawn move: it supports the centre and opens a path for a bishop.': 'Ein solider Bauernzug: Er stützt das Zentrum und öffnet einem Läufer den Weg.',
  'Fights for the centre from the side.': 'Kämpft von der Seite um das Zentrum.',
  'Prepares to fianchetto the bishop on {sq}.': 'Bereitet ein Fianchetto des Läufers nach {sq} vor.',
  'Prepares to support a pawn on d4.': 'Bereitet vor, einen Bauern auf d4 zu stützen.',
  'Prepares to support a pawn on d5.': 'Bereitet vor, einen Bauern auf d5 zu stützen.',
  'Fianchettoes the bishop onto the long diagonal.': 'Fianchettiert den Läufer auf die lange Diagonale.',
  'Develops the knight toward the centre.': 'Entwickelt den Springer Richtung Zentrum.',
  'Brings the queen into play.': 'Bringt die Dame ins Spiel.',
  'Repositions the queen.': 'Stellt die Dame um.',
  'Puts the rook on a central file.': 'Stellt den Turm auf eine zentrale Linie.',
  'Brings the rook into play.': 'Bringt den Turm ins Spiel.',
  'Moves the king.': 'Zieht mit dem König.',
  'Checkmate!': 'Schachmatt!',

  // --- WHY? panel (explainError.ts) ---
  'You missed a checkmate': 'Du hast ein Matt übersehen',
  'They missed a checkmate': 'Dein Gegner hat ein Matt übersehen',
  'This allows checkmate': 'Das erlaubt ein Matt',
  'They allowed checkmate': 'Dein Gegner hat ein Matt zugelassen',
  'This allows a fork': 'Das erlaubt eine Gabel',
  'This allows a pin': 'Das erlaubt eine Fesselung',
  'This allows a strong attack': 'Das erlaubt einen starken Angriff',
  'You missed a free capture': 'Du hast einen freien Schlagzug verpasst',
  'They missed a capture': 'Dein Gegner hat einen Schlagzug verpasst',
  'Not the most accurate move': 'Nicht der genaueste Zug',
  'You missed a chance': 'Du hast eine Chance verpasst',
  'They missed a chance': 'Dein Gegner hat eine Chance verpasst',
  'This gives the advantage away': 'Damit gibst du den Vorteil aus der Hand',
  'Look for a move that keeps your pieces protected and your king safe.': 'Suche einen Zug, der deine Figuren gedeckt und deinen König sicher hält.',
  'It gives your opponent an easier game.': 'Das macht es deinem Gegner leichter.',
  'Always look at every check first, then captures, then threats. Forcing moves are where checkmates hide.':
    'Schau dir immer zuerst alle Schachgebote an, dann Schlagzüge, dann Drohungen. In forcierenden Zügen verstecken sich die Matts.',
  'Before you move, check your king: which enemy pieces can reach it, and which squares around it are weak?':
    'Prüfe vor jedem Zug deinen König: Welche gegnerischen Figuren können ihn erreichen, und welche Felder um ihn herum sind schwach?',
  'Before moving a piece, check its new square: who attacks it there, and who defends it?':
    'Bevor du eine Figur ziehst, prüfe ihr neues Feld: Wer greift sie dort an, und wer deckt sie?',
  'When a piece moves, it stops guarding the squares it used to. Ask what each move leaves behind.':
    'Wenn eine Figur zieht, deckt sie ihre alten Felder nicht mehr. Frag dich, was jeder Zug ungeschützt zurücklässt.',
  'Watch for squares where an enemy knight or pawn could attack two of your pieces at once.':
    'Achte auf Felder, von denen ein gegnerischer Springer oder Bauer zwei deiner Figuren gleichzeitig angreifen kann.',
  'Avoid lining up your king or queen behind another piece on an open line or diagonal.':
    'Stell deinen König oder deine Dame nicht hinter eine andere Figur auf eine offene Linie oder Diagonale.',
  'Keep your king and queen away from open lines that enemy pieces can use.':
    'Halte König und Dame von offenen Linien fern, die gegnerische Figuren nutzen können.',
  'Every move, scan for captures: is any enemy piece undefended, or attacked more times than it is defended?':
    'Suche bei jedem Zug nach Schlagzügen: Ist eine gegnerische Figur ungedeckt oder öfter angegriffen als gedeckt?',
  'In the opening: develop your knights and bishops, fight for the centre and castle early. Avoid moving the same piece twice without a reason.':
    'In der Eröffnung: Entwickle Springer und Läufer, kämpfe um das Zentrum und rochiere früh. Zieh dieselbe Figur nicht ohne Grund zweimal.',
  'In the endgame: bring your king into play, push passed pawns, and trade pieces when you are ahead.':
    'Im Endspiel: Bring deinen König ins Spiel, schieb Freibauern vor und tausche Figuren ab, wenn du vorne liegst.',
  'Before every move, ask three questions: What does my opponent threaten? Which of my pieces are undefended? Is there a check, capture or threat for me?':
    'Stell dir vor jedem Zug drei Fragen: Was droht mein Gegner? Welche meiner Figuren sind ungedeckt? Habe ich ein Schach, einen Schlagzug oder eine Drohung?',

  // --- Coach (coach.ts): written note and move chips ---
  'Their better move was': 'Der bessere Zug deines Gegners war',
  'YOUR REPLY: {san}': 'DEINE ANTWORT: {san}',
  'THEIR REPLY: {san}': 'GEGNERZUG: {san}',
  'MATE IN {n}': 'MATT IN {n}',
  'MATE IN {n}: {san}': 'MATT IN {n}: {san}',
  'THEIR MATE: {san}': 'GEGNER SETZT MATT: {san}',
  'BETTER: {san}': 'BESSER: {san}',
  'THEIR MATE IN {n}': 'GEGNER: MATT IN {n}',
  'THEY HAD MATE IN {n}: {san}': 'GEGNER HATTE MATT IN {n}: {san}',
  'YOUR MATE: {san}': 'DEIN MATT: {san}',
  'THEY HAD: {san}': 'GEGNER HATTE: {san}',
  'THEY HAD: {san} (WINS A PAWN)': 'GEGNER HATTE: {san} (GEWINNT EINEN BAUERN)',
  'THEY HAD: {san} (WINS A KNIGHT)': 'GEGNER HATTE: {san} (GEWINNT EINEN SPRINGER)',
  'THEY HAD: {san} (WINS A BISHOP)': 'GEGNER HATTE: {san} (GEWINNT EINEN LÄUFER)',
  'THEY HAD: {san} (WINS A ROOK)': 'GEGNER HATTE: {san} (GEWINNT EINEN TURM)',
  'THEY HAD: {san} (WINS A QUEEN)': 'GEGNER HATTE: {san} (GEWINNT EINE DAME)',
  'THREAT: {san}': 'DROHUNG: {san}',
  'ON {sq}': 'AUF {sq}',
  'CHECK: {san}': 'SCHACH: {san}',

  // --- Coaches (coaches.ts): bios and the "thinking" filler ---
  'Calm and wise. Explains the why behind every move.': 'Ruhig und weise. Erklärt das Warum hinter jedem Zug.',
  'High energy, all hype. Treats every game like a final.': 'Volle Energie, voller Hype. Spielt jede Partie wie ein Finale.',
  'Curious and cheerful. Loves the science of chess.': 'Neugierig und fröhlich. Liebt die Wissenschaft hinter dem Schach.',
  'Strict and blunt. No excuses, no wasted moves.': 'Streng und direkt. Keine Ausreden, keine verschenkten Züge.',
  'Hmm, let me look at that…': 'Hmm, lass mich das mal ansehen …',
  'Checking the replay…': 'Ich schau mir die Zeitlupe an …',
  'Running the numbers…': 'Ich rechne mal nach …',
  'Inspecting…': 'Wird geprüft …',

  // --- Bots (bots.ts): bios ---
  'A sleepy house cat who only just learned how the pieces move. Probably harmless.':
    'Eine verschlafene Hauskatze, die gerade erst gelernt hat, wie die Figuren ziehen. Vermutlich harmlos.',
  'Brand new to chess and very excited to learn how the horsey moves.': 'Ganz neu beim Schach und total gespannt, wie das Pferdchen zieht.',
  'Plays chess in the garden between watering the sunflowers.': 'Spielt Schach im Garten, zwischen dem Gießen der Sonnenblumen.',
  'A crafty trickster who loves early queen attacks.': 'Ein gerissener Trickser, der frühe Damenangriffe liebt.',
  'A night owl who studies openings until dawn. Solid, steady, patient.': 'Eine Nachteule, die bis zum Morgengrauen Eröffnungen studiert. Solide, beständig, geduldig.',
  'Club champion three years running. Loves the attack.': 'Drei Jahre in Folge Vereinsmeister. Liebt den Angriff.',
  'Cold, precise endgame technician from the north.': 'Kühle, präzise Endspieltechnikerin aus dem Norden.',
  'Tactical wizard. Sees combinations in his sleep.': 'Taktikzauberer. Sieht Kombinationen im Schlaf.',
  'Master-level hunter. Rarely lets an advantage slip.': 'Jäger auf Meisterniveau. Lässt sich selten einen Vorteil entgehen.',
  'Plays at full engine strength. Beat Titan and you can beat anyone.': 'Spielt mit voller Engine-Stärke. Wer Titan schlägt, schlägt jeden.',
};
export default de;
