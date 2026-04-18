import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toBlob } from 'html-to-image'
import {
  THEORIES,
  classify,
  stampFor,
  generateCaseId,
  mulberry32,
  PERSONALITY_QUESTIONS,
  computePersonalityBonus,
} from './theories.js'

// ========== Persistence ==========
const STORAGE_KEY = 'le-vada:history:v1'
const MAX_HISTORY = 12

const loadHistory = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const persistHistory = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* storage full or unavailable — fine */
  }
}

// ========== Helpers ==========
const makeThumbnail = (dataUrl, size = 160) =>
  new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      const s = Math.min(img.width, img.height)
      const sx = (img.width - s) / 2
      const sy = (img.height - s) / 2
      ctx.drawImage(img, sx, sy, s, s, 0, 0, size, size)
      resolve(canvas.toDataURL('image/jpeg', 0.72))
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })

const hashBytesFromFile = async (file) => {
  const arr = await file.arrayBuffer()
  const hashBuf = await crypto.subtle.digest('SHA-256', arr)
  return new Uint8Array(hashBuf)
}

const todayStamp = () =>
  new Date()
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .toUpperCase()

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

// ========== Root component ==========
export default function App() {
  const [screen, setScreen] = useState('intro') // intro | upload | analysis | reveal | result
  const [caseId, setCaseId] = useState(null)
  const [photoDataUrl, setPhotoDataUrl] = useState(null)
  const [result, setResult] = useState(null) // { overall, scores, classification, theoryData }
  const [history, setHistory] = useState([])
  const [historyOpen, setHistoryOpen] = useState(false)
  const [personalityBonus, setPersonalityBonus] = useState(null)
  const [originalOverall, setOriginalOverall] = useState(null)

  useEffect(() => {
    setHistory(loadHistory())
  }, [])

  const beginAssessment = () => {
    setCaseId(generateCaseId())
    setScreen('upload')
  }

  const handlePhoto = async (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please submit an image file.')
      return
    }

    const reader = new FileReader()
    reader.onload = async (e) => {
      const dataUrl = e.target.result
      setPhotoDataUrl(dataUrl)

      const hashBytes = await hashBytesFromFile(file)

      // Deterministic subscores from the file hash.
      const scores = THEORIES.map((_, i) => {
        const b = hashBytes[(i * 13 + 7) % hashBytes.length]
        return Math.round((b / 255) * 100)
      })
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length
      // Gently widen the distribution so scores don't bunch in the 40-60 range.
      const amped = 50 + (avg - 50) * 1.45
      const overall = Math.max(3, Math.min(99, Math.round(amped)))

      // Seed for measurement blurbs
      const seed =
        (hashBytes[0] << 24) | (hashBytes[1] << 16) | (hashBytes[2] << 8) | hashBytes[3]

      const theoryData = THEORIES.map((t, i) => {
        const rng = mulberry32(seed + i * 97 + 41)
        return {
          key: t.key,
          name: t.name,
          source: t.source,
          score: scores[i],
          measure: t.measure(rng),
          blurb: t.blurb(scores[i]),
        }
      })

      const cls = classify(overall)

      setResult({
        overall,
        scores,
        theoryData,
        classification: cls.label,
        note: cls.note,
      })

      setScreen('analysis')
    }
    reader.readAsDataURL(file)
  }

  const handleAnalysisComplete = useCallback(async () => {
    if (!result || !photoDataUrl) return
    // Persist entry
    const thumb = await makeThumbnail(photoDataUrl)
    const entry = {
      caseId,
      date: todayStamp(),
      iso: new Date().toISOString(),
      overall: result.overall,
      classification: result.classification,
      thumb,
    }
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, MAX_HISTORY)
      persistHistory(next)
      return next
    })
    setScreen('reveal')
  }, [result, photoDataUrl, caseId])

  const handleRevealComplete = useCallback(() => {
    setScreen('result')
  }, [])

  const handleStartPersonality = () => setScreen('personality')

  const handlePersonalityComplete = (answers) => {
    const bonus = computePersonalityBonus(answers)
    setPersonalityBonus(bonus)
    setOriginalOverall(result.overall)
    const revised = Math.min(99, result.overall + bonus)
    const cls = classify(revised)
    setResult((prev) => ({
      ...prev,
      overall: revised,
      classification: cls.label,
      note: cls.note,
    }))
    setHistory((prev) => {
      const updated = prev.map((h) =>
        h.caseId === caseId
          ? { ...h, overall: revised, classification: cls.label }
          : h
      )
      persistHistory(updated)
      return updated
    })
    setScreen('result')
  }

  const restart = () => {
    setPhotoDataUrl(null)
    setResult(null)
    setCaseId(null)
    setPersonalityBonus(null)
    setOriginalOverall(null)
    setScreen('intro')
  }

  const clearHistory = () => {
    if (confirm('Permanently erase all archived assessments?')) {
      persistHistory([])
      setHistory([])
    }
  }

  return (
    <div className={`app${screen === 'analysis' || screen === 'reveal' ? ' analysis-mode' : ''}`}>
      {screen !== 'analysis' && screen !== 'reveal' && (
        <header className="masthead">
          <div className="crest">⁙ Est · MCMXXIII ⁙</div>
          <h1 className="title">Le Vada</h1>
          <div className="subtitle">
            Institute of Vascular-Erotic Performance Research
          </div>
          <div className="institute-meta">
            Office of Somatic Assessment · Division III
          </div>
        </header>
      )}

      {screen === 'intro' && (
        <IntroScreen
          onBegin={beginAssessment}
          history={history}
          historyOpen={historyOpen}
          onToggleHistory={() => setHistoryOpen((v) => !v)}
          onClearHistory={clearHistory}
        />
      )}

      {screen === 'upload' && (
        <UploadScreen
          caseId={caseId}
          onPhoto={handlePhoto}
          onBack={() => setScreen('intro')}
        />
      )}

      {screen === 'analysis' && result && photoDataUrl && (
        <AnalysisScreen
          caseId={caseId}
          photoDataUrl={photoDataUrl}
          theoryData={result.theoryData}
          overall={result.overall}
          onComplete={handleAnalysisComplete}
        />
      )}

      {screen === 'reveal' && result && (
        <ScoreRevealScreen
          theoryData={result.theoryData}
          overall={result.overall}
          classification={result.classification}
          onComplete={handleRevealComplete}
        />
      )}

      {screen === 'personality' && (
        <PersonalityScreen onComplete={handlePersonalityComplete} />
      )}

      {screen === 'result' && result && (
        <ResultScreen
          caseId={caseId}
          result={result}
          onRestart={restart}
          onStartPersonality={handleStartPersonality}
          personalityBonus={personalityBonus}
          originalOverall={originalOverall}
        />
      )}
    </div>
  )
}

