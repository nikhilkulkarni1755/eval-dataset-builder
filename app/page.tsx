import Link from 'next/link'

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="border-b border-gray-100 px-6 py-4 flex items-center justify-between max-w-6xl mx-auto">
        <div className="font-semibold text-gray-900 text-lg">Eval Dataset Builder</div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-gray-600 hover:text-gray-900">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="text-sm bg-gray-900 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-full px-4 py-1.5 text-sm text-gray-600 mb-8">
          <span className="w-2 h-2 rounded-full bg-green-500 inline-block"></span>
          $49/mo — generate up to 1,000 labeled examples
        </div>

        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          Build your LLM eval dataset<br />in hours, not weeks.
        </h1>

        <p className="text-xl text-gray-500 max-w-2xl mx-auto mb-10">
          Paste your schema and 5 seed examples. We generate 200–500 diverse, labeled evaluation
          examples using Claude. Ship evals that actually catch regressions.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/signup"
            className="bg-gray-900 text-white px-8 py-3.5 rounded-xl text-base font-medium hover:bg-gray-700 transition-colors"
          >
            Start building — $49/mo
          </Link>
          <Link href="/login" className="text-gray-500 hover:text-gray-900 text-base">
            Already have an account?
          </Link>
        </div>
      </main>

      {/* How it works */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-gray-100">
        <h2 className="text-2xl font-semibold text-gray-900 text-center mb-12">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {[
            { step: '1', title: 'Paste your schema', desc: 'Drop in a sample JSON object. We extract fields and infer types automatically.' },
            { step: '2', title: 'Add seed examples', desc: 'Provide 3–10 examples to establish quality and format expectations.' },
            { step: '3', title: 'Review diversity axes', desc: 'Claude identifies 5–8 axes of variation. Edit or confirm them.' },
            { step: '4', title: 'Generate & label', desc: 'Get 50–500 examples with proposed labels. Accept, reject, or edit in a fast keyboard-driven UI.' },
          ].map(({ step, title, desc }) => (
            <div key={step} className="text-center">
              <div className="w-10 h-10 rounded-full bg-gray-900 text-white flex items-center justify-center text-sm font-semibold mx-auto mb-4">
                {step}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section className="max-w-lg mx-auto px-6 py-16">
        <div className="border border-gray-200 rounded-2xl p-8 text-center">
          <div className="text-4xl font-bold text-gray-900 mb-1">$49</div>
          <div className="text-gray-500 mb-6">per month</div>
          <ul className="text-sm text-gray-600 space-y-3 text-left mb-8">
            {[
              'Up to 1,000 examples/month',
              'Unlimited projects',
              'Axis extraction with Claude',
              'JSONL, CSV, HuggingFace, LangSmith export',
              'Keyboard-driven labeling UI',
              '$10 per 500 examples over limit',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <svg className="w-4 h-4 text-green-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {feature}
              </li>
            ))}
          </ul>
          <Link
            href="/signup"
            className="block w-full bg-gray-900 text-white py-3 rounded-xl font-medium hover:bg-gray-700 transition-colors"
          >
            Get started
          </Link>
        </div>
      </section>
    </div>
  )
}
