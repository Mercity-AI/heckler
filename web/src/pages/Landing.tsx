import { ArrowRight } from 'lucide-react'
import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { HecklerMark, HecklerWordmark, MercityLogoLink } from '../components/brand'
import { GradientField } from '../components/landing/GradientField'
import { GuardLab } from '../components/landing/GuardLab'
import { Mascot } from '../components/landing/Mascot'
import { ParallelRun } from '../components/landing/ParallelRun'
import { PromptExplorer } from '../components/landing/PromptExplorer'
import { cn } from '../lib/format'

const GITHUB = 'https://github.com/Mercity-AI/heckler'
const SIMULA = 'https://github.com/Mercity-AI/Simula'
const SYSTEM_ONE_DOCS = 'https://docs.typesafe.ai/models'
const STUDY = 'https://www.mercity.ai/blog-post/can-a-decision-model-guard-a-customer-facing-agent/'

const STUDY_FACTS = [
  { value: '5,620', label: 'replies scored' },
  { value: '5', label: 'customer-facing agents' },
  { value: '3', label: 'guards: Jev, Clef, GPT-6.1 Terra' },
]

const STEPS = [
  { title: 'Connect', body: 'Give Heckler your agent’s endpoint and system prompt. Any OpenAI-compatible API or custom HTTP backend works.' },
  { title: 'Heckle', body: 'Simula maps personas, moods and pressure tactics from your prompt. Each scenario gets its own simulated user, all chatting at once.' },
  { title: 'Grade', body: 'Each simulated user steps out of character and grades its own chat. One violation fails it, with the line quoted.' },
]

const GUARD_FLOW = [
  { title: 'One rule, one question', body: 'Your policy becomes numbered rules. Each one is asked as “does this reply break it?”' },
  { title: 'A probability per rule', body: 'The model reads the reply and the user message before it. Any rule at your threshold blocks.' },
  { title: 'Shadow mode', body: 'Guards score every reply in the background, so chats run as usual and nothing gets blocked.' },
  { title: 'Scored against grades', body: 'See catches, misses and false alarms per guard, and how many violations it stopped in time.' },
]

const FACTS = [
  { title: 'Runs on your keys', body: 'Every model call uses the key you save on the agent. The offline demo needs no key.' },
  { title: 'Encrypted at rest', body: 'API keys, prompts, scenarios and transcripts are stored encrypted.' },
  { title: 'Replay any run', body: 'Changed the prompt? Send the same scenarios again and compare.' },
  { title: 'The code is public', body: 'Read it on GitHub, or run your own copy.', href: GITHUB },
]

function Primary({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Link
      to="/sign-in"
      className={cn(
        'group inline-flex items-center justify-center gap-2 rounded-full bg-[linear-gradient(100deg,#5048e5,#7a5cf0)] font-display font-semibold text-white shadow-[0_10px_26px_-10px_rgb(80_72_229/0.75),inset_0_1px_0_rgb(255_255_255/0.25)] transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_14px_30px_-10px_rgb(80_72_229/0.85),inset_0_1px_0_rgb(255_255_255/0.25)]',
        className,
      )}
    >
      {children}
      <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  )
}

function Reveal({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className={className}>
      {children}
    </motion.div>
  )
}

function Heading({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cn('max-w-[680px]', className)}>
      <h2 className="font-serif text-[36px] leading-[1.06] font-[380] tracking-[-0.022em] text-balance text-dusk sm:text-[50px]">{title}</h2>
      {children && <p className="mt-4 text-[16.5px] leading-relaxed text-pretty text-dusk-2 sm:text-[17.5px]">{children}</p>}
    </div>
  )
}

function Nav() {
  return (
    <header className="fixed inset-x-0 top-0 z-40 px-3 pt-3 sm:px-5">
      <nav aria-label="Main" className="mx-auto flex h-[58px] max-w-[1180px] items-center gap-1 rounded-full border border-white/70 bg-white/65 pr-2 pl-4 shadow-[0_8px_30px_-14px_rgb(80_72_229/0.35)] backdrop-blur-xl">
        <Link to="/" aria-label="Heckler home" className="mr-auto flex items-center gap-2">
          <HecklerMark className="size-7" />
          <HecklerWordmark />
        </Link>
        <a href="#how" className="hidden rounded-full px-3 py-2 font-display text-[14px] font-medium text-dusk-2 transition-colors hover:text-dusk md:block">
          How it works
        </a>
        <a href="#guards" className="hidden rounded-full px-3 py-2 font-display text-[14px] font-medium text-dusk-2 transition-colors hover:text-dusk md:block">
          Guards
        </a>
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="hidden rounded-full px-3 py-2 font-display text-[14px] font-medium text-dusk-2 transition-colors hover:text-dusk md:block">
          GitHub
        </a>
        <Link to="/sign-in" className="ml-1 rounded-full px-3 py-2 font-display text-[14px] font-medium text-dusk transition-colors hover:text-indigo-600">
          Sign in
        </Link>
        <Primary className="h-[42px] px-4 text-[14px]">Start testing</Primary>
      </nav>
    </header>
  )
}