// ============================================================
// Intro
// ============================================================
function IntroScreen({ onBegin, history, historyOpen, onToggleHistory, onClearHistory }) {
  return (
    <section className="screen">
      <p className="intro-body">
        The Institute has, since its founding by Dr. Ambrose Vernier in the year
        1923, catalogued those corporeal indicators alleged to predict masculine
        amorous aptitude. Submit a photograph of any willing subject for a
        somatic assessment drawing upon all extant doctrines — the robust, the
        threadbare, and the wholly apocryphal alike.
      </p>

      <div className="doctrine-card">
        <div className="doctrine-card-heading">Registered Methods of Analysis</div>
        <ul>
          <li><span>Cranio-Facial Width Index</span><span className="src">Arnocky ’17</span></li>
          <li><span>Digitorum Ratio (2D:4D)</span><span className="src">Manning ’98</span></li>
          <li><span>Mandibular Prominence</span><span className="src">T-Hypothesis</span></li>
          <li><span>Pilosebaceous Cultivation</span><span className="src">Grooming Dctrn.</span></li>
          <li><span>Cervico-Humeral Vector</span><span className="src">V-Ratio</span></li>
          <li><span>Ocular Engagement Field</span><span className="src">Pupillometric</span></li>
          <li><span>Canine Cohabitation</span><span className="src">Cox Theorem</span></li>
          <li><span>Ambient Contextual Signal</span><span className="src">Bayesian Folk</span></li>
        </ul>
      </div>

      <button className="btn" onClick={onBegin}>
        Commence Assessment →
      </button>

      <p className="disclaimer">
        ⚠ For amusement only. The doctrines herein are variously weakly
        evidenced, statistically insignificant, or complete folklore. No
        photograph tells you whether anyone is “good in bed.” Please scan only
        photographs of willing participants.
      </p>

      <div className="history-toggle" onClick={onToggleHistory}>
        ◇ {historyOpen ? 'Hide' : 'View'} Prior Assessments ({history.length}) ◇
      </div>

      {historyOpen && (
        <div className="history-list">
          {history.length === 0 ? (
            <div className="history-empty">— no prior assessments on file —</div>
          ) : (
            <>
              {history.map((h) => (
                <div className="history-row" key={h.iso + h.caseId}>
                  {h.thumb ? (
                    <img src={h.thumb} alt="" />
                  ) : (
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        background: 'var(--paper-deep)',
                      }}
                    />
                  )}
                  <div>
                    <div className="hrow-meta hrow-case">{h.caseId}</div>
                    <div className="hrow-cls">
                      {h.classification} · {h.date}
                    </div>
                  </div>
                  <div className="hrow-score">{h.overall}</div>
                </div>
              ))}
              <button className="history-clear" onClick={onClearHistory}>
                ✕ Clear Archive
              </button>
            </>
          )}
        </div>
      )}
    </section>
  )
}

