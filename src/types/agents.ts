export interface AgentConnection {
  tool: {
    id: string;
    label: string;
    command: string;
    description: string;
  };
  generateCommitMessage: (prompt: string) => Promise<string>;
}
