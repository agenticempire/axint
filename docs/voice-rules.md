# Voice rules for Axint and parent-brand copy

Applies to public product and company copy across axint.ai, axint.ai/cloud, registry.axint.ai, docs.axint.ai, agenticempire.co, and the GitHub org profile. Blog posts, partner/career/privacy pages, community recruitment panels, and email templates are out of scope — those have legitimate first-person registers.

## The rule

Write feature-forward or second-person. Never narrate the build.

The reader is a developer evaluating the product. They care about what it does, not why we shipped it.

## Banned phrases

These appear in AI-generated marketing copy and almost never in human-written product copy. Every one is grep-bait for the next review.

- `we built this to...`
- `we created ... to...`
- `we designed ... so that...`
- `we want the reader to...`
- `the reason we ...`
- `this section is here to...`
- `this helps us...`
- `positioned as...`
- `our story`
- `our mission`
- `our goal`
- `our vision`
- `we believe...`
- `we wanted...`
- `we chose...`
- `we picked...`
- `we think...`

## Allowed first-person

First-person is fine in these contexts — leave them alone:

- `/careers` — hiring voice (`we hire`, `we protect deep work`)
- `/partners` — collaboration voice (`help us build`, `what we need from you`)
- `/privacy` — legally-required data controller language (`we collect`, `we don't store`)
- `/contribute` panels — community recruitment (`help us build`, `what we need next`)
- Error messages — transactional (`something broke on our end`)
- Email templates — direct correspondence (Nima's actual voice)
- Code comments — developer commentary, not rendered

## Rewrites

Before:

> We built Axint so that agents could ship Apple features without hand-writing Swift.

After:

> Axint compiles agent intent into Apple-native Swift. No hand-writing.

Before:

> This section is here to show you how the compiler handles validation.

After:

> The compiler validates Apple rules before Swift ever hits Xcode.

Before:

> We positioned the registry as a real package flow, not a template shelf.

After:

> The registry is a real package flow. Browse, install with one command, keep metadata attached.

## Review check

Before shipping copy:

```
npm run public-copy:check
pnpm copy:check
```

Zero matches outside the allowed paths. If a phrase is on the edge, rewrite it feature-forward — the product copy is not the place to explain design decisions.