// ============================================================
// Upload
// ============================================================
function UploadScreen({ caseId, onPhoto, onBack }) {
  const inputRef = useRef(null)
  const zoneRef = useRef(null)

  useEffect(() => {
    const zone = zoneRef.current
    if (!zone) return
    const prevent = (e) => {
      e.preventDefault()
      zone.classList.add('drag')
    }
    const leave = (e) => {
      e.preventDefault()
      zone.classList.remove('drag')
    }
    const drop = (e) => {
      e.preventDefault()
      zone.classList.remove('drag')
      if (e.dataTransfer.files[0]) onPhoto(e.dataTransfer.files[0])
    }
    zone.addEventListener('dragover', prevent)
    zone.addEventListener('dragenter', prevent)
    zone.addEventListener('dragleave', leave)
    zone.addEventListener('drop', drop)
    return () => {
      zone.removeEventListener('dragover', prevent)
      zone.removeEventListener('dragenter', prevent)
      zone.removeEventListener('dragleave', leave)
      zone.removeEventListener('drop', drop)
    }
  }, [onPhoto])

  return (
    <section className="screen">
      <div className="case-id">FILE № {caseId}</div>
      <h2 className="screen-heading">Subject Intake</h2>
      <p className="screen-deck">
        Submit one (1) photograph of the subject under assessment. Full-length
        portraits yield richest analysis, though facial or partial photographs
        are entirely acceptable. Your image is processed locally and never
        transmitted.
      </p>

      <label className="upload-zone" ref={zoneRef} htmlFor="file-input">
        <div className="upload-icon">❋</div>
        <div className="upload-label">Attach Photograph</div>
        <div className="upload-hint">JPG · PNG · HEIC · WEBP</div>
      </label>
      <input
        id="file-input"
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={(e) => e.target.files[0] && onPhoto(e.target.files[0])}
      />

      <button className="btn secondary" onClick={onBack}>
        ← Return to Vestibule
      </button>
    </section>
  )
}

