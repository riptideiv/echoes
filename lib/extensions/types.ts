export const EXTENSION_API_VERSION = 1 as const;

export interface IdeaSnapshot {
  id: number;
  sourceKey: string;
  generationDate: string;
  voice: string;
  format: string;
  tag: string;
  source: string[];
  direction: string;
  justificationSupport: string;
  justificationInterest: string;
  status: string;
  question: string | null;
  userAnswer: string | null;
}

export interface ExtensionOption {
  value: string;
  label: string;
}

export interface ExtensionField {
  id: string;
  label: string;
  type: "select" | "textarea";
  value: string;
  options?: ExtensionOption[];
  placeholder?: string;
  rows?: number;
}

export interface ExtensionAction {
  id: string;
  label: string;
  variant?: "default" | "primary";
}

export interface ExtensionPanel {
  id: string;
  title: string;
  presentation?: "card" | "dropdown";
  fields: ExtensionField[];
  actions: ExtensionAction[];
}

export interface ExtensionView {
  apiVersion: typeof EXTENSION_API_VERSION;
  extensionId: string;
  displayName: string;
  panels: ExtensionPanel[];
}

export type ExtensionEffect =
  | { kind: "clipboard"; text: string; message?: string }
  | {
      kind: "download";
      text: string;
      filename: string;
      mimeType?: string;
      message?: string;
    };

export interface ExtensionResult {
  view: ExtensionView;
  effect?: ExtensionEffect;
  message?: string;
}

export interface LocalExtension {
  apiVersion: typeof EXTENSION_API_VERSION;
  getView(idea: IdeaSnapshot): Promise<ExtensionView>;
  execute(input: {
    idea: IdeaSnapshot;
    panelId: string;
    actionId: string;
    values: Record<string, string>;
  }): Promise<ExtensionResult>;
}
