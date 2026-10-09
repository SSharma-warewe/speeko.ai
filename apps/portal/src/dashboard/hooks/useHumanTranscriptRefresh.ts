import { useEffect } from 'react';
import type { CallRecord } from '@call-agent/contracts';
import { shouldRefreshHumanTranscript } from '../../lib/human-transcript';

export function useHumanTranscriptRefresh(
  call: CallRecord | null,
  reload: () => void,
): void {
  useEffect(() => {
    if (!shouldRefreshHumanTranscript(call)) return;
    const timer = window.setInterval(() => {
      if (
        document.visibilityState === 'visible' &&
        shouldRefreshHumanTranscript(call)
      )
        reload();
    }, 2000);
    return () => window.clearInterval(timer);
  }, [call, reload]);
}