// ============================================================
// Analysis — full viewport, no page scroll
// ============================================================
function AnalysisScreen({ caseId, photoDataUrl, theoryData, overall, onComplete }) {
  const readoutRef = useRef(null)
  const [lines, setLines] = useState([])
  const [tagsShown, setTagsShown] = useState(0)
  const [progress, setProgress] = useState(0)

  // Build the full script of readout lines once.
  const script = useMemo(() => {
    const list = []
    list.push({ t: '› initializing optical sensors…', c: 'dim', d: 120 })
    list.push({ t: '› loading doctrines [8/8]  ✓', c: 'pass', d: 360 })
    list.push({ t: '› calibrating to ambient light…', c: 'dim', d: 260 })
    list.push({ t: '› subject focus locked', c: 'pass', d: 320 })
    list.push({ t: ' ', c: 'dim', d: 140 })

    theoryData.forEach((theory, i) => {
      list.push({
        t: `[${String(i + 1).padStart(2, '0')}] ${theory.name.toUpperCase()}`,
        c: 'bright',
        d: 260,
      })
      list.push({ t: `     ${theory.measure}`, c: 'dim', d: 200 })
      list.push({
        t: `     ↳ ${theory.blurb}`,
        c: theory.score > 55 ? 'pass' : theory.score > 30 ? 'warn' : 'fail',
        d: 240,
      })
      list.push({
        t: `     subscore  ${theory.score}/100`,
        c: theory.score > 55 ? 'pass' : theory.score > 30 ? 'warn' : 'fail',
        d: 180,
      })
    })

    list.push({ t: ' ', c: 'dim', d: 180 })
    list.push({ t: '› aggregating subscores…', c: 'dim', d: 340 })
    list.push({ t: '› cross-referencing archive (1923–present)…', c: 'dim', d: 420 })
    list.push({ t: '› composing certificate…', c: 'dim', d: 380 })
    list.push({
      t: `› PERFORMANCE INDEX  →  ${overall}/100`,
      c: 'pass',
      d: 460,
    })
    return list
  }, [theoryData, overall])

  // Stream the lines.
  useEffect(() => {
    const timers = []
    let t = 140
    const total = script.reduce((acc, l) => acc + l.d, 0)

    script.forEach((line, i) => {
      t += line.d
      const pct = Math.min(100, (t / total) * 100)
      timers.push(
        setTimeout(() => {
          setLines((prev) => [...prev, line])
          setProgress(pct)
          // auto-scroll
          requestAnimationFrame(() => {
            const el = readoutRef.current
            if (el) el.scrollTop = el.scrollHeight
          })
        }, t)
      )
    })

    // Reveal measurement tags over the photo
    const tagDelays = [500, 1100, 1700, 2400, 3100]
    tagDelays.forEach((d, i) =>
      timers.push(setTimeout(() => setTagsShown((n) => Math.max(n, i + 1)), d))
    )

    // Transition to result once the script has finished + small beat
    timers.push(setTimeout(() => onComplete(), t + 900))

    return () => timers.forEach(clearTimeout)
  }, [script, onComplete])

  return (
    <section className="analysis">
      <div className="analysis-header">
        <div className="crest">⁙ DIVISION III · OPTICAL ANALYSIS ⁙</div>
        <div className="analysis-title">Assessment in Progress</div>
        <div className="analysis-sub">FILE № {caseId}</div>
      </div>

      <div className="analysis-photo">
        <img src={photoDataUrl} alt="Subject under assessment" />
        <div className="grid-overlay" />
        <div className="crosshair" />
        <div className="scan-line" />
        <div
          className={`measure-tag${tagsShown >= 1 ? ' show' : ''}`}
          style={{ top: '14%', left: '8%' }}
        >
          ZYGOMATIC ARC
        </div>
        <div
          className={`measure-tag${tagsShown >= 2 ? ' show' : ''}`}
          style={{ top: '28%', right: '8%' }}
        >
          GONIAL ∠
        </div>
        <div
          className={`measure-tag${tagsShown >= 3 ? ' show' : ''}`}
          style={{ top: '50%', left: '10%' }}
        >
          ACROMIAL Δ
        </div>
        <div
          className={`measure-tag${tagsShown >= 4 ? ' show' : ''}`}
          style={{ top: '72%', right: '10%' }}
        >
          V-RATIO
        </div>
        <div
          className={`measure-tag${tagsShown >= 5 ? ' show' : ''}`}
          style={{ top: '88%', left: '32%' }}
        >
          POSTURAL VEC
        </div>
      </div>

      <div className="progress-bar">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>

      <div className="readout" ref={readoutRef}>
        <div className="readout-header">◉ LIVE ASSESSMENT · DIV. III TERMINAL</div>
        {lines.map((line, i) => (
          <div key={i} className={`readout-line ${line.c || ''}`}>
            {line.t === ' ' ? '\u00A0' : line.t}
          </div>
        ))}
        <span className="cursor">▌</span>
      </div>
    </section>
  )
}

