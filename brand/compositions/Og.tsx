import type React from 'react'
import { AbsoluteFill } from 'remotion'
import { brand } from '../content'
import { Seal } from './Seal'
import { display, mono, sans } from './fonts'
import { hexA } from './util'

const c = brand.colors

export const Og: React.FC = () => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: c.paper,
        backgroundImage: `radial-gradient(800px 500px at 50% -30%, ${hexA(c.seal, 0.08)}, transparent 70%)`,
        padding: '58px 76px',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <Seal size={44} color={c.seal} />
        <span
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: 34,
            color: c.ink,
            letterSpacing: '-0.02em',
          }}
        >
          nominee
        </span>
      </div>

      <div>
        <div
          style={{
            fontFamily: display,
            fontWeight: 600,
            fontSize: 70,
            lineHeight: 1.04,
            letterSpacing: '-0.035em',
            color: c.ink,
            maxWidth: 1020,
          }}
        >
          {brand.taglineShort}
          <br />
          {brand.taglineShortLine2}
        </div>
        <div
          style={{
            fontFamily: sans,
            fontSize: 25,
            lineHeight: 1.35,
            color: c.muted,
            marginTop: 18,
            maxWidth: 980,
          }}
        >
          {brand.subhead}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: mono,
            fontSize: 22,
            color: c.seal,
            border: `1px solid ${hexA(c.seal, 0.28)}`,
            background: hexA(c.seal, 0.06),
            borderRadius: 11,
            padding: '9px 16px',
          }}
        >
          $25 runs · $200 waits for you · $2,000 is blocked
        </span>
        <span style={{ fontFamily: mono, fontSize: 20, color: c.inkSoft }}>nominee.dev</span>
      </div>
    </AbsoluteFill>
  )
}
