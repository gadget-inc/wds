# Testing

Gotta build the package, which you can do once with `yarn build`, or watch your local development directory and rebuild when things change with `yarn watch`.

Then gotta use it somewhere, which tends to be easiest in a project. I use `yarn link` for this.

# Releasing

## Build the package

Run `yarn build`

## Release the package

Decide what type of new version you're gonna publish and bump the version with `npm version minor|major|patch`

Run `yarn build && npm publish`
