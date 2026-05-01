import type { WhisperModelSize } from './transcript';

export interface AppSettings {
  schemaVersion: 1;
  ollamaUrl: string;
  ollamaModel: string;
  whisperModelSize: WhisperModelSize;
  language: 'en' | 'auto';
  theme: 'system' | 'light' | 'dark';
  autoPullOllamaModel: boolean;
  vadEnabled: boolean;
  minutesTemplate: string;
}

export const DEFAULT_MINUTES_TEMPLATE = `# Meeting Minutes

**Date:** {{date}}
**Attendees:** {{attendees}}

## Summary
A short paragraph summarising the meeting.

## Discussion
- Key topic 1
- Key topic 2

## Decisions
- Decision 1

## Action Items
- [ ] Owner — task — due date

## Next Steps
- Follow-up 1`;

export const DEFAULT_SETTINGS: AppSettings = {
  schemaVersion: 1,
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'llama3.2:3b',
  whisperModelSize: 'medium.en',
  language: 'en',
  theme: 'system',
  autoPullOllamaModel: true,
  vadEnabled: true,
  minutesTemplate: DEFAULT_MINUTES_TEMPLATE
};
