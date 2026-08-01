# Vercel Eve Integration

The `nominee-eve` package provides a native adapter for Vercel Eve, securing agent actions with Nominee.

## Installation

```bash
npm install nominee nominee-eve
```

## Usage

Use `nomineeTool` or `withNominee` to wrap Eve tools.

```typescript
import { Nominee, allow, deny } from 'nominee';
import { nomineeTool } from 'nominee-eve';
import { z } from 'zod';

const nominee = new Nominee({
  policy: {
    rules: [allow('github.pr.review'), deny('github.repo.delete')],
    fallback: 'ask'
  }
});

export const reviewPrTool = nomineeTool(nominee, {
  action: 'github.pr.review',
  description: 'Review a GitHub Pull Request',
  inputSchema: z.object({ pr_number: z.number() }),
  execute: async (input, { user, token, eve }) => {
    // Execution will only reach here if the policy allows 'github.pr.review'
    return `Reviewed PR ${input.pr_number}`;
  }
});
```
