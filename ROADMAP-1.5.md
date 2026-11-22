# Formline 1.5+ development plan

## UX acceptance criteria
- Responsive at 640px width; no horizontal page scrolling.
- Page editing, preview, publishing and management separated.
- Native controls, short labels, optional settings hidden by default.
- Preserve 1.4 drafts, panels, activation and existing tools.
- Bot stays hosted on Daki; Cloudflare handles signed interactions.
- Website redesign deferred; self-service device transfer remains disabled.

## Selected features
- [ ] Action chains
- [ ] Variables
- [ ] Conditional logic
- [ ] Persistent progress
- [ ] Advanced layouts
- [ ] Dynamic messages
- [ ] Message context actions
- [ ] Interactive quizzes
- [ ] Community profiles (opt-in, minimal data, user deletion)
- [ ] Server connection
- [ ] Live message editor
- [ ] Server preview
- [ ] Visual flow canvas
- [ ] Reusable components
- [ ] Experience sharing

## Release gates
Owner-only beta; explicit publish/update actions; authorization on every server operation; migration/backwards compatibility; test in real Discord; verify at compact Windows sizes. No assumption that an online bot means commands respond. Payments paused.
