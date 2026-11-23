// Writes ios/Junior/FaceShapes.swift from core/junior/shapes.ts: npx tsx ios/scripts/face-shapes.ts > ios/Junior/FaceShapes.swift
import { SHAPES, shapePaths } from '../../core/junior/shapes.ts'
type M = [number, number, number, number, number, number] // a b c d e f
const mul = (p: M, q: M): M => [p[0]*q[0]+p[2]*q[1], p[1]*q[0]+p[3]*q[1], p[0]*q[2]+p[2]*q[3], p[1]*q[2]+p[3]*q[3], p[0]*q[4]+p[2]*q[5]+p[4], p[1]*q[4]+p[3]*q[5]+p[5]]
const I: M = [1,0,0,1,0,0]
function parseT(t?: string): M {
  if (!t) return I
  let m = I
  for (const [, fn, args] of t.matchAll(/(translate|scale)\(([^)]*)\)/g)) {
    const n = args.trim().split(/[\s,]+/).map(Number)
    m = mul(m, fn === 'translate' ? [1,0,0,1,n[0],n[1] ?? 0] : [n[0],0,0,n[1] ?? n[0],0,0])
  }
  return m
}
function apply(d: string, m: M): string {
  const toks = d.match(/[MLCZ]|-?\d*\.?\d+(?:e-?\d+)?/g)!
  let out = ''; let nums: number[] = []
  const flush = () => { for (let i = 0; i + 1 < nums.length; i += 2) { const [x, y] = [nums[i], nums[i+1]]; out += `${+(m[0]*x+m[2]*y+m[4]).toFixed(2)} ${+(m[1]*x+m[3]*y+m[5]).toFixed(2)} ` } nums = [] }
  for (const t of toks) { if (/[MLCZ]/.test(t)) { flush(); out += t + ' ' } else nums.push(Number(t)) }
  flush()
  const bad = d.match(/[A-Za-z]/g)!.filter((c) => !'MLCZ'.includes(c)); if (bad.length) throw new Error('cmd ' + bad)
  return out.trim()
}
let s = `// Generated from core/junior/shapes.ts (shapePaths, transforms applied): the 128-unit key grid.
// Regenerate with ios/scripts/face-shapes.ts if the shapes change; don't edit by hand.

extension FaceBody {
    static let all: [String: FaceBody] = [
`
for (const [shape] of SHAPES) {
  const p = shapePaths(shape)
  const frame = parseT(p.frame)
  const top = mul(frame, parseT(p.topFrame))
  const drop = p.faceShift ? Number(p.faceShift.match(/translate\(0 ([-\d.]+)\)/)![1]) : 0
  s += `        "${shape}": FaceBody(\n            back: "${apply(p.back, frame)}",\n            front: "${apply(p.front, frame)}",\n            top: "${apply(p.top, top)}",\n            drop: ${drop}\n        ),\n`
}
s += `    ]\n}\n`
process.stdout.write(s)
