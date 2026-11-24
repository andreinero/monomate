import { memo } from 'react';
import { SvgAst, parse, type JsxAST } from 'react-native-svg';
import { PIECE_SVG } from '../assets/pieces';

/** Each piece's SVG, parsed once for the whole app (not again every time a piece appears). */
const PIECE_AST = new Map<string, JsxAST | null>();
const pieceAst = (code: string) => {
  if (!PIECE_AST.has(code)) PIECE_AST.set(code, parse(PIECE_SVG[code]));
  return PIECE_AST.get(code)!;
};

/** One chess piece drawing. `code`: color + piece, e.g. "wp", "bq". */
export const PieceIcon = memo(function PieceIcon({ code, size }: { code: string; size: number }) {
  return <SvgAst ast={pieceAst(code)} override={{ width: size, height: size }} />;
});
