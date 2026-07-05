import type React from 'react'
import { AbsoluteFill } from 'remotion'
import { brand } from '../content'
import { Seal } from './Seal'
import { display, mono, sans } from './fonts'
import { hexA } from './util'

const c = brand.colors

export interface PackageBannerProps {
  eyebrow: string
  name: string
  subhead: string
  install: string
  accent?: string
}

// Light-brand per-package banner: paper background, oxblood seal + wordmark,
// eyebrow, big name, subhead, an install chip, and a large faint seal motif on
// the right (echoing the OG). Consistent with the main Banner.
export const PackageBanner: React.FC<PackageBannerProps> = ({
  eyebrow,
  name,
  subhead,
  install,
  accent,
}) => {
  const seal = accent ?? c.seal
  return (
    <AbsoluteFill
      style={{
        backgroundColor: c.paper,
        backgroundImage: `radial-gradient(820px 420px at 100% -25%, ${hexA(seal, 0.08)}, transparent 70%)`,
        padding: '70px 88px',
        justifyContent: 'space-between',
      }}
    >
      {/* large faint seal, right */}
      <div style={{ position: 'absolute', right: 96, top: 130, opacity: 0.5 }}>
        <Seal size={230} color={seal} />
      </div>

      {/* wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
        <Seal size={34} color={seal} />
        <span
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: 27,
            color: c.ink,
            letterSpacing: '-0.02em',
          }}
        >
          nominee
        </span>
      </div>

      {/* body */}
      <div style={{ maxWidth: 1080 }}>
        <div
          style={{
            fontFamily: mono,
            fontSize: 15,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: seal,
            marginBottom: 16,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            fontFamily: display,
            fontWeight: 700,
            fontSize: 66,
            letterSpacing: '-0.035em',
            color: c.ink,
            lineHeight: 1,
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontFamily: sans,
            fontSize: 24,
            lineHeight: 1.45,
            color: c.muted,
            marginTop: 18,
            maxWidth: 900,
          }}
        >
          {subhead}
        </div>
      </div>

      {/* install chip */}
      <div>
        <span
          style={{
            fontFamily: mono,
            fontSize: 24,
            color: c.ink,
            border: `1px solid ${hexA(seal, 0.4)}`,
            background: hexA(seal, 0.06),
            borderRadius: 12,
            padding: '13px 20px',
            display: 'inline-block',
          }}
        >
          <span style={{ color: seal }}>›</span>&nbsp;&nbsp;{install}
        </span>
      </div>
    </AbsoluteFill>
  )
}
