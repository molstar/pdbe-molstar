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
