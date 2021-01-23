# Releasing

`esbuild-dev` uses `pika` for packaging cause it's easy.

## Build the package

Run `yarn pkg:build`

## Release the package

Decide what type of new version you're gonna publish and bump the version with `npm version minor|major|patch`

Run `yarn pkg:build && npm publish`