function Hero() {
  return (
    <section className="relative isolate">
      <div className="absolute inset-x-0 top-0 bottom-[290px] -z-10 overflow-hidden sm:bottom-[300px]">
        <GradientField />
        <div className="fangs-up absolute inset-x-0 -bottom-px h-5" />
      </div>
      <div className="mx-auto max-w-[1180px] px-4 pt-[128px] sm:px-6 sm:pt-[150px]">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}>
          <h1 className="max-w-[17ch] font-serif text-[48px] leading-[1] font-[360] tracking-[-0.03em] text-balance text-dusk sm:text-[72px] lg:text-[88px]">
            See how your agent behaves <em className="font-[380]">before</em> your users do.
          </h1>
          <div className="mt-7 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <p className="max-w-[580px] text-[17px] leading-relaxed text-pretty text-dusk-2 sm:text-[19px]">
              Heckler reads your agent’s system prompt, writes simulated users from it, sends them all in at once and grades every chat. When a rule breaks, you get the exact line.
            </p>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              <Primary className="h-[52px] px-6 text-[16px]">Start testing</Primary>
              <a href="#how" className="inline-flex h-[52px] items-center rounded-full border border-white/80 bg-white/60 px-6 font-display text-[16px] font-medium text-dusk backdrop-blur transition-colors hover:bg-white/90">
                How it works
              </a>
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 26 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.12, ease: [0.22, 1, 0.36, 1] }} className="relative mt-16 sm:mt-20">
          <Mascot className="absolute -top-[52px] right-6 z-0 w-[84px] sm:-top-[66px] sm:right-12 sm:w-[106px]" />
          <div className="relative z-10">
            <ParallelRun />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

function How() {
  return (
    <section id="how" className="mx-auto max-w-[1180px] px-4 pt-24 pb-28 sm:px-6 sm:pt-32 sm:pb-36">
      <Reveal>
        <Heading title="Your system prompt is the test plan.">Every rule you wrote is something a user can push on. Click one to see who might turn up.</Heading>
      </Reveal>
      <Reveal className="mt-10">
        <PromptExplorer />
        <p className="mt-4 px-1 text-[13.5px] text-dusk-3">Example scenarios. A run writes its own from your prompt.</p>
      </Reveal>
      <Reveal className="mt-16">
        <ol className="grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((s, i) => (
            <li key={s.title} className="border-t border-dusk/15 pt-4">
              <span className="font-mono text-[12px] text-dusk-3">0{i + 1}</span>
              <h3 className="mt-1 font-serif text-[25px] font-[420] tracking-[-0.01em] text-dusk">{s.title}</h3>
              <p className="mt-1.5 text-[15.5px] leading-relaxed text-pretty text-dusk-2">{s.body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-[14px] text-dusk-3">
          Scenarios come from{' '}
          <a href={SIMULA} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-600 hover:underline">
            Simula
          </a>
          , our scenario generator.
        </p>
      </Reveal>
    </section>
  )
}

function Guards() {
  return (
    <section id="guards" className="relative isolate overflow-hidden bg-[linear-gradient(160deg,#ffe2d2_0%,#f9cfe0_34%,#d8d1ff_70%,#bdb9ff_100%)]">
      <div className="fangs-down absolute inset-x-0 -top-px h-5" />
      <div className="fangs-up absolute inset-x-0 -bottom-px h-5" />
      <div className="mx-auto max-w-[1180px] px-4 pt-24 pb-28 sm:px-6 sm:pt-32 sm:pb-36">
        <Reveal>
          <Heading title="Add a guard. See what it would have stopped.">
            Decision models like Jev, Clef and Laya write no text. They read a reply and answer yes or no with a probability, in about a second, so you can run one on every reply. Add one to an agent and Heckler measures it before it blocks anybody.
          </Heading>
        </Reveal>
        <Reveal className="mt-10">
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GUARD_FLOW.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-white/70 bg-white/55 p-4 backdrop-blur">
                <span className="font-mono text-[12px] text-dusk-2">0{i + 1}</span>
                <h3 className="mt-1 font-display text-[16px] font-semibold text-dusk">{s.title}</h3>
                <p className="mt-1 text-[14.5px] leading-normal text-pretty text-dusk-2">{s.body}</p>
              </li>
            ))}
          </ol>
        </Reveal>
        <Reveal className="mt-12">
          <h3 className="mb-1 font-serif text-[28px] leading-tight font-[400] tracking-[-0.015em] text-dusk sm:text-[34px]">Drag the threshold across Jev’s scores.</h3>
          <p className="mb-5 max-w-[640px] text-[16px] leading-relaxed text-pretty text-dusk-2">Lower it and you catch more, and block good replies too. Each dot is one reply. Click it to see why it scored that way.</p>
          <GuardLab />
          <p className="mt-3 max-w-[760px] text-[13.5px] leading-normal text-pretty text-dusk-2">
            Recorded Jev 1.14 scores from the study below, with text cut for length. Heckler works with Jev and Clef on OpenRouter, and with anything serving the{' '}
            <a href={SYSTEM_ONE_DOCS} target="_blank" rel="noopener noreferrer" className="font-medium text-indigo-700 underline">
              System One API
            </a>
            , Laya included.
          </p>
          <a
            href={STUDY}
            target="_blank"
            rel="noopener noreferrer"
            className="group mt-10 grid gap-8 rounded-[22px] bg-white p-6 shadow-[0_30px_80px_-30px_rgb(80_72_229/0.45)] transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_36px_84px_-28px_rgb(80_72_229/0.55)] sm:p-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12"
          >
            <span className="min-w-0">
              <span className="block font-mono text-[12px] text-dusk-3">Our study, run in Heckler</span>
              <span className="mt-3 block font-serif text-[30px] leading-[1.1] font-[400] tracking-[-0.015em] text-balance text-dusk sm:text-[40px]">Can a decision model guard a customer-facing agent?</span>
              <span className="mt-4 block max-w-[560px] text-[16.5px] leading-relaxed text-pretty text-dusk-2">
                Not on its own. Decision models make a usable first filter, but they score many violations too low to block, and most of their false alarms trace back to how the policy was written.
              </span>
              <span className="mt-6 inline-flex h-[46px] items-center gap-2 rounded-full bg-[linear-gradient(100deg,#5048e5,#7a5cf0)] px-5 font-display text-[15px] font-semibold text-white shadow-[0_10px_26px_-10px_rgb(80_72_229/0.75),inset_0_1px_0_rgb(255_255_255/0.25)]">
                Read the study
                <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </span>
            </span>
            <span className="grid grid-cols-3 gap-4 border-t border-dusk/10 pt-6 lg:grid-cols-1 lg:content-center lg:gap-5 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              {STUDY_FACTS.map((f) => (
                <span key={f.label}>
                  <span className="block font-serif text-[30px] leading-none font-[400] tracking-[-0.015em] text-indigo-600 sm:text-[38px]">{f.value}</span>
                  <span className="mt-1 block text-[13.5px] leading-snug text-dusk-2">{f.label}</span>
                </span>
              ))}
            </span>
          </a>
        </Reveal>
      </div>
    </section>
  )
}

