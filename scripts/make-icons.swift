// Generates MonoMate's app icons (original artwork) in the app's brutalist style:
// off-white paper, a white tile with a heavy black border and a hard black offset shadow,
// and a bold geometric black pawn.
// Run: swift scripts/make-icons.swift assets
import AppKit

let out = URL(fileURLWithPath: CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "assets")

let paper = NSColor(calibratedRed: 0xF3 / 255, green: 0xF3 / 255, blue: 0xF0 / 255, alpha: 1)
let ink = NSColor.black
let white = NSColor.white

/// Draws the pawn centred at (cx, cy) with total height `h`.
func drawPawn(cx: CGFloat, cy: CGFloat, h: CGFloat, color: NSColor) {
  let w = h
  let x0 = cx - w / 2, y0 = cy - h / 2
  func P(_ x: CGFloat, _ y: CGFloat) -> NSPoint { NSPoint(x: x0 + x * w, y: y0 + y * h) }
  color.setFill()
  // Base plinth
  NSBezierPath(rect: NSRect(origin: P(0.16, 0.0), size: NSSize(width: 0.68 * w, height: 0.12 * h))).fill()
  // Flared body
  let body = NSBezierPath()
  body.move(to: P(0.24, 0.12))
  body.curve(to: P(0.40, 0.54), controlPoint1: P(0.26, 0.30), controlPoint2: P(0.36, 0.42))
  body.line(to: P(0.60, 0.54))
  body.curve(to: P(0.76, 0.12), controlPoint1: P(0.64, 0.42), controlPoint2: P(0.74, 0.30))
  body.close()
  body.fill()
  // Collar
  NSBezierPath(rect: NSRect(origin: P(0.28, 0.52), size: NSSize(width: 0.44 * w, height: 0.08 * h))).fill()
  // Head
  NSBezierPath(ovalIn: NSRect(origin: P(0.31, 0.60), size: NSSize(width: 0.38 * w, height: 0.38 * h))).fill()
}

/// White tile with heavy border and hard offset shadow, pawn inside. `side` is the tile size.
func drawTile(center c: NSPoint, side: CGFloat) {
  let border = side * 0.055
  let shadow = side * 0.075
  // In AppKit y grows upwards, so the shadow goes right and *down*.
  let tile = NSRect(x: c.x - side / 2 - shadow / 2, y: c.y - side / 2 + shadow / 2, width: side, height: side)
  ink.setFill()
  NSBezierPath(rect: tile.offsetBy(dx: shadow, dy: -shadow)).fill()
  white.setFill()
  NSBezierPath(rect: tile).fill()
  ink.setStroke()
  let frame = NSBezierPath(rect: tile.insetBy(dx: border / 2, dy: border / 2))
  frame.lineWidth = border
  frame.stroke()
  drawPawn(cx: tile.midX, cy: tile.midY - side * 0.01, h: side * 0.58, color: ink)
}

func render(_ size: Int, _ name: String, _ draw: (NSRect) -> Void) {
  let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4,
                             hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
  draw(NSRect(x: 0, y: 0, width: size, height: size))
  NSGraphicsContext.restoreGraphicsState()
  try! rep.representation(using: .png, properties: [:])!.write(to: out.appendingPathComponent(name))
  print("wrote", name)
}

let mid = { (r: NSRect) in NSPoint(x: r.midX, y: r.midY) }

// iOS / universal icon: full-bleed paper, no transparency (flattened afterwards).
render(1024, "icon.png") { r in paper.setFill(); r.fill(); drawTile(center: mid(r), side: r.width * 0.62) }
// Android adaptive icon layers (foreground content inside the central ~66% safe zone).
render(512, "android-icon-background.png") { r in paper.setFill(); r.fill() }
render(512, "android-icon-foreground.png") { r in drawTile(center: mid(r), side: r.width * 0.46) }
render(432, "android-icon-monochrome.png") { r in drawPawn(cx: r.midX, cy: r.midY, h: r.width * 0.36, color: white) }
// Splash + web favicon.
render(1024, "splash-icon.png") { r in drawTile(center: mid(r), side: r.width * 0.6) }
render(48, "favicon.png") { r in paper.setFill(); r.fill(); drawTile(center: mid(r), side: r.width * 0.7) }
