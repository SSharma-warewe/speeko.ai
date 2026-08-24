import {
  CALL_TRANSITION_TABLE,
  CallLifecycleEvent,
  IllegalCallTransitionError,
  applyCallEvent,
  initializeCallStatus,
  isAllowedCallTransition,
  isTerminalCallStatus,
} from '../lib/call-state-machine';
import { CallStatus, CallTaskStatus } from '../call.entity';

describe('call-state-machine', () => {
  describe('transition table', () => {
    it('every listed triple is allowed', () => {
      for (const row of CALL_TRANSITION_TABLE) {
        expect(isAllowedCallTransition(row.from, row.event, row.to)).toBe(
          true,
        );
      }
    });

    it('rejects pending → completed / incomplete / ready', () => {
      expect(
        isAllowedCallTransition(
          CallStatus.PENDING,
          CallLifecycleEvent.TASK_COMPLETE,
          CallStatus.COMPLETED,
        ),
      ).toBe(false);
      expect(
        isAllowedCallTransition(
          CallStatus.PENDING,
          CallLifecycleEvent.SESSION_ENDED_NO_TASK,
          CallStatus.INCOMPLETE,
        ),
      ).toBe(false);
      expect(
        isAllowedCallTransition(
          CallStatus.PENDING,
          CallLifecycleEvent.DISPATCH,
          CallStatus.READY,
        ),
      ).toBe(false);
    });

    it('rejects completed / incomplete / cancelled → active states', () => {
      for (const from of [
        CallStatus.COMPLETED,
        CallStatus.INCOMPLETE,
        CallStatus.CANCELLED,
      ]) {
        expect(
          isAllowedCallTransition(
            from,
            CallLifecycleEvent.RETRY_NOW,
            CallStatus.PENDING,
          ),
        ).toBe(false);
        expect(
          isAllowedCallTransition(
            from,
            CallLifecycleEvent.DISPATCH,
            CallStatus.READY,
          ),
        ).toBe(false);
      }
    });

    it('rejects failed → completed / incomplete', () => {
      expect(
        isAllowedCallTransition(
          CallStatus.FAILED,
          CallLifecycleEvent.TASK_COMPLETE,
          CallStatus.COMPLETED,
        ),
      ).toBe(false);
      expect(
        isAllowedCallTransition(
          CallStatus.FAILED,
          CallLifecycleEvent.SESSION_ENDED_NO_TASK,
          CallStatus.INCOMPLETE,
        ),
      ).toBe(false);
    });

    it('allows dialing and ready → completed and incomplete', () => {
      for (const from of [CallStatus.DIALING, CallStatus.READY]) {
        expect(
          isAllowedCallTransition(
            from,
            CallLifecycleEvent.TASK_COMPLETE,
            CallStatus.COMPLETED,
          ),
        ).toBe(true);
        expect(
          isAllowedCallTransition(
            from,
            CallLifecycleEvent.SESSION_ENDED_NO_TASK,
            CallStatus.INCOMPLETE,
          ),
        ).toBe(true);
      }
    });

    it('allows late_complete only as a no-op on terminals', () => {
      expect(
        isAllowedCallTransition(
          CallStatus.COMPLETED,
          CallLifecycleEvent.LATE_COMPLETE,
          CallStatus.COMPLETED,
        ),
      ).toBe(true);
      expect(
        isAllowedCallTransition(
          CallStatus.INCOMPLETE,
          CallLifecycleEvent.LATE_COMPLETE,
          CallStatus.COMPLETED,
        ),
      ).toBe(false);
    });
  });

  describe('isTerminalCallStatus', () => {
    it('marks completed, incomplete, failed, cancelled as terminal', () => {
      expect(isTerminalCallStatus(CallStatus.COMPLETED)).toBe(true);
      expect(isTerminalCallStatus(CallStatus.INCOMPLETE)).toBe(true);
      expect(isTerminalCallStatus(CallStatus.FAILED)).toBe(true);
      expect(isTerminalCallStatus(CallStatus.CANCELLED)).toBe(true);
      expect(isTerminalCallStatus(CallStatus.READY)).toBe(false);
      expect(isTerminalCallStatus(CallStatus.PENDING)).toBe(false);
    });
  });

  describe('applyCallEvent', () => {
    it('task_complete sets status and taskStatus', () => {
      const call = {
        status: CallStatus.READY,
        taskStatus: CallTaskStatus.PENDING,
      };
      expect(
        applyCallEvent(
          call,
          CallLifecycleEvent.TASK_COMPLETE,
          CallStatus.COMPLETED,
        ),
      ).toBe(true);
      expect(call.status).toBe(CallStatus.COMPLETED);
      expect(call.taskStatus).toBe(CallTaskStatus.COMPLETED);
    });

    it('session_ended_no_task sets incomplete', () => {
      const call = {
        status: CallStatus.DIALING,
        taskStatus: CallTaskStatus.PENDING,
      };
      applyCallEvent(
        call,
        CallLifecycleEvent.SESSION_ENDED_NO_TASK,
        CallStatus.INCOMPLETE,
      );
      expect(call.status).toBe(CallStatus.INCOMPLETE);
      expect(call.taskStatus).toBe(CallTaskStatus.INCOMPLETE);
    });

    it('strict mode throws on illegal transition', () => {
      const call = {
        status: CallStatus.PENDING,
        taskStatus: CallTaskStatus.PENDING,
      };
      expect(() =>
        applyCallEvent(
          call,
          CallLifecycleEvent.TASK_COMPLETE,
          CallStatus.COMPLETED,
        ),
      ).toThrow(IllegalCallTransitionError);
      expect(call.status).toBe(CallStatus.PENDING);
    });

    it('lenient mode logs and leaves the row unchanged', () => {
      const warn = jest.fn();
      const call = {
        status: CallStatus.PENDING,
        taskStatus: CallTaskStatus.PENDING,
      };
      expect(
        applyCallEvent(
          call,
          CallLifecycleEvent.TASK_COMPLETE,
          CallStatus.COMPLETED,
          { mode: 'lenient', logger: { warn } },
        ),
      ).toBe(false);
      expect(call.status).toBe(CallStatus.PENDING);
      expect(warn).toHaveBeenCalled();
    });

    it('dial_failed does not flip taskStatus', () => {
      const call = {
        status: CallStatus.DIALING,
        taskStatus: CallTaskStatus.PENDING,
      };
      applyCallEvent(call, CallLifecycleEvent.DIAL_FAILED, CallStatus.FAILED);
      expect(call.status).toBe(CallStatus.FAILED);
      expect(call.taskStatus).toBe(CallTaskStatus.PENDING);
    });
  });

  describe('initializeCallStatus', () => {
    it('enqueue → pending + task pending', () => {
      const call = { status: CallStatus.CREATING, taskStatus: CallTaskStatus.COMPLETED };
      initializeCallStatus(call, CallLifecycleEvent.ENQUEUE);
      expect(call.status).toBe(CallStatus.PENDING);
      expect(call.taskStatus).toBe(CallTaskStatus.PENDING);
    });

    it('start_immediate → creating + task pending', () => {
      const call = { status: CallStatus.PENDING, taskStatus: CallTaskStatus.PENDING };
      initializeCallStatus(call, CallLifecycleEvent.START_IMMEDIATE);
      expect(call.status).toBe(CallStatus.CREATING);
    });
  });
});
