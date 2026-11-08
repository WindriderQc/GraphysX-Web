# Unified Math Lab integration (local, unpublished)

## Source and scope

This isolated worktree reconciles the verified interactive prototype (base 3137195, local codex/ten-workshop-subtraction) with the useful arithmetic rules from PR #137, exact commit 711705c7b0ca9eeab9d374b1056e7d47a3597d9f. It does not merge that PR or change its branch. Its pure src/math-lab-kids.ts and tests are preserved with their provenance; the second kids page/renderer is deliberately not imported.

One Math Lab identity, one page, two broad levels:
- Nombres et calculs: the same interactive 3D garden and table for Manipuler 10, Pratiquer and Explorer.
- Courbes et surfaces: the existing formula, tangent, integral and surface tools, preserved behind the common level selector.

There is never a second simultaneous renderer for exploration. Counting/addition diagrams are composed as ordinary graphysx.agent-world/v2 entities into the existing PlatformHost. Rules and bounds still use PR 137's readMathScene-based validator.

## Activities

- Manipuler 10: move ten shapes between two groups, undo and discover all complements.
- Pratiquer: all eleven complements to 10 and all eleven subtractions from 10, including 10 - 7. Independent progress, optional hints, retry and calculator remain unchanged.
- Explorer: choose counts 1-100 or two operands summing to 1-20. Exact increment/decrement buttons are disabled when invalid; 95 + 10 is refused, not clamped. Zero operands are allowed when the total is positive.
- Addition exploration can display two groups or regroup their objects into rows of ten without changing counts or operand colours. The answer remains hidden until requested. This is an instantaneous regrouping in the existing world, not a claim that PR 137's timed stage animation was imported.
- Exploration is not a scored or adaptive lesson. A general 0-20 exercise curriculum is not yet implemented.

## Navigation and state

- Existing /math-lab.html and #bloc links retain advanced behavior. ?level=numbers opens the child-friendly level.
- #compter=13 and #additionner=8+5 now open Explorer in the same environment, including when no query is supplied.
- Invalid recognized cube links show a refusal and no substituted math picture. A valid example recovers normally.
- The explorer scene, grouping and revealed-answer preference are local browser state; ten-practice progress is separate and untouched.
- Leaving Explorer for Practice removes its old cube fragment so a reload does not silently reopen the wrong activity.
- The last advanced fragment is retained in sessionStorage for same-tab level switching. Existing immediate-input/invalid-draft/slider preservation remains tested. No account or cross-device sync is claimed.

## Preview and validation

npm run build; npm run preview:ten-workshop

This worktree uses http://127.0.0.1:4198/math-lab.html?level=numbers. It is UGBrutal-local only. The prior prototype on 4197 is not replaced.

Validation receipts are under output/math-unified. Browser journeys include all prior 94 checks plus exploration/link/state cases. Synthetic VR lifecycle coverage is not a physical Quest test. No publication, merge or deployment is included.

## Later work

Artistic palette workflow stays secondary. Existing optional themes remain prototype functionality, not a universal asset pipeline. Quest activity remains deferred; this is screen-based prototype validation.
