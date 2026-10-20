import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { HecklerMark, HecklerWordmark, MercityLogoLink } from '../components/brand'

const UPDATED = '20 October 2026'
const CONTACT = 'pranav@mercity.io'

type Section = { title: string; body: ReactNode }

function Mail() {
  return (
    <a href={`mailto:${CONTACT}`} className="font-medium text-indigo-600 hover:underline">
      {CONTACT}
    </a>
  )
}

/** Public page (no sign-in): header with both logos, then the document. */
function LegalPage({ title, intro, sections }: { title: string; intro: ReactNode; sections: Section[] }) {
  return (
    <div className="min-h-screen bg-ground">
      <header className="mx-auto flex w-full max-w-[760px] items-center justify-between px-6 pt-6">
        <Link to="/" aria-label="Heckler home" className="flex items-center gap-2.5">
          <HecklerMark className="size-8" />
          <HecklerWordmark />
        </Link>
        <MercityLogoLink />
      </header>
      <main className="mx-auto w-full max-w-[760px] px-6 pt-12 pb-20">
        <h1 className="font-display text-[30px] font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-2 text-[13px] text-ink-3">Last updated {UPDATED}</p>
        <div className="mt-6 text-[15px] leading-relaxed text-ink-2">{intro}</div>
        {sections.map((s, i) => (
          <section key={s.title} className="mt-9">
            <h2 className="font-display text-[17px] font-semibold text-ink">
              {i + 1}. {s.title}
            </h2>
            <div className="mt-2.5 space-y-3 text-[15px] leading-relaxed text-ink-2 [&_li]:mt-1.5 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5">
              {s.body}
            </div>
          </section>
        ))}
        <footer className="mt-14 flex gap-4 border-t border-line pt-6 text-[13px] text-ink-3">
          <Link to="/privacy" className="hover:text-ink">Privacy Policy</Link>
          <Link to="/terms" className="hover:text-ink">Terms of Service</Link>
          <a href="https://www.mercity.ai" target="_blank" rel="noopener noreferrer" className="hover:text-ink">mercity.ai</a>
        </footer>
      </main>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          Heckler is a service by Mercity Research (“Mercity”, “we”, “us”) that tests AI agents against their own system prompts. This policy explains what we collect when you use Heckler, why, and what you can do about it.
        </p>
      }
      sections={[
        {
          title: 'What we collect',
          body: (
            <ul>
              <li>
                <strong>Account details.</strong> Your email address, and your name and profile picture if you sign in with Google. Sign-in is handled by our authentication provider, Clerk.
              </li>
              <li>
                <strong>What you give us to run evaluations.</strong> Agent names and descriptions, system prompts, endpoint URLs and settings, and the API keys for your agent and your evaluator model.
              </li>
              <li>
                <strong>What evaluations produce.</strong> Generated test scenarios, the full conversations between our simulated users and your agent, scores, findings and reports.
              </li>
              <li>
                <strong>Technical data.</strong> Server logs (such as IP address and request times) needed to run and secure the service, and the session cookies that keep you signed in.
              </li>
            </ul>
          ),
        },
        {
          title: 'How we use it',
          body: (
            <>
              <p>We use your data only to provide Heckler: to run the evaluations you start, show you their results, keep your account working, and keep the service secure.</p>
              <p>We do not sell your data, we do not use it for advertising, and we do not use your prompts, conversations or API keys to train models.</p>
            </>
          ),
        },
        {
          title: 'Your API keys',
          body: (
            <p>
              Heckler is bring-your-own-key: every model call in an evaluation runs on the keys you provide, and your provider bills you for it. We store your keys on our servers so evaluations can run, never display them again after you save them, and use them only to make the calls an evaluation you started needs, to the endpoints you configured.
            </p>
          ),
        },
        {
          title: 'Who receives your data',
          body: (
            <ul>
              <li>
                <strong>Clerk</strong>, to sign you in and manage your account.
              </li>
              <li>
                <strong>The endpoints and model providers you configure</strong> (for example OpenRouter or your own agent’s API). They receive the prompts and conversations an evaluation sends, under your account with them and their own terms.
              </li>
              <li>
                <strong>Our hosting provider</strong>, which runs the servers Heckler is stored on.
              </li>
              <li>
                <strong>Google Fonts</strong>, which serves the typefaces on these pages and so sees your IP address when they load.
              </li>
            </ul>
          ),
        },
        {
          title: 'Keeping and deleting your data',
          body: (
            <p>
              We keep your agents, runs and results until you delete them, which you can do at any time in the app. To delete your account and everything associated with it, email <Mail /> and we will remove it.
            </p>
          ),
        },
        {
          title: 'Security',
          body: <p>We take reasonable measures to protect your data, but no online service can guarantee perfect security. Only store prompts and keys you are comfortable keeping on a hosted service.</p>,
        },
        {
          title: 'Children',
          body: <p>Heckler is a tool for building software and is not intended for anyone under 18.</p>,
        },
        {
          title: 'Changes to this policy',
          body: <p>If we change this policy we will update this page and the date at the top. For significant changes, we will let you know by email or in the app.</p>,
        },
        {
          title: 'Contact',
          body: (
            <p>
              Questions or requests about your data: <Mail />.
            </p>
          ),
        },
      ]}
    />
  )
}

