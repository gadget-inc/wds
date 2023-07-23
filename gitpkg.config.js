import { execSync } from "child_process";

export default () => ({
  getTagName: (pkg) =>
    `${pkg.name}-v${pkg.version}-gitpkg-${execSync(
      'git rev-parse --short HEAD',
      { encoding: 'utf-8' }
    ).trim()}`
})
