# PDBe Molstar

PDBe implementation of [Mol\* (/'mol-star/)](https://github.com/molstar/molstar)

**Refer [PDBe Molstar Wiki](https://github.com/PDBeurope/pdbe-molstar/wiki) for detailed documentation and examples**

## Building & Running locally

```sh
npm install
npm run build
# npm run rebuild  # for a clean build
npm run serve
```

## Build automatically on file save:

```sh
npm run watch
```

## Manual testing

- Run locally by `npm run serve`
- Go to <http://127.0.0.1:1338/portfolio.html> and check the viewer with various different setting (some of these reflect the actual setting on PDBe pages)
- If you want to tweak the options, go to "Frame URL" and change the options in the URL

## Deployment

- Bump version in `package.json` using semantic versioning
  - Use a version number like "1.2.3-beta.1" for development versions (to be used in development environment wwwdev.ebi.ac.uk)
  - Use a version number like "1.2.3" for proper releases
- Ensure install, lint, and rebuild works locally
- Update `CHANGELOG.md`
- Git commit and push
- Create a git tag matching the version with prepended "v" (e.g. "v1.2.3")
- The GitHub repo will automatically be mirrored to EBI GitLab (might take up to 1 hour)
- CICD pipeline in EBI GitLab will automatically publish the package to npm (https://www.npmjs.com/package/pdbe-molstar)
- The files will become available via JSDeliver
  - https://cdn.jsdelivr.net/npm/pdbe-molstar@dev/build/pdbe-molstar-plugin.js for the latest version including development versions
  - https://cdn.jsdelivr.net/npm/pdbe-molstar@latest/build/pdbe-molstar-plugin.js for the latest proper release
