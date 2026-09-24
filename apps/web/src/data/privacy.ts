/** Public privacy contact. Same inbox Speeko already sends mail from. */
export const PRIVACY_EMAIL = "hello@speeko.ai";

export const PRIVACY_UPDATED = "September 24, 2026";

export const PRIVACY_SECTIONS = [
  { id: "collect", label: "Information we collect" },
  { id: "use", label: "How we use information" },
  { id: "meta", label: "Meta and WhatsApp permissions" },
  { id: "whatsapp", label: "WhatsApp messages" },
  { id: "ai", label: "Voice and AI processing" },
  { id: "sharing", label: "Information sharing" },
  { id: "retention", label: "Data retention" },
  { id: "security", label: "Data security" },
  { id: "rights", label: "Your rights" },
  { id: "deletion", label: "Data deletion" },
  { id: "disconnect", label: "Disconnecting WhatsApp" },
  { id: "children", label: "Children" },
  { id: "transfers", label: "International transfers" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
] as const;
