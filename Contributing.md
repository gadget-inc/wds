# Testing

Gotta build the package, which you can do once with `pnpm build`, or watch your local development directory and rebuild when things change with `pnpm watch`.

Then gotta use it somewhere, which tends to be easiest in a project. I use `pnpm link` for this.

# Releasing

Releases are managed automatically by Github Actions. To create a new release, follow these steps:

1. Run `npm version minor|major|patch`. This will change the version in the package.json and create a new git commit changing it.
2. Push this commit to the `main` branch. CI will run the tests, then run the release workflow, which publishes to NPM, create a Github release, and creates a git tag for the version.
