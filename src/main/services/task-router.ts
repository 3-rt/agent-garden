export type AgentRole = 'planter' | 'weeder' | 'tester';

export class TaskRouter {
  // Determine which agent role should handle a task
  route(prompt: string): AgentRole {
    // Check for explicit @agent prefix
    const prefixMatch = prompt.match(/^@(planter|weeder|tester)\s/i);
    if (prefixMatch) {
      return prefixMatch[1].toLowerCase() as AgentRole;
    }

    const lower = prompt.toLowerCase();

    // Tester keywords
    if (
      lower.includes('test') ||
      lower.includes('spec') ||
      lower.includes('assert') ||
      lower.includes('expect') ||
      lower.includes('coverage')
    ) {
      return 'tester';
    }

    // Weeder keywords (refactoring/cleanup)
    if (
      lower.includes('refactor') ||
      lower.includes('clean') ||
      lower.includes('improve') ||
      lower.includes('optimize') ||
      lower.includes('fix') ||
      lower.includes('rename') ||
      lower.includes('simplify')
    ) {
      return 'weeder';
    }

    // Default: planter (creates new code)
    return 'planter';
  }

  // Strip the @agent prefix from the prompt if present
  cleanPrompt(prompt: string): string {
    return prompt.replace(/^@(planter|weeder|tester)\s+/i, '');
  }

  // Map file path to a garden zone
  static fileToZone(filepath: string): 'frontend' | 'backend' | 'tests' {
    const lower = filepath.toLowerCase();
    if (
      lower.includes('.test.') ||
      lower.includes('.spec.') ||
      lower.includes('__tests__')
    ) {
      return 'tests';
    }
    if (
      lower.includes('component') ||
      lower.endsWith('.tsx') ||
      lower.endsWith('.css') ||
      lower.endsWith('.html') ||
      lower.includes('page') ||
      lower.includes('view')
    ) {
      return 'frontend';
    }
    return 'backend';
  }
}
