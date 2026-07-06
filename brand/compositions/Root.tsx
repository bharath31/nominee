import { Composition, Still } from 'remotion'
import { Banner } from './Banner'
import { BannerMotion } from './BannerMotion'
import { Injection } from './Injection'
import { Og } from './Og'
import { PackageBanner } from './PackageBanner'

export const RemotionRoot = () => {
  return (
    <>
      <Still id="Banner" component={Banner} width={1600} height={520} />
      <Still id="Og" component={Og} width={1200} height={630} />
      <Still
        id="BannerAi"
        component={PackageBanner}
        width={1600}
        height={520}
        defaultProps={{
          eyebrow: 'For the Vercel AI SDK · also Cloudflare Agents',
          name: 'nominee-ai',
          subhead: 'Policy, approvals, and receipts inside AI SDK tools — one guardTools() call.',
          install: 'npm i nominee nominee-ai',
        }}
      />
      <Still
        id="BannerEve"
        component={PackageBanner}
        width={1600}
        height={520}
        defaultProps={{
          eyebrow: 'For Vercel Eve',
          name: 'nominee-eve',
          subhead: 'Policy enforcement and portable approvals inside Eve agent tools.',
          install: 'npm i nominee nominee-eve',
        }}
      />
      <Still
        id="BannerAuth0"
        component={PackageBanner}
        width={1600}
        height={520}
        defaultProps={{
          eyebrow: 'Auth0 strategy · optional managed upgrade',
          name: 'nominee-auth0',
          subhead: 'Token Vault tokens and CIBA phone approvals — one strategy under nominee.',
          install: 'npm i nominee nominee-auth0',
        }}
      />
      <Composition
        id="BannerMotion"
        component={BannerMotion}
        durationInFrames={120}
        fps={30}
        width={1280}
        height={400}
      />
      <Composition
        id="Injection"
        component={Injection}
        durationInFrames={270}
        fps={30}
        width={1280}
        height={720}
      />
    </>
  )
}
