import type { ReactNode } from "react";
import BubbleUI from "react-bubble-ui";
import "react-bubble-ui/dist/index.css";

interface Integration {
  id: string;
  name: string;
  category: string;
  bg: string;
  fg: string;
  icon: ReactNode;
}

/** Compact monochrome / brand-tint icons for integration bubbles. */
function IconWrap({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        width: 36,
        height: 36,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {children}
    </span>
  );
}

const svgProps = {
  width: 32,
  height: 32,
  viewBox: "0 0 24 24",
  fill: "currentColor",
  "aria-hidden": true as const,
};

const INTEGRATIONS: Integration[] = [
  {
    id: "gcal",
    name: "Google Calendar",
    category: "Calendar",
    bg: "#E8F0FE",
    fg: "#1a73e8",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2zM7 12h5v5H7z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "outlook",
    name: "Outlook",
    category: "Calendar",
    bg: "#E8F4FC",
    fg: "#0078d4",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-9 5.5L3 8V6l9 5.5L21 6v2z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "salesforce",
    name: "Salesforce",
    category: "CRM",
    bg: "#E5F4FF",
    fg: "#00A1E0",
    icon: (
      <IconWrap>
        <svg {...svgProps} viewBox="0 0 24 24">
          <path d="M10.006 5.415a4.195 4.195 0 0 1 3.045-1.306c1.56 0 2.954.9 3.69 2.205.63-.3 1.35-.45 2.1-.45 2.85 0 5.16 2.34 5.16 5.22s-2.31 5.22-5.16 5.22c-.345 0-.69-.03-1.02-.09a3.952 3.952 0 0 1-3.39 1.935c-.6 0-1.155-.135-1.665-.345A4.647 4.647 0 0 1 8.88 19.5a4.69 4.69 0 0 1-4.35-3.09 2.956 2.956 0 0 1-1.89.675C1.185 17.085 0 15.87 0 14.385c0-1.17.705-2.175 1.71-2.61a4.658 4.658 0 0 1-.045-.675c0-2.565 2.055-4.65 4.605-4.65.69 0 1.35.15 1.935.415a4.177 4.177 0 0 1 1.8-1.45z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "hubspot",
    name: "HubSpot",
    category: "CRM",
    bg: "#FFF0E8",
    fg: "#FF7A59",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="3.5" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke="currentColor" strokeWidth="1.6" fill="none" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "slack",
    name: "Slack",
    category: "Messaging",
    bg: "#F4EFFF",
    fg: "#4A154B",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M6 15a2 2 0 0 1-2 2 2 2 0 0 1-2-2 2 2 0 0 1 2-2h2v2zm1 0a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-5zM9 6a2 2 0 0 1-2-2 2 2 0 0 1 2-2 2 2 0 0 1 2 2v2H9zm0 1a2 2 0 0 1 2 2 2 2 0 0 1-2 2H4a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5zm9 2a2 2 0 0 1 2-2 2 2 0 0 1 2 2 2 2 0 0 1-2 2h-2V9zm-1 0a2 2 0 0 1-2 2 2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 2 2 0 0 1 2 2v5zm-2 9a2 2 0 0 1 2 2 2 2 0 0 1-2 2 2 2 0 0 1-2-2v-2h2zm0-1a2 2 0 0 1-2-2 2 2 0 0 1 2-2h5a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-5z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "Messaging",
    bg: "#E7F8EF",
    fg: "#25D366",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M17.5 14.4c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.61-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.05 1.02-1.05 2.49s1.07 2.89 1.22 3.09c.15.2 2.11 3.22 5.11 4.51.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.58-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
          <path d="M12 2C6.48 2 2 6.48 2 12c0 1.77.46 3.43 1.27 4.87L2 22l5.28-1.38A9.96 9.96 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm0 18c-1.6 0-3.1-.42-4.4-1.15l-.31-.18-3.12.82.83-3.04-.2-.32A7.96 7.96 0 0 1 4 12c0-4.41 3.59-8 8-8s8 3.59 8 8-3.59 8-8 8z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    category: "Social",
    bg: "#E8F1F8",
    fg: "#0A66C2",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M6.5 8.5H3.5V20h3V8.5zM5 7a1.75 1.75 0 1 0 0-3.5A1.75 1.75 0 0 0 5 7zM20.5 20h-3v-5.6c0-1.4-.5-2.3-1.7-2.3-.9 0-1.4.6-1.65 1.2-.1.2-.1.5-.1.8V20h-3s.05-9.7 0-10.7h3v1.5c.4-.6 1.1-1.5 2.75-1.5 2 0 3.5 1.3 3.5 4.2V20z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "x",
    name: "X / Twitter",
    category: "Social",
    bg: "#F0F0F0",
    fg: "#0a0a0a",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.727-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "instagram",
    name: "Instagram",
    category: "Social",
    bg: "#FCE7F3",
    fg: "#E1306C",
    icon: (
      <IconWrap>
        <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="1.8">
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "facebook",
    name: "Facebook",
    category: "Social",
    bg: "#E7F0FD",
    fg: "#1877F2",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M14 8h2.5V5H14c-2.2 0-3.5 1.5-3.5 3.8V11H8v3h2.5v7h3.2v-7H16l.5-3h-3v-1.7c0-.8.3-1.3 1.5-1.3z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "gmail",
    name: "Gmail",
    category: "Email",
    bg: "#FCE8E6",
    fg: "#EA4335",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "zapier",
    name: "Zapier",
    category: "Automation",
    bg: "#FFF4E5",
    fg: "#FF4A00",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2zm6 10l.9 3.1L22 16l-3.1.9L18 20l-.9-3.1L14 16l3.1-.9L18 12zM6 14l.7 2.3L9 17l-2.3.7L6 20l-.7-2.3L3 17l2.3-.7L6 14z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "stripe",
    name: "Stripe",
    category: "Payments",
    bg: "#EDE9FE",
    fg: "#635BFF",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M13.5 9.5c0-.8.6-1.1 1.7-1.1 1.5 0 3.4.5 4.9 1.3V5.9C18.5 5.3 16.8 5 15.2 5 11.6 5 9.2 6.9 9.2 10c0 4.8 6.6 4 6.6 6.1 0 .9-.8 1.2-1.9 1.2-1.6 0-3.7-.7-5.3-1.6v3.8c1.7.7 3.5 1.1 5.3 1.1 3.8 0 6.4-1.9 6.4-5.1-.1-5.2-7-4.3-7-6z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "shopify",
    name: "Shopify",
    category: "Commerce",
    bg: "#E3F9E5",
    fg: "#96BF48",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M15.3 4.1c-.1 0-.2 0-.3.1l-1.5.5c-.2-.5-.5-.9-1-1.1-.5-.3-1.1-.3-1.7 0-.2.1-.4.3-.5.4l-3.4 1.1c-.2.1-.4.3-.4.5L5.3 17.5c0 .2.1.4.3.5l6.6 1.3c.1 0 .2 0 .3-.1l5.5-1.2c.2 0 .3-.2.3-.4l1.2-11.8c0-.2-.1-.4-.3-.5l-3.9-1.2zm-3.5 1c.3-.1.6 0 .8.2.2.2.3.4.3.7l-1.9.6c.1-.6.4-1.2.8-1.5z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "notion",
    name: "Notion",
    category: "Workspace",
    bg: "#F3F3F3",
    fg: "#0a0a0a",
    icon: (
      <IconWrap>
        <svg {...svgProps} fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M5 5.5h10l4 4V19a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5z" />
          <path d="M14 5.5V10h4.5M8 13h6M8 16h4" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "zendesk",
    name: "Zendesk",
    category: "Support",
    bg: "#E8F5E9",
    fg: "#03363D",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5L6 11h3.5V7H13v4H16.5L11 16.5z" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "twilio",
    name: "Twilio",
    category: "Voice",
    bg: "#F3E8FF",
    fg: "#F22F46",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="9" cy="10" r="1.5" />
          <circle cx="15" cy="10" r="1.5" />
          <circle cx="9" cy="15" r="1.5" />
          <circle cx="15" cy="15" r="1.5" />
        </svg>
      </IconWrap>
    ),
  },
  {
    id: "calendly",
    name: "Calendly",
    category: "Scheduling",
    bg: "#E8F8F5",
    fg: "#006BFF",
    icon: (
      <IconWrap>
        <svg {...svgProps}>
          <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zM9 14H7v-2h2v2zm4 0h-2v-2h2v2zm4 0h-2v-2h2v2z" />
        </svg>
      </IconWrap>
    ),
  },
];

const bubbleOptions = {
  size: 140,
  minSize: 28,
  gutter: 12,
  provideProps: true,
  numCols: 5,
  fringeWidth: 120,
  yRadius: 140,
  xRadius: 200,
  cornerRadius: 80,
  showGuides: false,
  compact: true,
  gravitation: 5,
};

interface BubbleChildProps {
  bubbleSize?: number;
  integration: Integration;
}

function IntegrationBubble({ bubbleSize = 140, integration }: BubbleChildProps) {
  const showLabel = bubbleSize > 70;

  return (
    <div
      className="integration-bubble"
      title={`${integration.name} · ${integration.category}`}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: "50%",
        background: integration.bg,
        color: integration.fg,
        border: "1px solid rgba(0,0,0,.06)",
        boxShadow: "0 8px 24px rgba(0,0,0,.06)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        padding: 10,
        boxSizing: "border-box",
        userSelect: "none",
        cursor: "default",
      }}
    >
      {integration.icon}
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          textAlign: "center",
          lineHeight: 1.2,
          maxWidth: "90%",
          opacity: showLabel ? 1 : 0,
          transition: "opacity 0.15s ease",
          fontFamily: 'var(--font-body)',
        }}
      >
        {integration.name}
      </span>
      <span
        style={{
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          opacity: showLabel ? 0.55 : 0,
          transition: "opacity 0.15s ease",
        }}
      >
        {integration.category}
      </span>
    </div>
  );
}

