import { useEffect, type RefObject } from "react";
import * as THREE from "three";
import WAVES from "vanta/dist/vanta.waves.min";

/** Same Vanta waves settings as the landing page hero. */
const WAVES_OPTIONS = {
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
} as const;

/**
 * Mount landing-page style Vanta waves on a container element.
 * No-ops when prefers-reduced-motion is set. Cleans up on unmount.
 */
export function useVantaWaves(ref: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const effect = WAVES({
      el,
      THREE,
      ...WAVES_OPTIONS,
    });

    return () => {
      effect.destroy();
    };
  }, [ref]);
}
