/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_MARKETING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "vanta/dist/vanta.waves.min" {
  import type * as THREE from "three";

  interface VantaWavesOptions {
    el: HTMLElement;
    THREE: typeof THREE;
    mouseControls?: boolean;
    touchControls?: boolean;
    gyroControls?: boolean;
    minHeight?: number;
    minWidth?: number;
    scale?: number;
    scaleMobile?: number;
    color?: number;
    shininess?: number;
    waveHeight?: number;
    waveSpeed?: number;
    zoom?: number;
    backgroundAlpha?: number;
    backgroundColor?: number;
  }

  interface VantaEffect {
    destroy: () => void;
  }

  export default function WAVES(options: VantaWavesOptions): VantaEffect;
}