function Facts() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 pt-24 sm:px-6 sm:pt-28">
      <Reveal>
        <ul className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
          {FACTS.map((f) => (
            <li key={f.title} className="border-t border-dusk/15 pt-4">
              <h3 className="font-display text-[17px] font-semibold text-dusk">
                {f.href ? (
                  <a href={f.href} target="_blank" rel="noopener noreferrer" className="hover:text-indigo-600">
                    {f.title}
                  </a>
                ) : (
                  f.title
                )}
              </h3>
              <p className="mt-1 text-[15px] leading-relaxed text-pretty text-dusk-2">{f.body}</p>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}

function Closer() {
  return (
    <section className="mx-auto max-w-[1180px] px-4 pt-24 pb-14 sm:px-6 sm:pt-28">
      <Reveal>
        <div className="relative isolate overflow-hidden rounded-[32px] bg-[linear-gradient(110deg,#ffd9c7_0%,#fbc4d6_42%,#cfc8ff_100%)] px-6 py-14 sm:px-14 sm:py-20">
          <div className="fangs-up absolute inset-x-0 -bottom-px h-5" />
          <Mascot className="absolute -right-3 -bottom-4 -z-10 w-[150px] rotate-[-7deg] opacity-95 sm:right-12 sm:bottom-6 sm:w-[230px]" />
          <h2 className="max-w-[18ch] font-serif text-[40px] leading-[1.03] font-[370] tracking-[-0.025em] text-balance text-dusk sm:text-[60px]">Someone will heckle your agent. Make it us.</h2>
          <Primary className="mt-8 h-[52px] px-6 text-[16px]">Start testing</Primary>
        </div>
      </Reveal>
    </section>
  )
}

function Footer() {
  return (
    <footer className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 pb-10 text-[14px] text-dusk-2 sm:px-6">
      <MercityLogoLink />
      <span className="ml-auto flex flex-wrap gap-x-5 gap-y-1">
        <a href={GITHUB} target="_blank" rel="noopener noreferrer" className="hover:text-dusk">GitHub</a>
        <Link to="/privacy" className="hover:text-dusk">Privacy Policy</Link>
        <Link to="/terms" className="hover:text-dusk">Terms of Service</Link>
      </span>
    </footer>
  )
}

/**
 * The public front door: `/` when signed out, and `/about` for everyone. It takes no props and makes no
 * API calls, so it renders without Clerk or the backend.
 */
export function LandingPage() {
  return (
    <div className="landing min-h-screen overflow-x-clip bg-cream text-dusk">
      <Nav />
      <main>
        <Hero />
        <How />
        <Guards />
        <Facts />
        <Closer />
      </main>
      <Footer />
    </div>
  )
}
