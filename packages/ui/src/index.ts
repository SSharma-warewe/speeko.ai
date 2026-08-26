/**
 * @call-agent/ui — design-system primitives
 *
 * Import styles once in the host app:
 *   import "@call-agent/ui/styles.css";
 */

export { cn } from "./utils/cn";

export {
  Button,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
} from "./components/Button";

export { Input, type InputProps } from "./components/Input";
export { Select, type SelectProps } from "./components/Select";
export { Slider, type SliderProps } from "./components/Slider";
export { Textarea, type TextareaProps } from "./components/Textarea";
export { Label, type LabelProps } from "./components/Label";
export { Field, type FieldProps } from "./components/Field";

export { Badge, type BadgeProps, type BadgeTone } from "./components/Badge";
export { Card, type CardProps } from "./components/Card";
export { Chip, type ChipActiveStyle, type ChipProps } from "./components/Chip";
export {
  SegmentedControl,
  type SegmentOption,
  type SegmentedControlProps,
} from "./components/SegmentedControl";

export { Spinner, type SpinnerProps, type SpinnerSize } from "./components/Spinner";
export {
  Skeleton,
  type SkeletonProps,
  type SkeletonVariant,
} from "./components/Skeleton";
export {
  WaveIndicator,
  type WaveIndicatorProps,
} from "./components/WaveIndicator";
export { LiveDot, type LiveDotProps } from "./components/LiveDot";
export { Alert, type AlertProps, type AlertTone } from "./components/Alert";
export { Eyebrow, type EyebrowProps } from "./components/Eyebrow";
