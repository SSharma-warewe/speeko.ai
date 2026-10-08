import type { VoiceTaskDefinition } from './voice-tasks.js';

/** Opt-in example; cloning does not change an agent's persona or assignment. */
export const REAL_ESTATE_SPEECH_STARTER: VoiceTaskDefinition = {
  name: 'Real estate receptionist with saved speech',
  description:
    'Editable example using the legacy Gurugram receptionist questions. Collect requirements; no booking or callback writes are configured.',
  directions: ['inbound'],
  objective:
    'Identify buy, rent, sell, or list intent and collect the relevant property requirements one question at a time. Accept volunteered answers out of order. Do not invent inventory, tool availability, or successful bookings/callback scheduling.',
  savedSpeech: {
    opening: { mode: 'agent' },
    closing: { mode: 'agent' },
    sentences: [
      {
        key: 'buy_location',
        text: 'गुरुग्राम में कौन सा सेक्टर या लोकैलिटी देखना चाहते हो?',
        whenToUse: 'After buy intent, when location is unknown.',
        prepare: true,
      },
      {
        key: 'rent_location',
        text: 'गुरुग्राम में कौन सा सेक्टर या लोकैलिटी देखना चाहते हो?',
        whenToUse: 'After rent intent, when location is unknown.',
        prepare: true,
      },
      {
        key: 'sell_location',
        text: 'आपकी प्रॉपर्टी गुरुग्राम के किस सेक्टर या एरिया में है?',
        whenToUse: 'After sell intent, when property location is unknown.',
        prepare: true,
      },
      {
        key: 'list_location',
        text: 'आप कौन सी प्रॉपर्टी लिस्ट करवाना चाहते हो — सेक्टर या एरिया बताइए?',
        whenToUse: 'After list intent, when property location is unknown.',
        prepare: true,
      },
      {
        key: 'ask_timing',
        text: 'आप कब देखना या खरीदना चाहते हो — इस हफ्ते विजिट, इस महीने, या बाद में?',
        whenToUse: 'For buy/rent after location, when timing is unknown.',
        prepare: true,
      },
      {
        key: 'clarify_timing',
        text: 'माफ़ कीजिये, कब देखना है — इस हफ्ते, इस महीने, या बाद में?',
        whenToUse: 'Clarify an unclear timing answer once.',
        prepare: true,
      },
      {
        key: 'ask_bhk_budget',
        text: 'आप कितने BHK का घर देख रहे हैं और आपका बजट क्या है?',
        whenToUse:
          'For buy/rent after timing, when both BHK and budget are missing.',
        prepare: true,
      },
      {
        key: 'clarify_location',
        text: 'माफ़ कीजिये, मुझे समझ नहीं आया। क्या आप फिर से बता सकते हैं कि आप कौन सा सेक्टर या एरिया देखना चाहते हैं?',
        whenToUse: 'Clarify an unclear location once.',
        prepare: true,
      },
      {
        key: 'ask_budget',
        text: 'आपका बजट क्या है?',
        whenToUse: 'BHK was provided but budget is still unknown.',
        prepare: true,
      },
      {
        key: 'sell_bhk',
        text: 'आपकी प्रॉपर्टी कितने BHK की है?',
        whenToUse: 'For a sale after collecting location.',
        prepare: true,
      },
      {
        key: 'list_type',
        text: 'कौन सा टाइप है — फ्लैट, प्लॉट, या विला?',
        whenToUse: 'For a listing after collecting location.',
        prepare: true,
      },
    ],
  },
  phases: [
    {
      title: 'Service and location',
      instructions:
        'Briefly greet and ask whether they want to buy, rent, sell, or list unless already known. Select the corresponding location sentence. Clarify unclear audio once. Human/existing-customer and other requests should be captured without pretending a transfer succeeded.',
      fieldKeys: ['service', 'location'],
      toolIds: [],
      sentenceKeys: [
        'buy_location',
        'rent_location',
        'sell_location',
        'list_location',
        'clarify_location',
      ],
    },
    {
      title: 'Relevant requirements',
      instructions:
        'Buy/rent: collect timing, then BHK/budget, skipping provided details. Sell: ask BHK after location. List: ask property type after location. Respect refusal and do not repeatedly demand missing answers.',
      fieldKeys: ['timing', 'bhk', 'budget', 'propertyType'],
      toolIds: [],
      sentenceKeys: [
        'ask_timing',
        'clarify_timing',
        'ask_bhk_budget',
        'ask_budget',
        'sell_bhk',
        'list_type',
      ],
    },
    {
      title: 'Next step',
      instructions:
        'Capture a concise summary. Say only next steps that are supported by configured facts/tools; do not claim a lead was saved or a callback booked. Wait for the final caller answer before completing.',
      fieldKeys: ['summary'],
      toolIds: [],
    },
  ],
  contextFields: [],
  resultFields: [
    'service',
    'location',
    'timing',
    'bhk',
    'budget',
    'propertyType',
    'summary',
  ].map((key) => ({ key, type: 'string', description: key })),
  outcomes: [
    {
      key: 'REQUIREMENT_CAPTURED',
      description: 'Property requirements collected',
      requiredFields: ['service', 'summary'],
      checks: ['usable_answer'],
    },
    {
      key: 'CALLBACK_REQUESTED',
      description: 'Caller requested follow-up; no scheduling write is implied',
      requiredFields: ['summary'],
      checks: ['usable_answer'],
    },
    {
      key: 'OTHER',
      description: 'Other request or caller declined',
      requiredFields: [],
      checks: ['usable_answer'],
    },
  ],
  toolIds: [],
};
