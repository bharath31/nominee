import type React from 'react'
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'
import { brand } from '../content'
import { Seal } from './Seal'
import { display, mono, sans } from './fonts'
import { hexA } from './util'

const c = brand.colors
const GREEN = c.ok // allow
const AMBER = '#c98a2e' // ask

const ease = Easing.bezier(0.16, 1, 0.3, 1)
const overshoot = Easing.bezier(0.34, 1.56, 0.64, 1)
const clamp = (easing?: (n: number) => number) => ({
  extrapolateLeft: 'clamp' as const,
  extrapolateRight: 'clamp' as const,
  ...(easing ? { easing } : {}),
})

// nominee motion banner — light brand. Signature: a prompt-injected tool call
// travels from `agent` toward `tool`, hits the policy gate at `nominee`, and is
// DENIED before it lands — an oxblood flash + rings, the call never reaches the
// tool. Left text block + a compact policy card, mirroring the house style.
export const BannerMotion: React.FC = () => {
  const frame = useCurrentFrame()
  const { width } = useVideoConfig()

  const rise = (start: number, end: number) => ({
    opacity: interpolate(frame, [start, end], [0, 1], clamp(ease)),
    translate: `0 ${interpolate(frame, [start, end], [18, 0], clamp(ease))}px`,
  })

  const brandR = rise(10, 32)
  const tagR = rise(24, 48)
  const cmdR = rise(40, 62)
  const cardR = rise(50, 78)

  const sealScale = interpolate(frame, [6, 30], [0, 1], clamp(overshoot))
  const idle = 0.5 + 0.5 * Math.sin(frame / 11)

  // ── the wire: agent —— nominee —— tool ──
  const wireY = 320
  const x0 = 92
  const x1 = width - 92
  const mid = (x0 + x1) / 2 // nominee = the gate
  const drawL = interpolate(frame, [16, 40], [0, 1], clamp(ease)) // agent → nominee draws
  // pulse (the injected call) travels agent → nominee, then STOPS at the gate
  const pulseX = interpolate(frame, [38, 66], [x0, mid], clamp(Easing.bezier(0.4, 0, 0.2, 1)))
  const pulseOn = frame >= 38 && frame <= 74
  const denyFlash = interpolate(frame, [64, 70, 88], [0, 1, 0], clamp())
  const ringP = interpolate(frame, [66, 104], [0, 1], clamp(ease))
  const ringFade = interpolate(frame, [96, 112], [1, 0], clamp())
  const blockedIn = rise(70, 90)
  // the nominee→tool half stays faint (the call never gets through)
  const deadHalf = interpolate(frame, [66, 80], [0.18, 0.32], clamp())

  const masterOut = interpolate(frame, [110, 119], [1, 0], clamp())

  const rows: Array<[string, string, string, number]> = [
    ['email.read', 'allow', GREEN, 54],
    ['email.forward → evil.top', 'deny', c.seal, 62], // the one that trips
    ['email.delete', 'ask', AMBER, 54],
  ]

  return (
    <AbsoluteFill style={{ backgroundColor: c.paper, fontFamily: sans, overflow: 'hidden' }}>
      {/* radial oxblood glow, top-right */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(900px 400px at 100% -18%, ${hexA(c.seal, 0.1)}, transparent 70%)`,
        }}
      />
      {/* faint engraving scanlines */}
      <AbsoluteFill
        style={{
          backgroundImage: `repeating-linear-gradient(0deg, transparent 0 39px, ${hexA(c.ink, 0.025)} 39px 40px)`,
        }}
      />

      <AbsoluteFill style={{ opacity: masterOut }}>
        {/* ── left text block ── */}
        <div style={{ position: 'absolute', left: 92, top: 66 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              opacity: brandR.opacity,
              translate: brandR.translate,
            }}
          >
            <div
              style={{
                scale: sealScale,
                filter: `drop-shadow(0 0 ${6 + idle * 8}px ${hexA(c.seal, 0.4)})`,
                display: 'flex',
              }}
            >
              <Seal size={40} color={c.seal} />
            </div>
            <div
              style={{
                fontFamily: display,
                fontWeight: 700,
                fontSize: 76,
                color: c.ink,
                letterSpacing: '-0.045em',
                lineHeight: 1,
              }}
            >
              nominee
            </div>
          </div>

          <div
            style={{
              fontFamily: display,
              fontWeight: 600,
              fontSize: 27,
              color: c.inkSoft,
              marginTop: 22,
              letterSpacing: '-0.02em',
              opacity: tagR.opacity,
              translate: tagR.translate,
            }}
          >
            The authorization layer for AI agents
          </div>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              marginTop: 26,
              padding: '12px 18px',
              borderRadius: 10,
              background: c.surface ?? '#ffffff',
              border: `1px solid ${c.line}`,
              boxShadow: '0 1px 2px rgba(11,16,32,0.04)',
              fontFamily: mono,
              fontSize: 20,
              color: c.ink,
              opacity: cmdR.opacity,
              translate: cmdR.translate,
            }}
          >
            <span style={{ color: c.seal, marginRight: 10 }}>›</span>
            npm i nominee
          </div>
        </div>

        {/* ── right policy card ── */}
        <div
          style={{
            position: 'absolute',
            right: 84,
            top: 78,
            width: 360,
            padding: '18px 22px',
            borderRadius: 14,
            background: '#ffffff',
            border: `1px solid ${c.line}`,
            boxShadow: '0 20px 46px -30px rgba(11,16,32,0.4)',
            fontFamily: mono,
            opacity: cardR.opacity,
            translate: cardR.translate,
          }}
        >
          <div style={{ color: c.muted, fontSize: 13, marginBottom: 12, letterSpacing: '0.04em' }}>
            policy · every tool call
          </div>
          {rows.map(([label, effect, color], i) => {
            const isDeny = effect === 'deny'
            const flash = isDeny ? denyFlash : 0
            const glyph = effect === 'allow' ? '✓' : effect === 'deny' ? '✗' : '⏸'
            return (
              <div
                key={label}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '7px 10px',
                  margin: '2px -10px',
                  borderRadius: 8,
                  fontSize: 17,
                  color: c.ink,
                  background: hexA(c.seal, flash * 0.1),
                }}
              >
                <span style={{ color: isDeny ? c.ink : c.inkSoft }}>{label}</span>
                <span style={{ color, fontWeight: 500, display: 'flex', gap: 7 }}>
                  <span>{effect}</span>
                  <span>{glyph}</span>
                </span>
              </div>
            )
          })}
        </div>

        {/* ── wire: agent —— nominee —— tool ── */}
        {/* agent → nominee (draws, carries the call) */}
        <div
          style={{
            position: 'absolute',
            left: x0,
            top: wireY,
            height: 2,
            width: (mid - x0) * drawL,
            background: c.line,
          }}
        />
        {/* nominee → tool (stays faint: the call never gets through) */}
        <div
          style={{
            position: 'absolute',
            left: mid,
            top: wireY,
            height: 2,
            width: (x1 - mid) * drawL,
            background: hexA(c.ink, deadHalf),
          }}
        />

        {/* node labels */}
        {(
          [
            [x0, 'agent', c.muted],
            [mid, 'nominee', c.seal],
            [x1, 'tool', c.muted],
          ] as Array<[number, string, string]>
        ).map(([x, label, color]) => (
          <div
            key={label}
            style={{
              position: 'absolute',
              left: x - 60,
              top: wireY + 14,
              width: 120,
              textAlign: label === 'agent' ? 'left' : label === 'tool' ? 'right' : 'center',
              fontFamily: mono,
              fontSize: 16,
              color,
              opacity: drawL,
              paddingLeft: label === 'agent' ? 60 : 0,
              paddingRight: label === 'tool' ? 60 : 0,
              transform: label === 'agent' ? 'translateX(-60px)' : label === 'tool' ? 'translateX(60px)' : 'none',
            }}
          >
            {label}
          </div>
        ))}

        {/* the gate marker at nominee */}
        <div
          style={{
            position: 'absolute',
            left: mid - 7,
            top: wireY - 6,
            width: 14,
            height: 14,
            borderRadius: 9999,
            background: c.paper,
            border: `2px solid ${c.seal}`,
            boxShadow: `0 0 ${denyFlash * 16}px ${hexA(c.seal, denyFlash * 0.7)}`,
          }}
        />

        {/* deny rings at the gate */}
        {[0, 1, 2].map((i) => {
          const lp = Math.max(0, Math.min(1, ringP - i * 0.14))
          const size = lp * 46
          const op = ringP > 0 ? (1 - lp) * 0.5 * ringFade : 0
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: mid - size,
                top: wireY - size + 1,
                width: size * 2,
                height: size * 2,
                borderRadius: 9999,
                border: `2px solid ${c.seal}`,
                opacity: op,
              }}
            />
          )
        })}

        {/* traveling injected-call pulse (stops at the gate) */}
        {pulseOn && (
          <div
            style={{
              position: 'absolute',
              left: pulseX - 6,
              top: wireY - 5,
              width: 12,
              height: 12,
              borderRadius: 9999,
              background: c.seal,
              boxShadow: `0 0 16px 3px ${hexA(c.seal, 0.6)}`,
            }}
          />
        )}

        {/* "blocked before the tool ran" label under the gate */}
        <div
          style={{
            position: 'absolute',
            left: mid - 260,
            top: wireY - 44,
            width: 520,
            textAlign: 'center',
            fontFamily: mono,
            fontSize: 16,
            color: c.seal,
            opacity: blockedIn.opacity,
            translate: blockedIn.translate,
          }}
        >
          ✗ injected call blocked · receipt sealed
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}
