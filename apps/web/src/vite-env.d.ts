/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PORTAL_URL?: string;
  /** API base for get-demo submit; default `/api` (Vite proxy in local dev). */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "react-bubble-ui" {
  import type { CSSProperties, ReactNode } from "react";

  export interface BubbleUIOptions {
    size?: number;
    minSize?: number;
    gutter?: number;
    provideProps?: boolean;
    numCols?: number;
    fringeWidth?: number;
    yRadius?: number;
    xRadius?: number;
    cornerRadius?: number;
    showGuides?: boolean;
    compact?: boolean;
    gravitation?: number;
  }

  export interface BubbleUIProps {
    className?: string;
    options?: BubbleUIOptions;
    style?: CSSProperties;
    children?: ReactNode;
  }

  export default function BubbleUI(props: BubbleUIProps): JSX.Element;
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
