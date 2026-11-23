import SwiftUI

/// A face's body in the key's 128-unit grid (FaceShapes.swift): its underside, front and
/// lighter top, and how far its eyes and mouth sit below the key's.
struct FaceBody {
    let back: String
    let front: String
    let top: String
    let drop: Double

    static func of(_ shape: String?) -> FaceBody { all[shape ?? "key"] ?? all["key"]! }

    /// An absolute M/L/C/Z path, as FaceShapes.swift writes them.
    static func path(_ d: String) -> Path {
        var p = Path()
        var cmd: Character = "M"
        var n: [CGFloat] = []
        func take() {
            switch cmd {
            case "M" where n.count >= 2: p.move(to: CGPoint(x: n[0], y: n[1])); n.removeFirst(2); cmd = "L"
            case "L" where n.count >= 2: p.addLine(to: CGPoint(x: n[0], y: n[1])); n.removeFirst(2)
            case "C" where n.count >= 6:
                p.addCurve(to: CGPoint(x: n[4], y: n[5]), control1: CGPoint(x: n[0], y: n[1]), control2: CGPoint(x: n[2], y: n[3]))
                n.removeFirst(6)
            default: return
            }
            take()
        }
        for tok in d.split(separator: " ") {
            if let c = tok.first, tok.count == 1, "MLCZ".contains(c) {
                if c == "Z" { p.closeSubpath() } else { cmd = c }
            } else if let v = Double(tok) {
                n.append(CGFloat(v))
                take()
            }
        }
        return p
    }
}

/// What the face says: the brand sheet's hello, working and needs-you moods.
enum Mood { case hello, working, needs }

/// Junior's face, or a teammate's: the J key or one of the body shapes, in its colour.
/// Still (no motion on the phone); the needs-you light is the only orange.
struct FaceView: View {
    var colour: String?
    var shape: String?
    var mood: Mood = .hello
    var size: CGFloat = 36

    var body: some View {
        let pal = FacePalette(colour)
        let b = FaceBody.of(shape)
        let small = size < 48
        Canvas { ctx, sz in
            // viewBox 8 10 112 112, as the web face
            let k = sz.width / 112
            ctx.scaleBy(x: k, y: k)
            ctx.translateBy(x: -8, y: -10)
            ctx.fill(FaceBody.path(b.back), with: .color(pal.skirt))
            ctx.fill(FaceBody.path(b.front), with: .color(pal.body))
            ctx.fill(FaceBody.path(b.top), with: .color(pal.top))
            var face = ctx
            face.translateBy(x: 0, y: b.drop)
            let eyes: [CGRect]
            let mouth: (CGPoint, CGPoint, CGPoint, CGFloat)
            switch mood {
            case .hello:
                eyes = [CGRect(x: 38.5, y: 44.5, width: 21, height: 21), CGRect(x: 68.5, y: 44.5, width: 21, height: 21)]
                mouth = (CGPoint(x: 56.5, y: 76), CGPoint(x: 64, y: 83), CGPoint(x: 71.5, y: 76), 5.5)
            case .working:
                eyes = [CGRect(x: 39, y: 51.5, width: 20, height: 13), CGRect(x: 69, y: 51.5, width: 20, height: 13)]
                mouth = (CGPoint(x: 58, y: 78), CGPoint(x: 64, y: 78), CGPoint(x: 70, y: 78), 5.5)
            case .needs:
                eyes = [CGRect(x: 41, y: 40, width: 22, height: 22), CGRect(x: 71, y: 40, width: 22, height: 22)]
                mouth = (CGPoint(x: 63.5, y: 79), CGPoint(x: 64, y: 79), CGPoint(x: 64.5, y: 79), 9)
            }
            for e in eyes {
                face.fill(Path(roundedRect: e, cornerRadius: min(e.width, e.height) / 2), with: .color(pal.eye))
                // the highlight: up and left, gone on a narrowed eye or a small face
                let r = min(e.width, e.height) / 2
                if !small, e.height >= e.width * 0.8 {
                    face.fill(Path(ellipseIn: CGRect(x: e.midX - r * 0.33 - r * 0.3, y: e.midY - r * 0.38 - r * 0.3, width: r * 0.6, height: r * 0.6)), with: .color(.white))
                }
            }
            var m = Path()
            m.move(to: mouth.0)
            m.addQuadCurve(to: mouth.2, control: mouth.1)
            face.stroke(m, with: .color(pal.skirt), style: StrokeStyle(lineWidth: max(mouth.3, small ? 7.5 : 0), lineCap: .round))
            if mood == .needs {
                ctx.fill(Path(ellipseIn: CGRect(x: 87, y: 22, width: 18, height: 18)), with: .color(Theme.orange.opacity(0.22)))
                ctx.fill(Path(ellipseIn: CGRect(x: 91.5, y: 26.5, width: 9, height: 9)), with: .color(Theme.orange))
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

/// Top, body, skirt and eyes from one colour (the key's top), as facePalette in JuniorFace.tsx:
/// sky is the brand key exactly, any other colour is derived.
struct FacePalette {
    let top: Color
    let body: Color
    let skirt: Color
    let eye: Color

    init(_ colour: String?) {
        let hex = (colour ?? "").lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        guard hex.count == 6, let v = UInt32(hex, radix: 16), hex != "a9cdfc" else {
            top = Color(hex: 0xA9CDFC); body = Color(hex: 0x80B2F6); skirt = Color(hex: 0x2F63C9); eye = Color(hex: 0x0B1530)
            return
        }
        let (h, s, l) = FacePalette.hsl(v)
        let c = { (x: Double, a: Double, b: Double) in max(a, min(b, x)) }
        top = Color(hex: v)
        body = FacePalette.color(h, c(s * 0.93, 0, 1), c(l - 0.1, 0.2, 0.85))
        skirt = FacePalette.color((h + 6).truncatingRemainder(dividingBy: 360), c(s * 0.66, 0, 1), c(l * 0.59, 0.18, 0.55))
        eye = FacePalette.color((h + 10).truncatingRemainder(dividingBy: 360), c(s * 0.67, 0, 1), 0.12)
    }

    private static func hsl(_ v: UInt32) -> (Double, Double, Double) {
        let r = Double((v >> 16) & 255) / 255, g = Double((v >> 8) & 255) / 255, b = Double(v & 255) / 255
        let mx = max(r, g, b), mn = min(r, g, b)
        let l = (mx + mn) / 2, d = mx - mn
        guard d > 0 else { return (0, 0, l) }
        let s = d / (1 - abs(2 * l - 1))
        var h = mx == r ? ((g - b) / d).truncatingRemainder(dividingBy: 6) : mx == g ? (b - r) / d + 2 : (r - g) / d + 4
        h *= 60
        if h < 0 { h += 360 }
        return (h, s, l)
    }

    private static func color(_ h: Double, _ s: Double, _ l: Double) -> Color {
        let c = (1 - abs(2 * l - 1)) * s
        let x = c * (1 - abs((h / 60).truncatingRemainder(dividingBy: 2) - 1))
        let m = l - c / 2
        let (r, g, b): (Double, Double, Double) = h < 60 ? (c, x, 0) : h < 120 ? (x, c, 0) : h < 180 ? (0, c, x) : h < 240 ? (0, x, c) : h < 300 ? (x, 0, c) : (c, 0, x)
        return Color(red: r + m, green: g + m, blue: b + m)
    }
}
