"use client"

import { useState, useEffect } from "react"
import {
  RISK_QUESTIONS,
  computeRiskScore,
  getRiskCategory,
  RISK_CATEGORY_META,
  RiskCategory,
  RecommendedFund,
} from "@/lib/risk-engine"

export interface RiskProfile {
  answers: { q1: number; q2: number; q3: number; q4: number }
  score: number
  category: RiskCategory
  funds: RecommendedFund[]
  timestamp: number
}

interface Props {
  /** Called after questionnaire + API call completes */
  onComplete: (profile: RiskProfile) => void
  /** Jump straight to portfolio with default funds */
  onSkip: () => void
}

type Stage = 'questions' | 'computing' | 'result'

export function RiskQuestionnaire({ onComplete, onSkip }: Props) {
  const [currentQ, setCurrentQ]     = useState(0)
  const [answers, setAnswers]       = useState<Partial<{ q1: number; q2: number; q3: number; q4: number }>>({})
  const [stage, setStage]           = useState<Stage>('questions')
  const [animOut, setAnimOut]       = useState(false)
  const [score, setScore]           = useState(0)
  const [category, setCategory]     = useState<RiskCategory>('Balanced')
  const [funds, setFunds]           = useState<RecommendedFund[]>([])
  const [apiError, setApiError]     = useState<string | null>(null)
  // score bar animation
  const [barWidth, setBarWidth]     = useState(0)

  useEffect(() => {
    if (stage === 'result') {
      setTimeout(() => setBarWidth(score), 80)
    }
  }, [stage, score])

  const q = RISK_QUESTIONS[currentQ]

  function animateNext(cb: () => void) {
    setAnimOut(true)
    setTimeout(() => { setAnimOut(false); cb() }, 220)
  }

  async function handleAnswer(value: number) {
    if (animOut) return
    const key = q.key
    const newAnswers = { ...answers, [key]: value } as { q1: number; q2: number; q3: number; q4: number }
    setAnswers(newAnswers)

    if (currentQ < RISK_QUESTIONS.length - 1) {
      animateNext(() => setCurrentQ(i => i + 1))
      return
    }

    // Last question answered → compute + call API
    const finalScore    = computeRiskScore(newAnswers)
    const finalCategory = getRiskCategory(finalScore)
    setScore(finalScore)
    setCategory(finalCategory)
    setStage('computing')

    try {
      const res  = await fetch('/api/recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAnswers),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Recommendation failed')
      setFunds(data.funds)
      setStage('result')
    } catch (e) {
      setApiError(e instanceof Error ? e.message : 'Something went wrong')
      setStage('result')
    }
  }

  function handleBack() {
    if (currentQ > 0) animateNext(() => setCurrentQ(i => i - 1))
  }

  function handleRetake() {
    setCurrentQ(0)
    setAnswers({})
    setStage('questions')
    setApiError(null)
    setBarWidth(0)
  }

  function handleProceed() {
    if (!funds.length) { onSkip(); return }
    const profile: RiskProfile = {
      answers: answers as { q1: number; q2: number; q3: number; q4: number },
      score,
      category,
      funds,
      timestamp: Date.now(),
    }
    onComplete(profile)
  }

  const meta     = RISK_CATEGORY_META[category]
  const progress = ((currentQ + 1) / RISK_QUESTIONS.length) * 100

  /* ──────────────────────── COMPUTING SCREEN ───────────────────────── */
  if (stage === 'computing') {
    return (
      <div style={pageWrap}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' as const }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            border: '3px solid rgba(12,14,19,.10)', borderTopColor: '#0C0E13',
            animation: 'spin .75s linear infinite', margin: '0 auto 22px',
          }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Building your portfolio…
          </h2>
          <p style={{ fontSize: 13.5, color: 'rgba(12,14,19,.45)', lineHeight: 1.6 }}>
            Analysing {RISK_CATEGORY_META[category].icon} <strong>{category}</strong> risk profile across{' '}
            NSE index performance data.
          </p>
        </div>
      </div>
    )
  }

  /* ──────────────────────── RESULT SCREEN ──────────────────────────── */
  if (stage === 'result') {
    return (
      <div style={pageWrap}>
        <div style={{ width: '100%', maxWidth: 520 }}>

          {/* Result card */}
          <div style={{
            background: '#ffffff',
            border: `2px solid ${meta.border}`,
            borderRadius: 22, padding: '36px 32px',
          }}>
            <div style={{ textAlign: 'center' as const, marginBottom: 28 }}>
              <div style={{ fontSize: 44, marginBottom: 14 }}>{meta.icon}</div>
              <div style={{
                fontSize: 10, fontWeight: 800, letterSpacing: '1.5px',
                textTransform: 'uppercase' as const, color: meta.color, marginBottom: 6,
              }}>
                Your Risk Profile
              </div>
              <h2 style={{
                fontFamily: "var(--font-serif,'Instrument Serif',Georgia,serif)",
                fontSize: 38, fontWeight: 400, color: meta.color,
                letterSpacing: '-.6px', marginBottom: 10,
              }}>
                {category}
              </h2>

              {/* Score bar */}
              <div style={{ margin: '0 auto 16px', maxWidth: 380 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 11, color: 'rgba(12,14,19,.3)' }}>Conservative</span>
                  <span style={{
                    fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: meta.color,
                  }}>
                    Score {score} / 100
                  </span>
                  <span style={{ fontSize: 11, color: 'rgba(12,14,19,.3)' }}>Aggressive</span>
                </div>
                <div style={{ height: 6, background: 'rgba(12,14,19,.08)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: `linear-gradient(90deg,${meta.color},#22c55e)`,
                    width: `${barWidth}%`, transition: 'width 0.7s cubic-bezier(.4,0,.2,1)',
                  }} />
                </div>
              </div>

              <p style={{ fontSize: 13.5, color: 'rgba(12,14,19,.55)', lineHeight: 1.65, maxWidth: 380, margin: '0 auto' }}>
                {meta.description}
              </p>
            </div>

            {/* Selected funds preview */}
            {funds.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '1.2px',
                  textTransform: 'uppercase' as const, color: 'rgba(12,14,19,.3)', marginBottom: 10,
                }}>
                  Recommended Portfolio
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 7 }}>
                  {funds.map((f) => (
                    <div key={f.id} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      background: meta.bg, border: `1px solid ${meta.border}`,
                      borderRadius: 10, padding: '10px 13px',
                    }}>
                      {/* Weight pill */}
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
                        color: meta.color, background: '#ffffff',
                        padding: '2px 7px', borderRadius: 5, flexShrink: 0,
                        border: `1px solid ${meta.border}`,
                      }}>
                        {f.weight.toFixed(0)}%
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0C0E13', lineHeight: 1.3 }}>
                          {toTitleCase(f.name)}
                        </div>
                        <div style={{ fontSize: 10.5, color: 'rgba(12,14,19,.4)', marginTop: 1 }}>{f.reason}</div>
                      </div>
                      {/* Key metric */}
                      <div style={{ textAlign: 'right' as const, flexShrink: 0 }}>
                        <div style={{
                          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                          color: '#0A7C4E',
                        }}>
                          {f.scoreBreakdown[0].value}
                        </div>
                        <div style={{ fontSize: 9.5, color: 'rgba(12,14,19,.35)' }}>10Y CAGR</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {apiError && (
              <div style={{
                background: '#FEF2F2', border: '1px solid rgba(197,39,30,.2)',
                borderRadius: 8, padding: '10px 14px', marginBottom: 16,
                fontSize: 12.5, color: '#C5271E',
              }}>
                Could not load recommendations — {apiError}. Proceeding with the default portfolio.
              </div>
            )}

            {/* CTAs */}
            <button
              onClick={handleProceed}
              style={{
                width: '100%', padding: '14px', borderRadius: 12,
                background: '#0C0E13', color: '#ffffff',
                fontSize: 15, fontWeight: 700, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                marginBottom: 10,
              }}
            >
              Build My Portfolio
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              onClick={handleRetake}
              style={{
                width: '100%', padding: '11px', borderRadius: 12,
                background: 'none', color: 'rgba(12,14,19,.4)',
                fontSize: 13, fontWeight: 500,
                border: '1px solid rgba(12,14,19,.10)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Retake questionnaire
            </button>
          </div>
        </div>
      </div>
    )
  }

  /* ──────────────────────── QUESTION SCREEN ────────────────────────── */
  const opts = q.options

  return (
    <div style={pageWrap}>
      <div style={{ width: '100%', maxWidth: 520 }}>

        {/* Top bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', marginBottom: 28,
        }}>
          <div>
            <h1 style={{
              fontFamily: "var(--font-serif,'Instrument Serif',Georgia,serif)",
              fontSize: 21, fontWeight: 400, color: '#0C0E13', marginBottom: 2,
            }}>
              Risk Profile
            </h1>
            <p style={{ fontSize: 12, color: 'rgba(12,14,19,.38)' }}>
              {RISK_QUESTIONS.length} quick questions to personalise your portfolio
            </p>
          </div>
          <button
            onClick={onSkip}
            style={{
              fontSize: 12.5, color: 'rgba(12,14,19,.35)', background: 'none',
              border: '1px solid rgba(12,14,19,.12)', borderRadius: 8,
              padding: '6px 12px', cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Skip →
          </button>
        </div>

        {/* Progress */}
        <div style={{ height: 3, background: 'rgba(12,14,19,.07)', borderRadius: 2, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 2,
            background: 'linear-gradient(90deg,#1A56DB,#22c55e)',
            width: `${progress}%`, transition: 'width 0.3s ease',
          }} />
        </div>

        {/* Question card */}
        <div style={{
          background: '#ffffff', border: '1px solid rgba(12,14,19,.12)',
          borderRadius: 20, padding: '30px 26px',
          opacity: animOut ? 0 : 1,
          transform: animOut ? 'translateY(6px)' : 'none',
          transition: 'opacity 0.22s ease, transform 0.22s ease',
        }}>
          <div style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '1.4px',
            textTransform: 'uppercase' as const, color: '#1A56DB', marginBottom: 14,
          }}>
            Question {currentQ + 1} of {RISK_QUESTIONS.length}
          </div>

          <div style={{ fontSize: 26, marginBottom: 8 }}>{q.icon}</div>
          <h2 style={{
            fontSize: 19, fontWeight: 700, color: '#0C0E13',
            letterSpacing: '-.25px', lineHeight: 1.3, marginBottom: 6,
          }}>
            {q.title}
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(12,14,19,.42)', lineHeight: 1.55, marginBottom: 22 }}>
            {q.subtitle}
          </p>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 9 }}>
            {opts.map((opt, i) => {
              const selected = answers[q.key] === opt.value
              return (
                <button
                  key={i}
                  onClick={() => handleAnswer(opt.value)}
                  style={{
                    padding: '13px 16px', borderRadius: 11, cursor: 'pointer',
                    textAlign: 'left' as const, fontSize: 14, fontWeight: 500,
                    fontFamily: 'inherit', transition: 'all 0.13s',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                    background: selected ? '#EBF0FF' : '#F5F5F3',
                    border: `1.5px solid ${selected ? '#1A56DB' : 'rgba(12,14,19,.07)'}`,
                    color: selected ? '#1A56DB' : '#0C0E13',
                  }}
                >
                  {opt.label}
                  {selected && (
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
                      <circle cx="8" cy="8" r="7.5" fill="#1A56DB" />
                      <path d="M4.5 8l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              )
            })}
          </div>

          {currentQ > 0 && (
            <button
              onClick={handleBack}
              style={{
                marginTop: 18, fontSize: 12.5, color: 'rgba(12,14,19,.38)',
                background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: 'inherit', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M9 6.5H4M6.5 4L4 6.5l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Back
            </button>
          )}
        </div>

        {/* Step dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 7, marginTop: 20 }}>
          {RISK_QUESTIONS.map((_, i) => (
            <div key={i} style={{
              width: i === currentQ ? 20 : 7, height: 7, borderRadius: 4,
              background: i <= currentQ ? '#1A56DB' : 'rgba(12,14,19,.12)',
              transition: 'all 0.3s ease',
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Utility ─────────────────────────────────────────────────────────────────
const pageWrap: React.CSSProperties = {
  minHeight: '100vh', background: '#F5F5F3',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: '32px 20px',
}

function toTitleCase(str: string) {
  return str.replace(/\b\w+\b/g, w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}
