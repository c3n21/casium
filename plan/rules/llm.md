# LLM rules (`packages/llm`)

- **The model proposes, the human signs.** Extraction output is a draft the renter reviews
  and edits. There is no path from model output to a wallet signature that skips the review
  card. Adding one fails the ticket.
- **No personal data in the packet.** The wants packet has no name, ID, employer, salary, or
  reference field, and none may be re-added. The schema enforces this with literals, not
  comments.
- Attachments are property images — image MIME types only, per-file size cap, enforced in
  both the UI and the route handler. A UI-only cap is a suggestion.
- Free text is the one field that cannot be structurally constrained, so the leak warning
  sits next to it: at the composer and again on the review card.
- **The model never enters the browser bundle.** `node-llama-cpp` is a native Node module;
  all inference runs server-side. A `packages/llm` import in a client component fails the ticket.
- Mode labeling follows the Walrus precedent: `LLM_MODE` / `NEXT_PUBLIC_LLM_MODE` resolved by
  one factory, rendered from the resolved value. Mocked transcription and vision must say so.
- `LLM_MODE=llama-cpp` with a missing model is a **startup failure naming the variable**,
  never a silent fallback to mock. That pattern is what produced RD-180.
