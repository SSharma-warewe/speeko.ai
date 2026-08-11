import {
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { cn } from "../../utils/cn";

export type SliderProps = {
  id?: string;
  label: ReactNode;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  required?: boolean;
  hint?: ReactNode;
  /** Suffix shown after the live value, e.g. "legs" or "tries". */
  unit?: string;
  /** Number of tick marks along the track (including ends). Default 5. */
  ticks?: number;
  className?: string;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function snap(n: number, min: number, max: number, step: number) {
  const stepped = Math.round((n - min) / step) * step + min;
  return clamp(Number(stepped.toFixed(6)), min, max);
}

export function Slider({
  id: idProp,
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  disabled = false,
  required = false,
  hint,
  unit,
  ticks = 5,
  className,
}: SliderProps) {
  const genId = useId();
  const id = idProp ?? genId;
  const hintId = `${id}-hint`;
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);

  const pct = useMemo(() => {
    if (max <= min) return 0;
    return ((clamp(value, min, max) - min) / (max - min)) * 100;
  }, [value, min, max]);

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const raw = min + ratio * (max - min);
      onChange(snap(raw, min, max, step));
    },
    [disabled, min, max, step, onChange],
  );

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    setFromClientX(e.clientX);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    setFromClientX(e.clientX);
  };

  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    setDragging(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const big = step * 5;
    let next: number | null = null;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = value + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = value - step;
        break;
      case "PageUp":
        next = value + big;
        break;
      case "PageDown":
        next = value - big;
        break;
      case "Home":
        next = min;
        break;
      case "End":
        next = max;
        break;
      default:
        return;
    }
    e.preventDefault();
    onChange(snap(next, min, max, step));
  };

  const tickCount = Math.max(2, Math.min(12, ticks));
  const tickItems = Array.from({ length: tickCount }, (_, i) => i);

  const style = {
    "--ca-slider-pct": `${pct}%`,
  } as CSSProperties;

  return (
    <div
      className={cn(
        "ca-slider",
        dragging && "ca-slider--active",
        focusWithin && "ca-slider--focus",
        disabled && "ca-slider--disabled",
        className,
      )}
      style={style}
      data-value={value}
    >
      <div className="ca-slider__head">
        <label className="ca-slider__label" htmlFor={id}>
          {label}
          {required ? (
            <span className="ca-slider__req" aria-hidden>
              *
            </span>
          ) : null}
        </label>
        <div className="ca-slider__readout" aria-hidden>
          <span className="ca-slider__value" key={value}>
            {value}
          </span>
          {unit ? <span className="ca-slider__unit">{unit}</span> : null}
        </div>
      </div>

      <div
        ref={trackRef}
        className="ca-slider__track-wrap"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div className="ca-slider__rail" aria-hidden>
          <div className="ca-slider__fill">
            <span className="ca-slider__sheen" />
          </div>
          <div className="ca-slider__ticks">
            {tickItems.map((i) => (
              <span
                key={i}
                className={cn(
                  "ca-slider__tick",
                  (i / (tickCount - 1)) * 100 <= pct + 0.01 && "ca-slider__tick--on",
                )}
              />
            ))}
          </div>
        </div>

        <input
          id={id}
          type="range"
          className="ca-slider__input"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={unit ? `${value} ${unit}` : String(value)}
          aria-describedby={hint ? hintId : undefined}
          onChange={(e) => onChange(Number(e.target.value))}
          onKeyDown={onKeyDown}
          onPointerDown={() => {
            if (!disabled) setDragging(true);
          }}
          onPointerUp={() => setDragging(false)}
          onPointerCancel={() => setDragging(false)}
          onFocus={() => setFocusWithin(true)}
          onBlur={() => {
            setFocusWithin(false);
            setDragging(false);
          }}
        />

        <div className="ca-slider__thumb" aria-hidden style={{ left: `${pct}%` }}>
          <span className="ca-slider__thumb-core" />
          <span className="ca-slider__thumb-ring" />
        </div>
      </div>

      <div className="ca-slider__meta">
        <span className="ca-slider__bound">{min}</span>
        <span className="ca-slider__bound ca-slider__bound--end">{max}</span>
      </div>

      {hint ? (
        <p id={hintId} className="ca-slider__hint">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