export function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms govern your use of Heckler, a service by Mercity Research (“Mercity”, “we”, “us”). By creating an account or using Heckler, you agree to them.
        </p>
      }
      sections={[
        {
          title: 'The service',
          body: (
            <p>
              Heckler generates test scenarios from your agent’s system prompt, has simulated users hold conversations with your agent, and grades those conversations. Heckler is an early product: features may change, and we may add, change or remove parts of it.
            </p>
          ),
        },
        {
          title: 'Your account',
          body: <p>Keep your sign-in secure and your details accurate. You are responsible for what happens under your account.</p>,
        },
        {
          title: 'Your keys and costs',
          body: (
            <p>
              Heckler runs on API keys you provide. You are responsible for any charges your providers bill for the calls an evaluation makes, and for having the right to use those keys and endpoints. Start with small runs until you know what an evaluation costs.
            </p>
          ),
        },
        {
          title: 'Acceptable use',
          body: (
            <>
              <p>Heckler sends adversarial conversations on purpose: simulated users may be manipulative, distressed or try to break your agent’s rules. You agree to:</p>
              <ul>
                <li>only test agents and endpoints you own or are authorised to test;</li>
                <li>not use Heckler to attack, overload or gain unauthorised access to anyone else’s systems;</li>
                <li>not use Heckler for anything illegal, or to produce harmful content for use outside of testing;</li>
                <li>not interfere with, overload or try to get around the limits of Heckler itself.</li>
              </ul>
            </>
          ),
        },
        {
          title: 'Your content',
          body: (
            <p>
              You keep all rights to the prompts, agents and results you create in Heckler. You allow us to store and process them only as needed to provide the service to you. See the <Link to="/privacy" className="font-medium text-indigo-600 hover:underline">Privacy Policy</Link> for how we handle your data.
            </p>
          ),
        },
        {
          title: 'Evaluation results',
          body: (
            <p>
              Results are produced automatically by AI models. They can miss real problems and can flag things that are not problems. They are a testing aid, not a guarantee that your agent is safe, correct or compliant with any law or standard.
            </p>
          ),
        },
        {
          title: 'Suspension and termination',
          body: <p>You can stop using Heckler at any time. We may suspend or close accounts that break these terms or put the service or others at risk.</p>,
        },
        {
          title: 'Disclaimers and liability',
          body: (
            <p>
              Heckler is provided “as is”, without warranties of any kind. To the fullest extent the law allows, Mercity is not liable for indirect, incidental or consequential losses, or for charges from your own providers, and our total liability for any claim is limited to the amount you paid us for Heckler in the 12 months before it.
            </p>
          ),
        },
        {
          title: 'Changes to these terms',
          body: <p>If we change these terms we will update this page and the date at the top. Continuing to use Heckler after a change means you accept the new terms.</p>,
        },
        {
          title: 'Contact',
          body: (
            <p>
              Questions about these terms: <Mail />.
            </p>
          ),
        },
      ]}
    />
  )
}
