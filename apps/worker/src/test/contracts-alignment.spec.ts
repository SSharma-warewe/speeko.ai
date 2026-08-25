import { KNOWN_TASK_KEYS, KNOWN_TOOL_IDS } from '@call-agent/contracts';
import { TaskRegistry } from '../tasks/registry';
import { ToolRegistry } from '../tools/registry';

describe('contracts catalogs vs worker registries', () => {
  it('tool registry ids match KNOWN_TOOL_IDS', () => {
    expect([...ToolRegistry.listIds()].sort()).toEqual(
      [...KNOWN_TOOL_IDS].sort(),
    );
  });

  it('task registry keys match KNOWN_TASK_KEYS', () => {
    expect([...TaskRegistry.listKeys()].sort()).toEqual(
      [...KNOWN_TASK_KEYS].sort(),
    );
  });
});