// ============================================================
// Score Reveal — full-page per theory, then dramatic finale
// ============================================================
function ScoreRevealScreen({ theoryData, overall, classification, onComplete }) {
  // phase: 'cards' → 'buildup' → 'explode'
  const [phase, setPhase] = useState('cards')
  const [cardIndex, setCardIndex] = useState(0)
  const [cardVisible, setCardVisible] = useState(true)
  const [countingScore, setCountingScore] = useState(0)
  const [buildupStage, setBuildupStage] = useState(0) // 0-3 for escalating intensity

  // Card auto-advance
  useEffect(() => {
    if (phase !== 'cards') return
    const timers = []

    // Fade out current card after 1.6s
    timers.push(setTimeout(() => setCardVisible(false), 1600))

    // Advance to next card (or buildup) after 2s
    timers.push(
      setTimeout(() => {
        if (cardIndex < theoryData.length - 1) {
          setCardIndex((i) => i + 1)
          setCardVisible(true)
        } else {
          setPhase('buildup')
        }
      }, 2000)
    )

    return () => timers.forEach(clearTimeout)
  }, [phase, cardIndex, theoryData.length])

  // Buildup phase — escalating intensity
  useEffect(() => {
    if (phase !== 'buildup') return
    const timers = []
    timers.push(setTimeout(() => setBuildupStage(1), 600))
    timers.push(setTimeout(() => setBuildupStage(2), 1400))
    timers.push(setTimeout(() => setBuildupStage(3), 2200))
    timers.push(setTimeout(() => setPhase('explode'), 3000))
    return () => timers.forEach(clearTimeout)
  }, [phase])

  // Explode phase — count up the score, then transition
  useEffect(() => {
    if (phase !== 'explode') return
    const duration = 1800
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 4)
      setCountingScore(Math.round(eased * overall))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setCountingScore(overall)
    }
    raf = requestAnimationFrame(tick)
    const t = setTimeout(() => onComplete(), 4200)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [phase, overall, onComplete])

  const current = theoryData[cardIndex]
  const scoreColor =
    current && current.score > 55 ? 'high' : current && current.score > 30 ? 'mid' : 'low'

  return (
    <section className="reveal">
      {/* Background burst rings for the finale */}
      {phase === 'explode' && (
        <>
          <div className="burst-ring ring-1" />
          <div className="burst-ring ring-2" />
          <div className="burst-ring ring-3" />
          <div className="burst-particles">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className="burst-particle"
                style={{
                  '--angle': `${i * 18}deg`,
                  '--distance': `${80 + (i % 3) * 40}px`,
                  '--delay': `${(i % 5) * 0.06}s`,
                  '--size': `${4 + (i % 4) * 2}px`,
                }}
              />
            ))}
          </div>
        </>
      )}

      {/* Counter at top: "3 of 8" */}
      {phase === 'cards' && (
        <div className="reveal-counter">
          {String(cardIndex + 1).padStart(2, '0')} / {String(theoryData.length).padStart(2, '0')}
        </div>
      )}

      {/* Individual theory card — full page */}
      {phase === 'cards' && current && (
        <div className={`reveal-page${cardVisible ? ' visible' : ''}`} key={cardIndex}>
          <div className="reveal-page-source">{current.source}</div>
          <div className="reveal-page-name">{current.name}</div>
          <div className={`reveal-page-score ${scoreColor}`}>{current.score}</div>
          <div className="reveal-page-bar">
            <div
              className="reveal-page-bar-fill"
              style={cardVisible ? { width: `${current.score}%` } : undefined}
            />
          </div>
          <div className="reveal-page-blurb">{current.blurb}</div>
        </div>
      )}

      {/* Buildup phase */}
      {phase === 'buildup' && (
        <div className={`reveal-buildup stage-${buildupStage}`}>
          <div className="buildup-text">
            {buildupStage === 0 && 'Compiling subscores\u2026'}
            {buildupStage === 1 && 'Cross-referencing archive\u2026'}
            {buildupStage === 2 && 'Consulting Dr. Vernier\u2019s tables\u2026'}
            {buildupStage === 3 && 'The Institute has reached a verdict.'}
          </div>
        </div>
      )}

      {/* Explode — the big reveal */}
      {phase === 'explode' && (
        <div className="reveal-explode">
          <div className="explode-label">Performance Index</div>
          <div className="explode-score">{countingScore}</div>
          <div className="explode-class">{classification}</div>
        </div>
      )}
    </section>
  )
}

