export type ReplyPart = {
  text?: string;
  thought?: boolean;
};

export type ReplyContent = {
  role?: string;
  parts?: ReplyPart[];
};

/** WhatsApp body: model text with Luna reasoning parts removed. */
export function visibleReplyText(event: {
  content?: { parts?: ReplyPart[] };
}): string {
  const parts = event.content?.parts ?? [];
  return parts
    .filter((part) => part.thought !== true)
    .map((part) => part.text ?? '')
    .join('')
    .trim();
}

/**
 * Copy of a model response with thought parts removed.
 * Returns undefined when nothing was a thought, so ADK keeps the original.
 */
export function withoutThoughtParts<T extends { content?: ReplyContent }>(
  response: T,
): T | undefined {
  const parts = response.content?.parts;
  if (!parts?.some((part) => part.thought === true)) {
    return undefined;
  }
  return {
    ...response,
    content: {
      ...response.content,
      parts: parts.filter((part) => part.thought !== true),
    },
  };
}
