# Emberwake

**Unfinished. It runs, it typechecks, and it has a performance defect that makes it unplayable
under sustained fire.** Read the next section before drawing any conclusion from it.

A boat, an archipelago, cannons, and fire that spreads across wooden things and lights the night
while it burns. It exists to answer the one question the rest of this repository deliberately
refuses: not "can the kit express this idea in under two hundred lines", but **"what is the most
this framework can do"**. It is the only thing here allowed to be maximal, which is why it lives in
`showcase/` rather than in `examples/` — see the reasoning in issue #61.

## State

- Runs. Typechecks clean. Builds to 47.5 kB gzipped, all nine packages plus the whole game.
- At rest: **9.9 ms worst, 7.3 ms cadence** by its own HUD — inside the 8 ms budget.
- Under play: **a ~200x collapse**, bisected but not yet root-caused. See issue #62. Do not
  benchmark anything against this until that is fixed; the number you get will be about the bug.
- The design is not finished. There is no escalation, no way to lose, and the sea is emptier than
  it should be.

## Running it

```bash
npm run dev      # http://localhost:5190
npm run build
```

It resolves `@latticekit/*` through the workspace, not the registry, so it exercises the source in
this tree rather than the last publish. That is deliberate: a showcase that silently tested a
three-week-old tarball would be the same class of mistake as a figure nobody can name a command for.
