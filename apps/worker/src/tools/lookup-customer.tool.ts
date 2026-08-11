import { llm } from '@livekit/agents';
import { z } from 'zod';
import { withToolRecording } from './tool-events.js';
import type { ToolFactory } from './types.js';

export const createLookupCustomerTool: ToolFactory = ({ userData }) =>
  llm.tool({
    name: 'lookupCustomer',
    description:
      'Look up customer details by phone, email, or name. Prefer values from call context when available.',
    parameters: z.object({
      query: z.string().describe('Phone, email, or customer name to search'),
    }),
    execute: async ({ query }) =>
      withToolRecording(userData, 'lookupCustomer', { query }, async () => {
        console.log(
          `[tool:lookupCustomer] org=${userData.organizationId ?? 'n/a'} query=${query}`,
        );
        const ctxName =
          typeof userData.context.customerName === 'string'
            ? userData.context.customerName
            : typeof userData.context.patientName === 'string'
              ? userData.context.patientName
              : null;
        return {
          ok: true,
          query,
          customer: {
            name: ctxName,
            phone:
              typeof userData.context.phoneNumber === 'string'
                ? userData.context.phoneNumber
                : null,
            notes: 'Stub lookup — wire to CRM later.',
          },
          message: ctxName
            ? `Found customer ${ctxName} for query ${query}.`
            : `No CRM match for ${query}; used call context only.`,
        };
      }),
  });
