# Partner App Polish — 4 Batches

I'll work through your feedback in order, shipping each batch as its own change so you can review between them. After each batch I'll pause for a quick check before moving to the next.

## Batch 1 — Home page
File: `src/routes/_authenticated/app.index.tsx`
- Collapse Today's Customers / Completed / Remaining into a single line: `2 Customers · 0 Completed · 2 Remaining`
- Rename "Today's Earnings" → "Earn Today"
- Progress: "Today's Progress" label, cleaner bar, "0 of 2 Completed"
- Replace Lifetime Earnings stat with Reliability score
- Bottom nav: filled icons on active tab

## Batch 2 — Assignment + Route refinements
Files: `src/routes/_authenticated/app.assignments.tsx`, `src/routes/_authenticated/app.live.tsx` (or route screen file)
- Remove First-payout banner and Longer-commitments banner from Assignment page (move to a Learn More link)
- Redesign Monthly Earnings card: big ₹ + "Estimated this month", stacked meta below
- Add "Updated Xs ago" to the availability/live estimates card
- Route screen: "Serve Next" → "Next Customer", larger customer photo, show expected `₹17` on each customer card

## Batch 3 — Profile / Earnings / Rewards + global polish
- Profile: move Reliability directly under header; verification cards become colored status pills (Aadhaar Pending etc.); capacity buttons → slider
- Earnings: milestone nudge under the Today/Week/Month/All tabs ("Earn ₹170 more today to cross ₹500"); "Rate ₹17" → "₹17 per completed car"
- Rewards: add "Your Bonus Progress" summary (earned / remaining)
- Global: standardize casing to "Today's Route" everywhere; dedupe repeated messaging (First payout / Weekly payout / Priority customer / Need Help) so each appears in exactly one place

## Batch 4 — Post-service celebration + animations
- New celebration screen shown after marking a service completed:
  `🎉 Nice work! +₹17 Earned · Today's Total ₹119 · N Customers Remaining`
- Animated number counter for earnings (tweens from previous → new value)
- Smooth progress-bar fill after each completion
- Completed customer card fades to a green "Completed" state
- Button-tap ripple on primary CTAs

## Notes
- Purely presentation-layer work; no schema or RPC changes.
- Each batch is scoped to keep diffs reviewable — I'll pause after Batch 1 so you can confirm the direction before I proceed.
