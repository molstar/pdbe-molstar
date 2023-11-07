# Change Log
All notable changes to this project will be documented in this file, following the suggestions of [Keep a CHANGELOG](http://keepachangelog.com/). This project adheres to [Semantic Versioning](http://semver.org/) for its most widely used - and defacto - public interfaces.

## [Unreleased]

## [v3.1.3]
- Added ``Assembly Symmetry`` to structure controls, requires setting ``symmetryAnnotation`` in initialization parameters
- Keep sequence panel in settings even when initially hidden
- Changed `tsconfig.json` to place `tsconfig.tsbuildinfo` correctly (for incremental build)
- Fixed coloring after annotation is switched off (revert to `chain-id`, not `polymer-id`)
- Loading overlay with animated PDBe logo (requires initParam `loadingOverlay`)
- Use linting to keep code nice

## [v3.1.2]
- Added PDBe Sifts Mappings module to solve UniPort mappings issue
- Split Webpack config file into separate files for Production and Development

## [v3.1.1]
- Controls menu visible for AlphaFold view
- ``Reactive`` parameter addition for better responsive layout support

## [v3.1.0]
- Mol* core dependency updated to V3.15.0
- Superposition view - added option to superpose AlphaFold model
- UniPort residue numbering param addition to higlight and selection helper methods
- New param to display Sequence panel [62](https://github.com/molstar/pdbe-molstar/issues/62)

## [v1.2.1] - 2021-12-03
- Selection helper method ``representationColor`` param issue fix

## [v1.2.0] - 2021-09-20
- Add parameters to support AlphaFold Protein Structure DB view
- Add parameters to customize mouse events, issues [#8](https://github.com/PDBeurope/pdbe-molstar/issues/8) 
- Add parameter to customize ``lighting`` setting
- Extend ``Selection / highlight`` helper methods to support ``label_atom_id`` list, issues [#32](https://github.com/PDBeurope/pdbe-molstar/issues/32)
- Extend helper methods support for multiple structures
- Extend ``hideCanvasControls``
- Fix Frame rate drop issue while rotating the canvas
- Fix RGB color issue for params starting with r:0