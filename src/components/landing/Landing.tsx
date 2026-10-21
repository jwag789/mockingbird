import { Accordion } from "@tessera/react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { RevealOnScroll } from "./RevealOnScroll";
import "./landing.css";

const START = "/sign-in?mode=sign-up&next=/new";

export function Landing() {
  return (
    <div className="lp">
      <RevealOnScroll />

      <nav className="lp-nav" aria-label="Main">
        <Link href="/" className="lp-nav-logo" aria-label="Mockingbird home">
          <Logo height={38} />
        </Link>
        <div className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <div className="lp-nav-cta">
          <Link href="/sign-in" className="lp-link">
            Sign in
          </Link>
          <Link href={START} className="lp-btn lp-btn-primary lp-btn-sm">
            Start free
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="lp-hero">
        <div className="lp-hero-glow" aria-hidden />
        <div className="lp-hero-copy">
          <span className="lp-pill">
            <span className="lp-pill-dot" aria-hidden /> AI mock interviews · voice or text
          </span>
          <h1>
            Walk into your interview like it&rsquo;s <span className="lp-underline">the second time</span>.
          </h1>
          <p className="lp-lede">
            A realistic mock interview built from your resume and the real job post. It pushes back when you&rsquo;re
            vague, scores every answer with your own words as evidence, and builds the practice that proves you got
            better.
          </p>
          <div className="lp-hero-ctas">
            <Link href={START} className="lp-btn lp-btn-primary">
              Start your free interview
            </Link>
            <a href="#how" className="lp-btn lp-btn-ghost">
              See how it works
            </a>
          </div>
          <p className="lp-fineprint">Free to try · No credit card · About 10 minutes</p>
        </div>

        <div className="lp-stage" aria-hidden>
          <div className="lp-card lp-card-interview">
            <div className="lp-card-head">
              <span className="lp-live">
                <i /> Live
              </span>
              <span>Behavioral · 04:12</span>
            </div>
            <p className="lp-bubble lp-bubble-them">Tell me about a time an AI feature you shipped went wrong for users.</p>
            <p className="lp-bubble lp-bubble-you">
              We looked at the outputs a lot and <u>kind of</u> iterated on the prompts until it got better.
            </p>
            <div className="lp-followup">
              <span className="lp-typing">
                <i />
                <i />
                <i />
              </span>
              <p className="lp-bubble lp-bubble-them lp-bubble-follow">
                What did <em>you</em> change, and how did you know it worked?
              </p>
            </div>
          </div>

          <div className="lp-card lp-card-score">
            <span className="lp-card-label">Impact</span>
            <div className="lp-score">
              <span className="lp-score-before">2</span>
              <span className="lp-arrow">→</span>
              <strong>4</strong>
              <span className="lp-score-of">/ 5</span>
            </div>
            <span className="lp-win">+2 vs your interview</span>
            <div className="lp-minibars">
              <i style={{ width: "80%" }} />
              <i style={{ width: "62%" }} />
              <i style={{ width: "90%" }} />
            </div>
          </div>

          <div className="lp-card lp-card-wave">
            <span className="lp-play" />
            <div className="lp-wave">
              {Array.from({ length: 28 }, (_, i) => (
                <i key={i} style={{ animationDelay: `${(i % 7) * 110}ms`, height: `${30 + ((i * 37) % 60)}%` }} />
              ))}
            </div>
            <span className="lp-time">0:42</span>
          </div>
        </div>
      </header>

      {/* Facts: real product numbers only */}
      <section className="lp-facts" aria-label="Mockingbird at a glance" data-reveal>
        <div>
          <strong>3.2s</strong>
          <span>median reply in voice mode</span>
        </div>
        <div>
          <strong>5</strong>
          <span>scoring dimensions, every one with quotes</span>
        </div>
        <div>
          <strong>12</strong>
          <span>competencies tracked in your story bank</span>
        </div>
        <div>
          <strong>0</strong>
          <span>made-up links: every resource is verified</span>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="lp-section">
        <div className="lp-section-head" data-reveal>
          <span className="lp-eyebrow">How it works</span>
          <h2>Ten minutes. Three steps. A plan you&rsquo;ll actually use.</h2>
        </div>
        <ol className="lp-steps">
          <li data-reveal>
            <span className="lp-step-num">1</span>
            <h3>Paste the job and your resume</h3>
            <p>
              Mockingbird reads both and plans the interview that hiring manager would run, aimed at the places your
              resume looks thin for this role.
            </p>
            <div className="lp-mini lp-mini-plan">
              <span>
                <b>Gap</b> Evaluating LLM output quality
              </span>
              <span>
                <b>Gap</b> Job queues and retries
              </span>
              <span>
                <b className="lp-ok">Strong</b> React and TypeScript
              </span>
            </div>
          </li>
          <li data-reveal>
            <span className="lp-step-num">2</span>
            <h3>Interview out loud or by typing</h3>
            <p>
              Answer like it&rsquo;s real. The interviewer listens, follows up when you&rsquo;re vague, and keeps time
              like a real panel.
            </p>
            <div className="lp-mini lp-mini-voice">
              <span className="lp-live">
                <i /> Listening
              </span>
              <div className="lp-wave lp-wave-sm">
                {Array.from({ length: 16 }, (_, i) => (
                  <i key={i} style={{ animationDelay: `${(i % 5) * 120}ms`, height: `${35 + ((i * 29) % 55)}%` }} />
                ))}
              </div>
            </div>
          </li>
          <li data-reveal>
            <span className="lp-step-num">3</span>
            <h3>Get a scorecard and a practice plan</h3>
            <p>
              Every answer scored with quotes from what you said, then drills and resources aimed at exactly what held
              you back.
            </p>
            <div className="lp-mini lp-mini-score">
              <strong>3.4</strong>
              <span>/ 5 readiness</span>
              <span className="lp-win lp-win-sm">↑ 0.8</span>
            </div>
          </li>
        </ol>
      </section>

      {/* Features */}
      <section id="features" className="lp-section lp-features">
        <div className="lp-section-head" data-reveal>
          <span className="lp-eyebrow">Why it works</span>
          <h2>Built to change how you answer, not just to grade you.</h2>
        </div>

        <article className="lp-feature" data-reveal>
          <div className="lp-feature-copy">
            <span className="lp-tag">Follow-ups</span>
            <h3>It pushes back like a real hiring manager.</h3>
            <p>
              Vague answer? It digs in. Said &ldquo;we&rdquo; the whole time? It asks what <em>you</em> did. No number?
              It asks how you knew it worked. The pressure is the practice.
            </p>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-panel">
              <p className="lp-bubble lp-bubble-you">
                We moved the team to React and it went a lot better.
              </p>
              <p className="lp-bubble lp-bubble-them">
                What did you personally do to get them there, and what changed as a result?
              </p>
              <p className="lp-bubble lp-bubble-you">
                I ran weekly pairing sessions. Pages that took a week took a day, and regressions halved.
              </p>
            </div>
          </div>
        </article>

        <article className="lp-feature lp-feature-flip" data-reveal>
          <div className="lp-feature-copy">
            <span className="lp-tag">Evidence</span>
            <h3>Every score comes with receipts.</h3>
            <p>
              Structure, specificity, ownership, impact and relevance, scored against the role. Each score cites your own
              words, and any quote that doesn&rsquo;t match what you said is thrown out.
            </p>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-panel">
              <div className="lp-dim">
                <span>Impact</span>
                <span className="lp-badge lp-badge-low">2 / 5</span>
              </div>
              <p className="lp-muted">The outcome is real but never measured, so it&rsquo;s hard to believe.</p>
              <blockquote className="lp-quote">&ldquo;It got a lot better over time.&rdquo;</blockquote>
              <div className="lp-dim">
                <span>Ownership</span>
                <span className="lp-badge lp-badge-ok">4 / 5</span>
              </div>
              <blockquote className="lp-quote">&ldquo;I traced it to the model reading sarcasm as a commitment.&rdquo;</blockquote>
            </div>
          </div>
        </article>

        <article className="lp-feature" data-reveal>
          <div className="lp-feature-copy">
            <span className="lp-tag">Practice plans</span>
            <h3>Practice that proves you got better.</h3>
            <p>
              After each interview you get a short plan: drills that re-ask your own questions with one constraint,
              design challenges, and recent, highly rated videos and articles. Every link is checked. Drills are re-scored
              against your interview score, so you see the improvement.
            </p>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-panel lp-drill">
              <span className="lp-chip">Drill · Quantifying impact</span>
              <h4>Re-answer the migration story with one hard number</h4>
              <div className="lp-drill-result">
                <span className="lp-score-before">2</span>
                <span className="lp-arrow">→</span>
                <strong>4</strong>
                <span className="lp-win lp-win-sm">+2 vs interview</span>
              </div>
              <p className="lp-muted">You named a measurable outcome: delivery went from five days to one.</p>
            </div>
          </div>
        </article>

        <article className="lp-feature lp-feature-flip" data-reveal>
          <div className="lp-feature-copy">
            <span className="lp-tag">Playback</span>
            <h3>Hear what the interviewer heard.</h3>
            <p>
              Play back every spoken answer with a live transcript. Filler words and hedges are marked, and the quotes
              behind your score are highlighted. Click any word to jump there.
            </p>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-panel">
              <div className="lp-player">
                <span className="lp-play" />
                <div className="lp-track">
                  <i />
                </div>
                <span className="lp-time">0:08 / 0:16</span>
              </div>
              <p className="lp-transcript">
                <span className="lp-said">So</span> <span className="lp-said lp-filler">um</span>{" "}
                <span className="lp-said lp-hedge">I think</span> <span className="lp-said">the</span>{" "}
                <span className="lp-said lp-q">alerts were noisy at first</span>{" "}
                <span className="lp-now">so</span> I added a rule that both commitments get quoted from the source.
              </p>
              <div className="lp-legend">
                <span>
                  <i className="lp-key-q" /> quoted in your score
                </span>
                <span>
                  <i className="lp-key-f" /> filler
                </span>
                <span>
                  <i className="lp-key-h" /> hedge
                </span>
              </div>
            </div>
          </div>
        </article>

        <article className="lp-feature" data-reveal>
          <div className="lp-feature-copy">
            <span className="lp-tag">Story bank</span>
            <h3>Know which story to tell.</h3>
            <p>
              Mockingbird files the real stories you tell into a story bank, tracks how well each one lands, and shows
              which competencies still have no story before the real thing.
            </p>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-coverage">
              {[
                ["Leadership", "The React migration", "3.8"],
                ["Ownership", "The sarcasm-alert fix", "4.2"],
                ["Conflict", null, null],
                ["Impact", "The developer library", "3.6"],
                ["Failure", null, null],
                ["Influence", "Pairing sessions", "3.4"],
              ].map(([name, story, score]) => (
                <div key={name} className="lp-cov" data-missing={!story}>
                  <span className="lp-cov-name">{name}</span>
                  {story ? (
                    <span className="lp-cov-story">
                      {story} <b>{score}</b>
                    </span>
                  ) : (
                    <span className="lp-muted">Prep a story</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </article>

        <article className="lp-feature lp-feature-flip" data-reveal>
          <div className="lp-feature-copy">
            <span className="lp-tag">Your real interview</span>
            <h3>Paced to the day you walk in.</h3>
            <p>
              Tell Mockingbird when the real interview is. Your dashboard counts down, tracks your readiness across
              interviews, and paces your practice so you peak on the day.
            </p>
          </div>
          <div className="lp-feature-visual">
            <div className="lp-panel lp-countdown">
              <span className="lp-card-label">Your real interview</span>
              <div className="lp-count">
                <strong>9</strong>
                <span>days to go</span>
              </div>
              <p>
                <b>Senior Full-Stack Engineer</b> at Northwind
              </p>
              <p className="lp-muted">10 tasks left: about 2 a day gets you there with time to spare.</p>
              <svg viewBox="0 0 200 48" className="lp-spark" aria-hidden>
                <path d="M4 40 L52 34 L100 30 L148 18 L196 10" />
                <circle cx="196" cy="10" r="4" />
              </svg>
            </div>
          </div>
        </article>
      </section>

      {/* Pricing */}
      <section id="pricing" className="lp-section">
        <div className="lp-section-head" data-reveal>
          <span className="lp-eyebrow">Pricing</span>
          <h2>Practice for the search you&rsquo;re in.</h2>
          <p className="lp-lede lp-lede-center">Start free. Upgrade when the real interview is on the calendar.</p>
        </div>
        <div className="lp-plans">
          <div className="lp-plan" data-reveal>
            <h3>Free</h3>
            <p className="lp-price">
              <strong>$0</strong>
            </p>
            <p className="lp-muted">See what it&rsquo;s like.</p>
            <ul>
              <li>One full mock interview</li>
              <li>Scorecard with quoted evidence</li>
              <li>Your first practice plan</li>
            </ul>
            <Link href={START} className="lp-btn lp-btn-ghost lp-btn-block">
              Start free
            </Link>
          </div>
          <div className="lp-plan lp-plan-featured" data-reveal>
            <span className="lp-plan-flag">Most popular</span>
            <h3>Interview Sprint</h3>
            <p className="lp-price">
              <strong>$29</strong> <span>for 14 days</span>
            </p>
            <p className="lp-muted">For when the interview is booked.</p>
            <ul>
              <li>Unlimited voice and text interviews</li>
              <li>Practice plans, drills and challenges</li>
              <li>Playback, story bank and countdown</li>
              <li>No subscription to cancel</li>
            </ul>
            <Link href={START} className="lp-btn lp-btn-primary lp-btn-block">
              Start your sprint
            </Link>
          </div>
          <div className="lp-plan" data-reveal>
            <h3>Monthly</h3>
            <p className="lp-price">
              <strong>$19</strong> <span>/ month</span>
            </p>
            <p className="lp-muted">For longer searches.</p>
            <ul>
              <li>Everything in Sprint</li>
              <li>Progress tracked across months</li>
              <li>Cancel anytime</li>
            </ul>
            <Link href={START} className="lp-btn lp-btn-ghost lp-btn-block">
              Go monthly
            </Link>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="lp-section lp-faq">
        <div className="lp-section-head" data-reveal>
          <span className="lp-eyebrow">Questions</span>
          <h2>The fine print, up front.</h2>
        </div>
        <div data-reveal>
          <Accordion
            type="single"
            items={[
              {
                id: "who",
                title: "Is there a person on the other side?",
                content:
                  "No. Mockingbird is an AI interviewer. It plans questions from your resume and the job description, listens to your answers, follows up, and scores them against a fixed rubric.",
              },
              {
                id: "roles",
                title: "What kinds of roles does it work for?",
                content:
                  "Anything with behavioral and role-specific questions: engineering, product, design, data and more. Questions come from the job post you paste, so they fit the role you're actually going for.",
              },
              {
                id: "scoring",
                title: "How is the scoring done?",
                content:
                  "Each answer is scored from 1 to 5 on structure, specificity, ownership, impact and relevance, with fixed anchors for each level. Every score cites quotes from your answer, and quotes that don't match your words exactly are discarded. Filler words, hedges and pace are counted, not guessed.",
              },
              {
                id: "voice",
                title: "Do I have to talk out loud?",
                content:
                  "No. You can answer by typing, speaking, or switch mid-interview. Speaking is better practice, and it unlocks playback and pace.",
              },
              {
                id: "data",
                title: "What happens to my resume and recordings?",
                content:
                  "They're used to run your interviews and practice, and nothing else. Spoken answers are stored so you can play them back. Delete an interview and its recordings go with it.",
              },
            ]}
          />
        </div>
      </section>

      {/* Final CTA */}
      <section className="lp-final" data-reveal>
        <div className="lp-final-glow" aria-hidden />
        <h2>Your next interview should be a rerun.</h2>
        <p>Do it once with Mockingbird. Walk into the real one already knowing how it goes.</p>
        <Link href={START} className="lp-btn lp-btn-light">
          Start your free interview
        </Link>
      </section>

      <footer className="lp-footer">
        <Logo height={28} />
        <span>© 2026 Mockingbird</span>
        <div>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <Link href="/sign-in">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
