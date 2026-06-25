# Sports Services

This folder is the foundation for the future `Sports Prediction Engine`.

## What Goes Here

- sport adapters
- shared normalizers
- sport-specific rule helpers
- shared intelligence helpers that are intentionally adapter-facing

## What Should Not Go Here

- direct frontend code
- route handlers
- environment secrets
- one-off scripts tied only to local debugging
- cache JSON data

## How To Add A New Sport

1. Create a new adapter in `adapters/`.
2. Make it satisfy the contract documented in
   `adapters/sportAdapterContract.js`.
3. Reuse shared normalizers where possible.
4. Keep provider fetching inside existing provider services or sport-specific
   wrappers.
5. Add sport-specific rules only where generic rules are not enough.

## Adapter Contract

Every adapter should clearly answer:

- what sport key it represents
- how it fetches games
- how it fetches odds
- how it fetches player props if supported
- which rules apply
- which markets it supports

Adapters should wrap existing services first. They should not force a large
rewrite of working endpoints.
