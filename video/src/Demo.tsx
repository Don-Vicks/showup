import type { ReactNode } from "react";
import { AbsoluteFill, Easing, Img, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { loadFont as loadDisplay } from "@remotion/google-fonts/Unbounded";
import { loadFont as loadBody } from "@remotion/google-fonts/DMSans";
import { loadFont as loadMono } from "@remotion/google-fonts/SpaceMono";

const display = loadDisplay("normal", { weights: ["700", "900"], subsets: ["latin"] }).fontFamily;
const body = loadBody("normal", { weights: ["400", "500", "700"], subsets: ["latin"] }).fontFamily;
const mono = loadMono("normal", { weights: ["700"], subsets: ["latin"] }).fontFamily;

const C = { paper: "#fffdf7", ink: "#111111", tomato: "#ff4d2e", cobalt: "#1f4bff", sun: "#ffd23f" };
const S = 30; // frames per second

/** Scene lengths in seconds, in order. */
const SCENES = [4, 4, 6, 8, 9, 5, 9, 7, 8] as const;
const starts = SCENES.reduce<number[]>((a, s, i) => [...a, i ? a[i - 1] + SCENES[i - 1] * S : 0], []);
export const TOTAL = SCENES.reduce((n, s) => n + s * S, 0);

const fadeInOut = (f: number, len: number) =>
  interpolate(f, [0, 8, len - 8, len], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

function Rise({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: f - delay, fps, config: { damping: 200 } });
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 40}px)` }}>{children}</div>;
}

function Big({ children, color = C.ink, size = 104 }: { children: ReactNode; color?: string; size?: number }) {
  return <div style={{ fontFamily: display, fontWeight: 900, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.03em", color }}>{children}</div>;
}

/** A screenshot of the live site in a poster-style frame, slowly pushing in. */
function Screen({ src, len, from = 1, to = 1.06, originY = "0%", width = 1500 }: { src: string; len: number; from?: number; to?: number; originY?: string; width?: number }) {
  const f = useCurrentFrame();
  const z = interpolate(f, [0, len], [from, to], { easing: Easing.inOut(Easing.quad) });
  return (
    <div style={{ width, borderRadius: 26, border: `4px solid ${C.ink}`, boxShadow: `14px 14px 0 ${C.ink}`, overflow: "hidden", background: C.paper }}>
      <div style={{ height: 44, borderBottom: `4px solid ${C.ink}`, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", background: C.paper }}>
        {[C.tomato, C.sun, C.cobalt].map((c) => <span key={c} style={{ width: 16, height: 16, borderRadius: 8, border: `3px solid ${C.ink}`, background: c }} />)}
        <span style={{ fontFamily: mono, fontSize: 18, marginLeft: 14 }}>showup-lake.vercel.app</span>
      </div>
      <div style={{ overflow: "hidden", aspectRatio: "1440 / 860" }}>
        <Img src={staticFile(`shots/${src}`)} style={{ width: "100%", transform: `scale(${z})`, transformOrigin: `50% ${originY}` }} />
      </div>
    </div>
  );
}

function Caption({ n, children }: { n?: string; children: ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 80, right: 80, bottom: 56, display: "flex", gap: 22, alignItems: "center" }}>
      {n && <span style={{ fontFamily: display, fontWeight: 900, fontSize: 40, width: 76, height: 76, borderRadius: 18, border: `4px solid ${C.ink}`, background: C.sun, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{n}</span>}
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 42, lineHeight: 1.2, background: C.paper, border: `4px solid ${C.ink}`, borderRadius: 18, padding: "16px 26px", boxShadow: `8px 8px 0 ${C.ink}` }}>{children}</div>
    </div>
  );
}

function Scene({ i, bg = C.paper, children }: { i: number; bg?: string; children: (len: number) => ReactNode }) {
  const len = SCENES[i] * S;
  return (
    <Sequence from={starts[i]} durationInFrames={len}>
      <SceneBody len={len} bg={bg}>{children(len)}</SceneBody>
    </Sequence>
  );
}

function SceneBody({ len, bg, children }: { len: number; bg: string; children: ReactNode }) {
  const f = useCurrentFrame();
  return <AbsoluteFill style={{ background: bg, opacity: fadeInOut(f, len) }}>{children}</AbsoluteFill>;
}

function Logo({ size = 64 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: size * 0.3 }}>
      <span style={{ width: size * 1.3, height: size * 1.3, borderRadius: size * 0.36, background: C.tomato, border: `4px solid ${C.ink}`, display: "flex", alignItems: "center", justifyContent: "center", transform: "rotate(-6deg)" }}>
        <svg width={size * 0.8} height={size * 0.8} viewBox="0 0 24 24" fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
      </span>
      <span style={{ fontFamily: display, fontWeight: 900, fontSize: size }}>ShowUp</span>
    </div>
  );
}

const center = { alignItems: "center", justifyContent: "center" } as const;

export function Demo() {
  return (
    <AbsoluteFill style={{ background: C.paper, color: C.ink }}>
      <Scene i={0}>
        {() => (
          <AbsoluteFill style={{ ...center, padding: 140 }}>
            <Rise><Big>Sponsors pay for meetups,</Big></Rise>
            <Rise delay={14}><Big color={C.cobalt}>then get a headcount nobody can check.</Big></Rise>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={1} bg={C.tomato}>
        {() => (
          <AbsoluteFill style={{ ...center, padding: 140 }}>
            <Rise><Big>Free RSVPs cost nothing to ignore.</Big></Rise>
            <Rise delay={16}><div style={{ fontFamily: body, fontWeight: 700, fontSize: 48, marginTop: 30 }}>So hosts plan food and seats for people who never come.</div></Rise>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={2}>
        {(len) => (
          <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", gap: 70, padding: "0 90px" }}>
            <div style={{ width: 620, flexShrink: 0 }}>
              <Rise><Logo size={72} /></Rise>
              <Rise delay={10}><div style={{ fontFamily: display, fontWeight: 900, fontSize: 60, lineHeight: 1.08, marginTop: 40, letterSpacing: "-0.03em" }}>Sponsor money that only pays for people who came.</div></Rise>
              <Rise delay={22}><div style={{ fontFamily: body, fontSize: 32, marginTop: 28, lineHeight: 1.4 }}>Built on NEAR at NEAR HACKATHON.</div></Rise>
            </div>
            <Rise delay={8}><Screen src="home.png" len={len} width={1080} /></Rise>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={3}>
        {(len) => (
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 46 }}>
            <Screen src="event-rsvp.png" len={len} from={1} to={1.12} originY="30%" width={1420} />
            <Caption n="1">Guests RSVP with 1 USDC. A NEAR contract holds it, not the host.</Caption>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={4} bg={C.cobalt}>
        {(len) => {
          return (
            <AbsoluteFill style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 60, paddingTop: 60 }}>
              <Screen src="door.png" len={len} width={1150} />
              <Rise delay={60}>
                <div style={{ width: 340, borderRadius: 44, border: `5px solid ${C.ink}`, boxShadow: `12px 12px 0 ${C.ink}`, overflow: "hidden", background: C.paper, marginTop: 40 }}>
                  <Img src={staticFile("shots/ticket-phone.png")} style={{ width: "100%", display: "block" }} />
                </div>
              </Rise>
              <Caption n="2">The door signs a new code every 20 s. Guests scan with their own account, and the deposit comes back.</Caption>
            </AbsoluteFill>
          );
        }}
      </Scene>

      <Scene i={5} bg={C.ink}>
        {() => (
          <AbsoluteFill style={{ ...center, padding: 140, color: C.paper }}>
            <Rise><Big color={C.paper} size={88}>Scanning for someone else&apos;s ticket?</Big></Rise>
            <Rise delay={18}>
              <div style={{ fontFamily: mono, fontWeight: 700, fontSize: 36, marginTop: 44, padding: "22px 30px", border: `4px solid ${C.tomato}`, borderRadius: 18, color: C.tomato }}>
                Smart contract panicked: Check in from the account that holds the ticket
              </div>
            </Rise>
            <Rise delay={30}><div style={{ fontFamily: body, fontSize: 30, marginTop: 26, color: C.sun }}>Refused on NEAR testnet, 11 Nov · tx 57PZLfZw…</div></Rise>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={6}>
        {(len) => (
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 46 }}>
            <Screen src="receipt-4.png" len={len} from={1.02} to={1.12} originY="40%" width={1420} />
            <Caption n="3">48 hours later the host is paid per phone check-in. The rest goes back to the sponsor, with a receipt.</Caption>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={7}>
        {(len) => (
          <AbsoluteFill style={{ alignItems: "center", paddingTop: 46 }}>
            <Screen src="proof-steps.png" len={len} from={1} to={1.08} width={1420} />
            <Caption>Every step ran on NEAR testnet, with its transaction linked. Check it, no wallet needed.</Caption>
          </AbsoluteFill>
        )}
      </Scene>

      <Scene i={8} bg={C.sun}>
        {() => (
          <AbsoluteFill style={{ ...center, gap: 34 }}>
            <Rise><Logo size={96} /></Rise>
            <Rise delay={10}><div style={{ fontFamily: display, fontWeight: 900, fontSize: 52 }}>showup-lake.vercel.app/proof</div></Rise>
            <Rise delay={18}><div style={{ fontFamily: mono, fontWeight: 700, fontSize: 36 }}>github.com/Don-Vicks/showup</div></Rise>
            <Rise delay={26}><div style={{ fontFamily: body, fontWeight: 700, fontSize: 34, padding: "12px 26px", border: `4px solid ${C.ink}`, borderRadius: 999, background: C.paper }}>Built at NEAR HACKATHON · #NEARHackathon</div></Rise>
          </AbsoluteFill>
        )}
      </Scene>
    </AbsoluteFill>
  );
}