export default function IntegrationsBubble() {
  const children = INTEGRATIONS.map((integration) => (
    <IntegrationBubble key={integration.id} integration={integration} />
  ));

  return (
    <div
      id="integrations"
      style={{
        padding: "0 56px 80px",
        background: "#ffffff",
      }}
    >
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#737373",
        }}
      >
        Integrations
      </p>
      <h2
        style={{
          margin: "0 0 10px",
          fontFamily: "var(--font-display)",
          fontSize: 32,
          fontWeight: 700,
          color: "#0a0a0a",
        }}
      >
        Agent integrations
      </h2>
      <p
        style={{
          margin: "0 0 28px",
          maxWidth: 560,
          fontSize: 15,
          lineHeight: 1.6,
          color: "#525252",
        }}
      >
        Connect calendars, CRMs, messaging, and social channels so your voice
        agents book, update, and follow up where your business already works.
      </p>

      <div
        style={{
          borderRadius: 20,
          border: "1px solid #e5e5e5",
          background:
            "radial-gradient(ellipse at center, #fafafa 0%, #ffffff 70%)",
          overflow: "hidden",
        }}
      >
        <BubbleUI
          className="speeko-bubble-ui"
          options={bubbleOptions}
          style={{
            width: "100%",
            height: 460,
            borderRadius: 20,
          }}
        >
          {children}
        </BubbleUI>
      </div>

      <p
        style={{
          margin: "14px 0 0",
          textAlign: "center",
          fontSize: 12,
          color: "#a3a3a3",
        }}
      >
        Drag to explore · Google Calendar, CRM, social, messaging & more
      </p>
    </div>
  );
}
