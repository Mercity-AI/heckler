import { useEffect, useRef } from 'react'
import { cn } from '../../lib/format'

/*
 * Live backdrop for a running attack: a slowly domain-warped noise field with contour lines,
 * ordered-dithered like the mercity.ai canvases. `heat` (0..1) drifts the accent from indigo
 * toward red as the target breaks; `energy` (0..1) controls motion and ink density.
 * Falls back to nothing when WebGL2 is unavailable; renders one still frame for reduced motion.
 */

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform float u_heat;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int i = q.x + q.y * 4;
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[i]) / 16.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res.y;
  float t = u_time * (0.025 + 0.05 * u_energy);
  vec2 q = vec2(fbm(uv * 1.3 + t), fbm(uv * 1.3 + vec2(5.2, 1.3) - t));
  vec2 r = vec2(fbm(uv * 1.5 + 2.0 * q + vec2(1.7, 9.2) + 0.7 * t), fbm(uv * 1.5 + 2.0 * q + vec2(8.3, 2.8) - 0.5 * t));
  float f = fbm(uv * 1.1 + 2.2 * r);

  vec3 paper = vec3(0.976, 0.976, 0.992);
  vec3 indigo = vec3(0.314, 0.282, 0.898);
  vec3 teal = vec3(0.122, 0.62, 0.6);
  vec3 red = vec3(0.86, 0.24, 0.27);
  vec3 accent = mix(indigo, red, u_heat);
  vec3 second = mix(teal, vec3(0.85, 0.51, 0.1), u_heat * 0.8);

  float body = smoothstep(0.42, 0.95, f);
  vec3 col = mix(paper, accent, body * (0.18 + 0.22 * u_energy));
  col = mix(col, second, smoothstep(0.55, 0.95, r.x) * 0.16 * (0.5 + u_energy));

  float k = f * 11.0;
  float d = abs(fract(k + 0.5) - 0.5) / max(fwidth(k), 1e-4);
  float line = 1.0 - clamp(d, 0.0, 1.0);
  col = mix(col, accent, line * (0.10 + 0.14 * u_energy) * smoothstep(0.25, 0.6, f));

  float levels = 14.0;
  col += (bayer4(gl_FragCoord.xy) - 0.5) / levels;
  col = floor(col * levels + 0.5) / levels;
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.025;

  // fade toward paper at the bottom so content sits cleanly on top
  float fade = smoothstep(0.0, 0.85, gl_FragCoord.y / u_res.y);
  col = mix(paper, col, 0.35 + 0.65 * fade);
  outColor = vec4(col, 1.0);
}`

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!
  gl.shaderSource(s, src)
  gl.compileShader(s)
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    console.warn('[ShaderField]', gl.getShaderInfoLog(s))
    return null
  }
  return s
}

export function ShaderField({ energy = 0.6, heat = 0, animate = true, className }: { energy?: number; heat?: number; animate?: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const target = useRef({ energy, heat, animate })
  useEffect(() => {
    target.current = { energy, heat, animate }
  }, [energy, heat, animate])

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()!
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uEnergy = gl.getUniformLocation(prog, 'u_energy')
    const uHeat = gl.getUniformLocation(prog, 'u_heat')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const seedTime = 40 + Math.random() * 200
    let raf = 0
    let visible = true
    let cur = { ...target.current }
    let last = performance.now()
    let time = seedTime

    const resize = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(width))
      const h = Math.max(1, Math.round(height))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
    }

    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      const tgt = target.current
      // ease uniforms so state changes glide instead of snapping
      cur = {
        energy: cur.energy + (tgt.energy - cur.energy) * Math.min(1, dt * 1.5),
        heat: cur.heat + (tgt.heat - cur.heat) * Math.min(1, dt * 1.2),
        animate: tgt.animate,
      }
      if (cur.animate && !reduced) time += dt
      resize()
      gl.uniform2f(uRes, canvas.width, canvas.height)
      gl.uniform1f(uTime, time)
      gl.uniform1f(uEnergy, cur.energy)
      gl.uniform1f(uHeat, cur.heat)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      if (visible && !document.hidden && !reduced) raf = requestAnimationFrame(frame)
    }
    const start = () => {
      cancelAnimationFrame(raf)
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) start()
    })
    io.observe(canvas)
    const onVis = () => !document.hidden && visible && start()
    document.addEventListener('visibilitychange', onVis)
    const ro = new ResizeObserver(() => reduced && start())
    ro.observe(canvas)
    start()

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
    }
  }, [])

  return <canvas ref={ref} aria-hidden className={cn('pointer-events-none absolute inset-0 h-full w-full', className)} />
}
