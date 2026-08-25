import { useEffect, useRef, type ReactNode } from "react";
import * as THREE from "three";
import WAVES from "vanta/dist/vanta.waves.min";

type WavesHeroProps = {
  children: ReactNode;
  /** Shorter than a full viewport — used on inner marketing pages. */
  compact?: boolean;
};

export default function WavesHero({ children, compact = false }: WavesHeroProps) {
  const heroRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const effect = WAVES({
      el,
      THREE,
      mouseControls: true,
      touchControls: true,
      gyroControls: false,
      minHeight: 200.0,
      minWidth: 200.0,
      scale: 1.0,
      scaleMobile: 1.0,
      color: 0x24290f,
      shininess: 30.0,
      waveHeight: 15.0,
      waveSpeed: 1.0,
      zoom: 1.0,
      backgroundAlpha: 1.0,
    });

    return () => {
      effect.destroy();
    };
  }, []);

  return (
    <div ref={heroRef} className={`lp-hero-shell${compact ? " is-compact" : ""}`}>
      {children}
    </div>
  );
}