// ============================================================
// Personality Test
// ============================================================
function PersonalityScreen({ onComplete }) {
  const [answers, setAnswers] = useState(Array(PERSONALITY_QUESTIONS.length).fill(null))

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  const allAnswered = answers.every((a) => a !== null)

  const select = (qIndex, value) => {
    setAnswers((prev) => {
      const next = [...prev]
      next[qIndex] = value
      return next
    })
  }

  const handleSubmit = () => {
    if (!allAnswered) return
    onComplete(answers)
  }

  return (
    <section className="screen">
      <div className="case-id">Addendum B</div>
      <h2 className="screen-heading">Supplementary Evaluation</h2>
      <p className="screen-deck">
        The following five (5) inquiries probe dimensions of character that
        somatic assessment cannot reach. Answer truthfully; the Institute
        reminds the subject that self-flattery is detectable by trained analysts
        and will be noted in the file.
      </p>

      {PERSONALITY_QUESTIONS.map((q, qi) => (
        <div className="pq-card" key={q.id}>
          <div className="pq-number">
            {String(qi + 1).padStart(2, '0')}
          </div>
          <div className="pq-title">{q.title}</div>
          <div className="pq-prompt">{q.prompt}</div>
          <div className="pq-options">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                className={`pq-option${answers[qi] === opt.value ? ' selected' : ''}`}
                onClick={() => select(qi, opt.value)}
              >
                <span className="pq-option-letter">
                  {String.fromCharCode(97 + oi)}
                </span>
                {opt.text}
              </button>
            ))}
          </div>
        </div>
      ))}

      <button
        className="btn"
        onClick={handleSubmit}
        disabled={!allAnswered}
      >
        Submit Characterological Evidence →
      </button>
    </section>
  )
}

// ============================================================
// Result
// ============================================================
function ResultScreen({ caseId, result, onRestart, onStartPersonality, personalityBonus, originalOverall }) {
  const displayRef = useRef(null)
  const captureRef = useRef(null)
  const [displayScore, setDisplayScore] = useState(0)
  const [shareState, setShareState] = useState('idle') // idle | working | done

  const dateStr = useMemo(() => todayStamp(), [])
  const cls = useMemo(() => classify(result.overall), [result.overall])
  const stamp = useMemo(() => stampFor(result.overall), [result.overall])

  // Count-up animation + scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
    const duration = 1200
    const start = performance.now()
    let raf
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayScore(Math.round(eased * result.overall))
      if (p < 1) raf = requestAnimationFrame(tick)
      else setDisplayScore(result.overall)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [result.overall])

  // Animate theory bars after first paint
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (!displayRef.current) return
      displayRef.current
        .querySelectorAll('.theory-bar-fill')
        .forEach((el, i) => {
          setTimeout(() => {
            el.style.width = el.dataset.target + '%'
          }, 260 + i * 90)
        })
    })
    return () => cancelAnimationFrame(id)
  }, [])

  const handleShare = async () => {
    if (shareState === 'working') return
    setShareState('working')
    try {
      await document.fonts.ready
      // Give layout one extra frame.
      await new Promise((r) => requestAnimationFrame(r))

      const node = captureRef.current
      const blob = await toBlob(node, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#EFE6D2',
        style: { transform: 'none' },
      })
      if (!blob) throw new Error('capture failed')

      const file = new File([blob], `le-vada-${caseId}.png`, {
        type: 'image/png',
      })

      const shareData = {
        files: [file],
        title: 'Le Vada Certificate',
        text: `LE VADA · File № ${caseId} · ${cls.label} · Performance Index ${result.overall}/100`,
      }

      if (navigator.canShare && navigator.canShare(shareData)) {
        try {
          await navigator.share(shareData)
          setShareState('done')
        } catch (err) {
          if (err.name !== 'AbortError') {
            downloadBlob(blob, `le-vada-${caseId}.png`)
            setShareState('done')
          } else {
            setShareState('idle')
          }
        }
      } else {
        downloadBlob(blob, `le-vada-${caseId}.png`)
        setShareState('done')
      }
    } catch (e) {
      console.error(e)
      alert('Could not generate image. Please try again.')
      setShareState('idle')
      return
    }

    setTimeout(() => setShareState('idle'), 1800)
  }

  return (
    <section className="screen">
      <Certificate
        ref={displayRef}
        caseId={caseId}
        dateStr={dateStr}
        displayScore={displayScore}
        result={result}
        cls={cls}
        stamp={stamp}
        personalityBonus={personalityBonus}
        originalOverall={originalOverall}
      />

      {/* Off-screen clone for crisp image capture */}
      <div className="capture-host" aria-hidden="true">
        <Certificate
          ref={captureRef}
          caseId={caseId}
          dateStr={dateStr}
          displayScore={result.overall}
          result={result}
          cls={cls}
          stamp={stamp}
          forCapture
          personalityBonus={personalityBonus}
          originalOverall={originalOverall}
        />
      </div>

      {result.overall < 60 && personalityBonus === null && (
        <div className="personality-offer">
          <div className="personality-offer-heading">Addendum B · Supplementary Evaluation</div>
          <p className="personality-offer-body">
            The Institute acknowledges that somatic indices alone cannot capture
            the full measure of a subject. Certain compensatory virtues —
            punctuality, composure under duress, competence in written
            correspondence — may yet elevate the present assessment. A brief
            characterological supplement is available to those who wish to submit
            additional evidence.
          </p>
          <button className="btn" onClick={onStartPersonality}>
            Proceed to Supplementary Evaluation →
          </button>
        </div>
      )}

      <div className="actions">
        <button className="btn secondary" onClick={onRestart}>
          New Assessment
        </button>
        <button
          className="btn"
          onClick={handleShare}
          disabled={shareState === 'working'}
        >
          {shareState === 'working'
            ? 'Preparing…'
            : shareState === 'done'
            ? 'Shared ✓'
            : 'Share Result'}
        </button>
      </div>
    </section>
  )
}

