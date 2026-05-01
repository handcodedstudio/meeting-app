export interface ActionItem {
  id: string;
  description: string;
  assignee?: string;
  dueDate?: string;
  sourceTurnIndex?: number;
}

export interface Decision {
  id: string;
  description: string;
  sourceTurnIndex?: number;
}

export interface KeyDate {
  id: string;
  date?: string;
  description: string;
  sourceTurnIndex?: number;
}

export interface OpenQuestion {
  id: string;
  description: string;
  sourceTurnIndex?: number;
}

export interface Analysis {
  schemaVersion: 1;
  transcriptId: string;
  model: string;
  generatedAt: string;
  actionItems: ActionItem[];
  decisions: Decision[];
  keyDates: KeyDate[];
  openQuestions: OpenQuestion[];
  rawModelOutput?: string;
}

export interface Minutes {
  schemaVersion: 1;
  transcriptId: string;
  model: string;
  generatedAt: string;
  template: string;
  content: string;
}
