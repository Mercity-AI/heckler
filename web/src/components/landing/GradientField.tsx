import { useEffect, useRef } from 'react'
import { cn } from '../../lib/format'

/*
 * Landing hero backdrop: warm domain-warped light in the mercity.ai blurlight style, Bayer-dithered
 * at half resolution, with a soft bloom that trails the pointer. The CSS gradient behind the canvas
 * is the fallback for no WebGL2 or a lost context; reduced motion gets one still frame.
 */

const VERT = `#version 300 es
in vec2 p;
void main() { gl_Position = vec4(p, 0.0, 1.0); }`

const FRAG = `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_mouse;
out vec4 outColor;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v / 0.875;
}
float bayer4(vec2 p) {
  ivec2 q = ivec2(mod(p, 4.0));
  int m[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return float(m[q.x + q.y * 4]) / 16.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y);
  float t = u_time * 0.045;

  vec2 q = vec2(fbm(p * 0.9 + t), fbm(p * 0.9 + vec2(5.2, 1.3) - t));
  float warm = fbm(p * 0.8 + 1.5 * q + vec2(1.7, 9.2));
  float cool = fbm(p * 0.7 - 1.3 * q + vec2(8.3, 2.8) + 0.5 * t);

  vec3 cream = vec3(1.0, 0.965, 0.93);
  vec3 peach = vec3(1.0, 0.82, 0.70);
  vec3 coral = vec3(1.0, 0.54, 0.46);
  vec3 pink = vec3(0.98, 0.70, 0.83);
  vec3 lilac = vec3(0.79, 0.75, 1.0);
  vec3 peri = vec3(0.50, 0.49, 0.98);

  // headline side stays pale, colour pools toward the lower right
  float pool = smoothstep(0.1, 1.05, uv.x * 0.75 + (1.0 - uv.y) * 0.6);
  vec3 col = mix(cream, peach, smoothstep(0.3, 0.72, warm) * (0.45 + 0.55 * pool));
  col = mix(col, pink, smoothstep(0.42, 0.78, cool) * 0.65 * pool);
  col = mix(col, coral, smoothstep(0.5, 0.82, warm) * 0.75 * pool);
  col = mix(col, lilac, smoothstep(0.45, 0.72, cool + 0.25 * (1.0 - uv.y)) * 0.8);
  col = mix(col, peri, smoothstep(0.55, 0.85, cool) * 0.55 * pool);

  vec2 m = vec2(u_mouse.x * u_res.x / u_res.y, u_mouse.y);
  float bloom = exp(-dot(p - m, p - m) * 7.0);
  col = mix(col, mix(coral, pink, 0.4), bloom * 0.34);

  float levels = 26.0;
  col += (bayer4(gl_FragCoord.xy) - 0.5) / levels;
  col = floor(col * levels + 0.5) / levels;
  col += (hash(gl_FragCoord.xy + fract(u_time)) - 0.5) * 0.018;
  outColor = vec4(col, 1.0);
}`

// half resolution keeps it cheap and makes the dither cells a visible texture
const SCALE = 0.5
// consecutive frames over 90ms before the animation stops
const SLOW_LIMIT = 20

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)
  if (!s) return null
  gl.shaderSource(s, src)
  gl.compileShader(s)
  return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null
}

export function GradientField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false })
    if (!gl) return
    const vs = compile(gl, gl.VERTEX_SHADER, VERT)
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG)
    if (!vs || !fs) return
    const prog = gl.createProgram()
    gl.attachShader(prog, vs)
    gl.attachShader(prog, fs)
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return
    gl.useProgram(prog)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(prog, 'p')
    gl.enableVertexAttribArray(loc)
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const uRes = gl.getUniformLocation(prog, 'u_res')
    const uTime = gl.getUniformLocation(prog, 'u_time')
    const uMouse = gl.getUniformLocation(prog, 'u_mouse')

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const aim = { x: 0.72, y: 0.42 }
    const mouse = { ...aim }
    let time = 30 + Math.random() * 120
    let raf = 0
    let visible = true
    let last = performance.now()
    let odd = false
    let slowFrames = 0

    const draw = () => {
      const { width, height } = canvas.getBoundingClientRect()
      const w = Math.max(1, Math.round(width * SCALE))
      const h = Math.max(1, Math.round(height * SCALE))
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w
        canvas.height = h
        gl.viewport(0, 0, w, h)
      }
      gl.uniform2f(uRes, w, h)
      gl.uniform1f(uTime, time)
      gl.uniform2f(uMouse, mouse.x, mouse.y)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
      canvas.style.opacity = '1'
    }
    const frame = (now: number) => {
      // a machine that can't keep up keeps the frame it has instead of dragging the page down
      slowFrames = now - last > 90 ? slowFrames + 1 : 0
      if (slowFrames >= SLOW_LIMIT) return
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      time += dt
      mouse.x += (aim.x - mouse.x) * Math.min(1, dt * 2.5)
      mouse.y += (aim.y - mouse.y) * Math.min(1, dt * 2.5)
      // every other frame: this drifts slowly, so 30fps looks the same and costs half
      odd = !odd
      if (odd) draw()
      if (visible && !document.hidden) raf = requestAnimationFrame(frame)
    }
    const start = () => {
      cancelAnimationFrame(raf)
      if (slowFrames >= SLOW_LIMIT) return
      last = performance.now()
      raf = requestAnimationFrame(frame)
    }
    const onPointer = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect()
      aim.x = (e.clientX - r.left) / r.width
      aim.y = 1 - (e.clientY - r.top) / r.height
    }
    const onVisibility = () => {
      if (!document.hidden && visible && !reduced) start()
    }

    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible && !reduced) start()
    })
    const ro = new ResizeObserver(() => reduced && draw())
    draw()
    ro.observe(canvas)
    if (!reduced) {
      io.observe(canvas)
      window.addEventListener('pointermove', onPointer, { passive: true })
      document.addEventListener('visibilitychange', onVisibility)
    }

    return () => {
      cancelAnimationFrame(raf)
      io.disconnect()
      ro.disconnect()
      window.removeEventListener('pointermove', onPointer)
      document.removeEventListener('visibilitychange', onVisibility)
      gl.deleteProgram(prog)
      gl.deleteBuffer(buf)
    }
  }, [])

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 bg-[radial-gradient(90%_90%_at_85%_80%,#ffa694_0%,#f9c2d6_32%,#d9d2ff_58%,#fff3e8_100%)]', className)}>
      {/* the canvas stays hidden until it has drawn, so a failed context leaves the gradient showing */}
      <canvas ref={ref} className="h-full w-full opacity-0 transition-opacity duration-700 [image-rendering:pixelated]" />
    </div>
  )
}