// ============================================================
// Certificate (reusable for both live view + off-screen capture)
// ============================================================
const Certificate = forwardRef(function Certificate(
  { caseId, dateStr, displayScore, result, cls, stamp, forCapture = false, personalityBonus = null, originalOverall = null },
  ref
) {
  return (
    <div className="certificate" ref={ref}>
      <div className="cert-banner">
        <div className="cert-eyebrow">Certificate of Somatic Assessment</div>
        <div className="cert-title">Le Vada</div>
        <div className="cert-subtitle">
          Institute of Vascular-Erotic Performance Research
        </div>
        <div className={`stamp${stamp.tone === 'gold' ? ' gold' : ''}`}>
          {stamp.text}
        </div>
      </div>

      <div className="cert-meta">
        <span>FILE № {caseId}</span>
        <span>ISSUED {dateStr}</span>
      </div>

      <div className="score-display">
        <div className="score-value">{displayScore}</div>
        <div className="score-scale">Performance Index · scale 0–100</div>
        {personalityBonus !== null && (
          <div className="cert-addendum">Revised · Addendum B · Characterological Supplement</div>
        )}
      </div>

      <div className="classification">{cls.label}</div>

      <div className="theory-grid">
        {result.theoryData.map((t) => (
          <div className="theory-row" key={t.key}>
            <div>
              <div className="theory-name">{t.name}</div>
              <div className="theory-source">{t.source}</div>
            </div>
            <div className="theory-score">{t.score}</div>
            <div className="theory-bar">
              <div
                className="theory-bar-fill"
                data-target={t.score}
                style={forCapture ? { width: `${t.score}%` } : undefined}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="cert-notes">
        {cls.note}
        {personalityBonus !== null && (
          <span>
            {' '}Original somatic index: {originalOverall}. Supplementary characterological
            evaluation contributed {personalityBonus} points to the revised assessment.
          </span>
        )}
      </div>

      <div className="signature-block">
        <div>
          <div className="sig-name">A. Vernier, Dr. med.</div>
          Director · Somatic Div.
        </div>
        <div>
          <div className="sig-name">M. Weizberg, PhD</div>
          Senior Analyst
        </div>
      </div>

      <div className="cert-footer">
        — Filed under seal · Le Vada · Geneva · Vienna · Montevideo —
      </div>
      <div className="cert-satire-tag">
        ※ a satirical evaluation ※ no photograph predicts anything ※
      </div>
    </div>
  )
})
