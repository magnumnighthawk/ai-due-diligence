# web: Diligence Radar UI

A single-page Next.js app (React 19, Tailwind 4) over the FastAPI backend. It has three views:

| View | Component | What it shows |
|---|---|---|
| Risk Register | `app/components/RegisterView.tsx` | Risks → linked findings → source document with the cited span highlighted |
| Ask the Deal Room | `app/components/AskView.tsx` | Grounded, cited Q&A, with an abstention when evidence is missing |
| Review Queue | `app/components/ReviewQueueView.tsx` | Confirm or dismiss items flagged `needs_review` |

## Run

Start the API first (see the root [README](../README.md)), then:

```bash
npm install
npm run dev     # http://localhost:3000
```

## Configuration

- `NEXT_PUBLIC_API_BASE`: API URL. Defaults to `http://localhost:8000` (see `app/lib/api.ts`).
- `app/lib/user.ts`: the current operator, recorded on review actions and the query audit log.
  It is a hard-coded placeholder. Swap it for your auth/session source.
