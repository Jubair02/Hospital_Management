import { useEffect, useId, useRef, useState } from 'react';

interface RippleGlyphProps {
  /** Short string — a status code. Anything longer will not fit the viewBox. */
  text: string;
  /** While true the distortion ramps up; while false it settles back to still. */
  active: boolean;
  className?: string;
}

/** How fast the effect winds up, and the faster rate it unwinds at. */
const RAMP_PER_SECOND = 1.0;
const DECAY_PER_SECOND = 2.5;
const MAX_DISPLACEMENT = 36;
const REDUCED_DISPLACEMENT = 12;
const REST_FREQUENCY = 0.001;
const HOVER_FREQUENCY = 0.009;
const BREATH_HZ = 0.09;
const PHASE_RATE = 0.9;

/**
 * A large glyph that ripples, driven by an SVG displacement map rather than by
 * an animation library — `feTurbulence` feeding `feDisplacementMap`, with the
 * two attributes written from a `requestAnimationFrame` loop.
 *
 * The loop stops itself once the effect has settled, so a page nobody is
 * looking at is not holding a core awake. It also respects
 * `prefers-reduced-motion`: the distortion is capped and the skew removed
 * rather than the whole thing being switched off, because the glyph is the
 * page's only illustration.
 */
export default function RippleGlyph({ text, active, className = '' }: RippleGlyphProps) {
  const uid = useId().replace(/:/g, '-');
  const filterId = `ripple-${uid}`;

  const turbulenceRef = useRef<SVGFETurbulenceElement>(null);
  const displacementRef = useRef<SVGFEDisplacementMapElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  // Read through a ref so toggling does not restart the loop mid-ramp.
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const levelRef = useRef(0);
  const phaseRef = useRef(0);

  useEffect(() => {
    let frame = 0;
    let last: number | null = null;

    const tick = (time: number) => {
      const turbulence = turbulenceRef.current;
      const displacement = displacementRef.current;

      if (turbulence && displacement) {
        // Clamped: a backgrounded tab resumes with a huge delta, which would
        // otherwise jump the effect straight to full strength.
        const delta = last === null ? 0 : Math.min(0.05, Math.max(0, (time - last) / 1000));
        last = time;

        levelRef.current = activeRef.current
          ? Math.min(1, levelRef.current + RAMP_PER_SECOND * delta)
          : Math.max(0, levelRef.current - DECAY_PER_SECOND * delta);

        const intensity = levelRef.current;
        const breath = Math.sin((time / 1000) * Math.PI * 2 * BREATH_HZ);
        const peak = reducedMotion ? REDUCED_DISPLACEMENT : MAX_DISPLACEMENT;

        phaseRef.current += intensity * PHASE_RATE * delta;
        const phase = phaseRef.current;

        const base =
          REST_FREQUENCY +
          (HOVER_FREQUENCY - REST_FREQUENCY) * intensity +
          0.004 * breath * intensity;
        const freqX = Math.max(0.002, base + 0.007 * Math.sin(phase) * intensity);
        const freqY = Math.max(0.002, 0.028 + 0.012 * Math.sin(phase * 1.4 + 1) * intensity);

        turbulence.setAttribute('baseFrequency', `${freqX} ${freqY}`);
        displacement.setAttribute('scale', String(intensity * peak));

        if (svgRef.current) {
          svgRef.current.style.transform = reducedMotion
            ? 'none'
            : `skewX(${intensity * 13}deg)`;
        }

        // Settled and nothing driving it — stop until something changes.
        if (!activeRef.current && intensity === 0) {
          frame = 0;
          return;
        }
      }

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
    // `active` is a dependency so the loop restarts when it is switched back on
    // after having stopped itself.
  }, [active, reducedMotion]);

  return (
    <svg
      ref={svgRef}
      role="img"
      aria-label={text}
      viewBox="0 0 500 180"
      preserveAspectRatio="xMidYMid meet"
      className={`overflow-visible transition-none ${className}`}
    >
      <defs>
        <filter id={filterId} x="-15%" y="-15%" width="130%" height="130%">
          <feTurbulence
            ref={turbulenceRef}
            type="fractalNoise"
            baseFrequency={REST_FREQUENCY}
            numOctaves={1}
            seed={4}
            result="noise"
          />
          <feDisplacementMap
            ref={displacementRef}
            in="SourceGraphic"
            in2="noise"
            scale={0}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>

      <g filter={`url(#${filterId})`} fill="currentColor">
        <text
          x="250"
          y="150"
          textAnchor="middle"
          className="select-none [font-size:180px] [font-weight:800] [letter-spacing:-0.04em]"
        >
          {text}
        </text>
      </g>
    </svg>
  );
}
